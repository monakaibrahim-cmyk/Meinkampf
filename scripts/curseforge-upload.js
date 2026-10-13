import { readFileSync, existsSync, readdirSync, writeFileSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = resolve(rootDir, "dist");
const bpManifestPath = resolve(rootDir, "behavior_pack", "manifest.json");

/**
 * Searches the dist/ directory for the built .mcaddon file.
 */
function findMcAddonFile(targetVersion) {
    if (!existsSync(distDir)) return null;

    // 1. Check versioned subfolder: dist/v<version>/
    if (targetVersion) {
        const cleanVersion = targetVersion.replace(/^v/, "");
        const versionDir = resolve(distDir, `v${cleanVersion}`);
        if (existsSync(versionDir)) {
            const entries = readdirSync(versionDir);
            const addon = entries.find((e) => e.endsWith(".mcaddon"));
            if (addon) return resolve(versionDir, addon);
        }
    }

    // 2. Scan entire dist directory recursively
    const queue = [distDir];
    let fallbackAddon = null;

    while (queue.length > 0) {
        const curr = queue.shift();
        const entries = readdirSync(curr, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = resolve(curr, entry.name);
            if (entry.isDirectory()) {
                queue.push(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".mcaddon")) {
                if (targetVersion && entry.name.includes(targetVersion.replace(/^v/, ""))) {
                    return fullPath;
                }
                if (!fallbackAddon) {
                    fallbackAddon = fullPath;
                }
            }
        }
    }

    return fallbackAddon;
}

/**
 * Resolves changelog content from CHANGELOG_PATH or update files.
 */
function getChangelogContent(targetVersion) {
    const changelogPath = process.env.CHANGELOG_PATH;
    if (changelogPath && existsSync(changelogPath)) {
        try {
            return readFileSync(changelogPath, "utf8").trim();
        } catch {
            // Fallback
        }
    }

    if (targetVersion) {
        const cleanVersion = targetVersion.replace(/^v/, "");
        const updateDoc = resolve(rootDir, "update", `v${cleanVersion}.md`);
        if (existsSync(updateDoc)) {
            try {
                return readFileSync(updateDoc, "utf8").trim();
            } catch {
                // Fallback
            }
        }
    }

    if (existsSync(resolve(rootDir, "prerelease_notes.md"))) {
        try {
            return readFileSync(resolve(rootDir, "prerelease_notes.md"), "utf8").trim();
        } catch {
            // Fallback
        }
    }

    return "";
}

/**
 * Reads min_engine_version from behavior_pack/manifest.json.
 */
function getMinEngineVersion() {
    try {
        if (existsSync(bpManifestPath)) {
            const manifest = JSON.parse(readFileSync(bpManifestPath, "utf8"));
            if (Array.isArray(manifest?.header?.min_engine_version)) {
                return manifest.header.min_engine_version.join(".");
            }
        }
    } catch {
        // Fallback
    }
    return "1.21.0";
}

/**
 * Helper to query game versions from a CurseForge endpoint.
 * When isBedrockDefault is false, requires an explicit Bedrock version-type match
 * to prevent Java Minecraft versions from being falsely matched.
 */
async function queryEndpointVersions(baseUrl, headers, targetEngineVersion, isBedrockDefault) {
    let bedrockTypeIds = new Set();
    try {
        const typeRes = await fetch(`${baseUrl}/api/game/version-types`, { headers });
        if (typeRes.ok) {
            const types = await typeRes.json();
            if (Array.isArray(types)) {
                for (const t of types) {
                    const name = (t.name || "").toLowerCase();
                    const slug = (t.slug || "").toLowerCase();
                    if (name.includes("bedrock") || slug.includes("bedrock")) {
                        bedrockTypeIds.add(t.id);
                    }
                }
            }
        }
    } catch {
        // Silently continue
    }

    // If this endpoint is not a dedicated Bedrock subdomain and has no Bedrock types,
    // it hosts Java versions only. Do not match any versions from it.
    if (!isBedrockDefault && bedrockTypeIds.size === 0) {
        return [];
    }

    try {
        const verRes = await fetch(`${baseUrl}/api/game/versions`, { headers });
        if (!verRes.ok) return [];

        const allVersions = await verRes.json();
        if (!Array.isArray(allVersions)) return [];

        const matchedIds = [];
        const majorMinor = targetEngineVersion.split(".").slice(0, 2).join("."); // e.g. "1.21"

        for (const v of allVersions) {
            const vName = v.name || "";
            const vSlug = v.slug || "";
            const isBedrockType = isBedrockDefault || bedrockTypeIds.has(v.gameVersionTypeID);
            if (!isBedrockType) continue;

            const matchesVersion =
                vName === targetEngineVersion ||
                vName === majorMinor ||
                vSlug === targetEngineVersion.replace(/\./g, "-") ||
                vSlug === majorMinor.replace(/\./g, "-") ||
                vName.startsWith(majorMinor);

            if (matchesVersion && typeof v.id === "number") {
                matchedIds.push(v.id);
            }
        }

        return matchedIds;
    } catch {
        return [];
    }
}

/**
 * Fetches game version IDs from CurseForge API matching Bedrock Edition and engine version.
 * Strictly guarantees that Java Edition version IDs are never returned.
 */
async function fetchCurseForgeGameVersions(apiKey, targetEngineVersion) {
    const headers = {
        "X-Api-Token": apiKey,
        "x-api-key": apiKey,
        "Accept": "application/json",
    };

    const majorMinor = targetEngineVersion.split(".").slice(0, 2).join("."); // e.g. "1.21"

    // 1. Try dedicated Bedrock endpoint: https://bedrock.curseforge.com
    try {
        const bedrockVersions = await queryEndpointVersions("https://bedrock.curseforge.com", headers, targetEngineVersion, true);
        if (bedrockVersions.length > 0) {
            console.log(`[CurseForge] Matched ${bedrockVersions.length} game version ID(s) from bedrock.curseforge.com for ${targetEngineVersion}: [${bedrockVersions.join(", ")}]`);
            return bedrockVersions;
        }
    } catch {
        // Continue to next strategy
    }

    // 2. Try CurseForge Core API for Bedrock (Game ID: 78022)
    try {
        const coreRes = await fetch("https://api.curseforge.com/v1/games/78022/versions", { headers });
        if (coreRes.ok) {
            const json = await coreRes.json();
            const versions = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
            const matchedIds = [];
            for (const v of versions) {
                const vName = v.name || "";
                const vSlug = v.slug || "";
                const matches =
                    vName === targetEngineVersion ||
                    vName === majorMinor ||
                    vSlug === targetEngineVersion.replace(/\./g, "-") ||
                    vSlug === majorMinor.replace(/\./g, "-") ||
                    vName.startsWith(majorMinor);
                if (matches && typeof v.id === "number") {
                    matchedIds.push(v.id);
                }
            }
            if (matchedIds.length > 0) {
                console.log(`[CurseForge] Matched ${matchedIds.length} game version ID(s) from Core API (78022) for ${targetEngineVersion}: [${matchedIds.join(", ")}]`);
                return matchedIds;
            }
        }
    } catch {
        // Continue to next strategy
    }

    // 3. Try https://minecraft.curseforge.com ONLY if Bedrock version types are explicitly identified
    try {
        const mcVersions = await queryEndpointVersions("https://minecraft.curseforge.com", headers, targetEngineVersion, false);
        if (mcVersions.length > 0) {
            console.log(`[CurseForge] Matched ${mcVersions.length} verified Bedrock game version ID(s) for ${targetEngineVersion}: [${mcVersions.join(", ")}]`);
            return mcVersions;
        }
    } catch {
        // Continue
    }

    console.log(`[CurseForge] Note: No verified Bedrock version IDs found on CurseForge API. Omitting gameVersions tag to prevent Error 1008.`);
    return [];
}

/**
 * Uploads file with given metadata to a CurseForge endpoint.
 */
async function uploadToCurseForge(url, apiKey, addonFile, metadata) {
    const fileBytes = readFileSync(addonFile);
    const fileBlob = new Blob([fileBytes], { type: "application/octet-stream" });

    const form = new FormData();
    form.append("file", fileBlob, basename(addonFile));
    form.append("metadata", JSON.stringify(metadata));

    return await fetch(url, {
        method: "POST",
        headers: {
            "X-Api-Token": apiKey,
            "x-api-key": apiKey,
            "Accept": "application/json",
        },
        body: form,
    });
}

/**
 * Handles post-upload success logging and output variable registration.
 */
function handleSuccess(data, projectId) {
    console.log("=================================================");
    console.log(`[CurseForge] SUCCESS! Published file ID: ${data.id}`);
    console.log(`[CurseForge] View project: https://www.curseforge.com/projects/${projectId}`);
    console.log("=================================================");

    const ghOutput = process.env.GITHUB_OUTPUT;
    if (ghOutput && existsSync(ghOutput)) {
        try {
            const out = `curseforge_file_id=${data.id}\n`;
            writeFileSync(ghOutput, out, { flag: "a" });
        } catch {}
    }
}

/**
 * Main execution function for publishing to CurseForge.
 */
async function main() {
    console.log("=== CurseForge Automated Publisher ===");

    const apiKey = (process.env.CURSEFORGE_API_KEY || process.env.CURSEFORGE_TOKEN || "").trim();
    const projectId = (process.env.CURSEFORGE_PROJECT_ID || "").trim();

    if (!apiKey) {
        console.log("[CurseForge] CURSEFORGE_API_KEY is not configured. Skipping CurseForge upload.");
        process.exit(0);
    }

    if (!projectId) {
        console.log("[CurseForge] CURSEFORGE_PROJECT_ID is not configured. Skipping CurseForge upload.");
        process.exit(0);
    }

    // Read package info
    let pkgVersion = "1.0.0";
    try {
        const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
        pkgVersion = pkg.version || "1.0.0";
    } catch {}

    const releaseTag = (process.env.RELEASE_TAG || `v${pkgVersion}`).trim();
    const isPrerelease = process.env.IS_PRERELEASE === "true";
    const releaseType = process.env.CURSEFORGE_RELEASE_TYPE || (isPrerelease ? "beta" : "release");
    const releaseTitle = process.env.RELEASE_TITLE || `Bedrock QoL Suite ${releaseTag}`;

    // Locate the .mcaddon file
    const addonFile = findMcAddonFile(pkgVersion);
    if (!addonFile || !existsSync(addonFile)) {
        console.error(`[CurseForge] Error: No .mcaddon build artifact found in ${distDir}. Run 'npm run pack' first.`);
        if (process.env.CURSEFORGE_STRICT === "true") {
            process.exit(1);
        }
        process.exit(0);
    }

    console.log(`[CurseForge] Found addon package: ${basename(addonFile)}`);
    console.log(`[CurseForge] Project ID:         ${projectId}`);
    console.log(`[CurseForge] Release Type:       ${releaseType}`);
    console.log(`[CurseForge] Display Name:       ${releaseTitle}`);

    // Retrieve changelog
    let changelog = getChangelogContent(pkgVersion);
    if (!changelog) {
        changelog = `### ${releaseTitle}\n\nAutomated build of Bedrock QoL Suite (${releaseTag}).`;
    }

    // Determine target game versions
    const minEngineVer = getMinEngineVersion();
    let gameVersionIds = [];

    if (process.env.CURSEFORGE_GAME_VERSION_IDS) {
        gameVersionIds = process.env.CURSEFORGE_GAME_VERSION_IDS.split(",")
            .map((id) => parseInt(id.trim(), 10))
            .filter((n) => !isNaN(n));
        console.log(`[CurseForge] Using explicit game version IDs from env: [${gameVersionIds.join(", ")}]`);
    } else {
        gameVersionIds = await fetchCurseForgeGameVersions(apiKey, minEngineVer);
    }

    // Construct metadata
    const metadata = {
        changelog: changelog,
        changelogType: "markdown",
        displayName: releaseTitle,
        parentFileId: null,
        releaseType: releaseType,
    };

    if (gameVersionIds.length > 0) {
        metadata.gameVersions = gameVersionIds;
    }

    // Determine upload endpoints to attempt
    let uploadEndpoints = [];
    if (process.env.CURSEFORGE_UPLOAD_URL) {
        uploadEndpoints.push(process.env.CURSEFORGE_UPLOAD_URL);
    } else if (process.env.CURSEFORGE_ENDPOINT) {
        uploadEndpoints.push(`https://${process.env.CURSEFORGE_ENDPOINT}.curseforge.com/api/projects/${projectId}/upload-file`);
        uploadEndpoints.push(`https://minecraft.curseforge.com/api/projects/${projectId}/upload-file`);
    } else {
        uploadEndpoints.push(`https://minecraft.curseforge.com/api/projects/${projectId}/upload-file`);
        uploadEndpoints.push(`https://bedrock.curseforge.com/api/projects/${projectId}/upload-file`);
    }

    let uploadSucceeded = false;

    for (let i = 0; i < uploadEndpoints.length; i++) {
        const uploadUrl = uploadEndpoints[i];
        console.log(`[CurseForge] Uploading to ${uploadUrl} ...`);

        try {
            let response = await uploadToCurseForge(uploadUrl, apiKey, addonFile, metadata);

            if (!response.ok) {
                const errBody = await response.text();

                // If error is 1008 (Invalid game version ID), retry without gameVersions
                const isInvalidGameVersionErr =
                    response.status === 400 &&
                    (errBody.includes("1008") ||
                     errBody.includes("belongs to an invalid game") ||
                     errBody.includes("Invalid game version ID"));

                if (isInvalidGameVersionErr && metadata.gameVersions && metadata.gameVersions.length > 0) {
                    console.warn(`[CurseForge] Server rejected game version IDs (${errBody.trim()}).`);
                    console.log(`[CurseForge] Retrying upload without gameVersions tag...`);
                    const retryMeta = { ...metadata };
                    delete retryMeta.gameVersions;

                    response = await uploadToCurseForge(uploadUrl, apiKey, addonFile, retryMeta);
                    if (response.ok) {
                        const data = await response.json();
                        handleSuccess(data, projectId);
                        uploadSucceeded = true;
                        break;
                    } else {
                        const retryErr = await response.text();
                        console.error(`[CurseForge] Retry upload failed (HTTP ${response.status}): ${retryErr}`);
                    }
                } else if (response.status === 404 && i + 1 < uploadEndpoints.length) {
                    console.warn(`[CurseForge] Endpoint ${uploadUrl} returned 404. Trying fallback endpoint...`);
                    continue;
                } else {
                    console.error(`[CurseForge] Upload failed (HTTP ${response.status}): ${errBody}`);
                }
            } else {
                const data = await response.json();
                handleSuccess(data, projectId);
                uploadSucceeded = true;
                break;
            }
        } catch (err) {
            console.error(`[CurseForge] Network error during upload to ${uploadUrl}:`, err.message);
            if (i + 1 < uploadEndpoints.length) {
                console.log("[CurseForge] Trying fallback endpoint...");
                continue;
            }
        }
    }

    if (!uploadSucceeded) {
        if (process.env.CURSEFORGE_STRICT === "true") {
            process.exit(1);
        }
        process.exit(0);
    }
}

main().catch((err) => {
    console.error("[CurseForge] Unexpected fatal error:", err);
    process.exit(process.env.CURSEFORGE_STRICT === "true" ? 1 : 0);
});
