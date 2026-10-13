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
 * Fetches game version IDs from CurseForge API matching Bedrock Edition and engine version.
 */
async function fetchCurseForgeGameVersions(apiKey, targetEngineVersion) {
    const headers = {
        "X-Api-Token": apiKey,
        "x-api-key": apiKey,
        "Accept": "application/json",
    };

    try {
        // 1. Fetch version types to identify Bedrock version type ID
        let bedrockTypeIds = new Set();
        try {
            const typeRes = await fetch("https://minecraft.curseforge.com/api/game/version-types", { headers });
            if (typeRes.ok) {
                const types = await typeRes.json();
                for (const t of types) {
                    const name = (t.name || "").toLowerCase();
                    const slug = (t.slug || "").toLowerCase();
                    if (name.includes("bedrock") || slug.includes("bedrock")) {
                        bedrockTypeIds.add(t.id);
                    }
                }
            }
        } catch {
            // Continue with fallback matching
        }

        // 2. Fetch all game versions
        const verRes = await fetch("https://minecraft.curseforge.com/api/game/versions", { headers });
        if (!verRes.ok) {
            console.warn(`[CurseForge] Warning: Failed to query game versions (HTTP ${verRes.status}).`);
            return [];
        }

        const allVersions = await verRes.json();
        const matchedIds = [];

        const majorMinor = targetEngineVersion.split(".").slice(0, 2).join("."); // e.g. "1.21"

        for (const v of allVersions) {
            const vName = v.name || "";
            const vSlug = v.slug || "";
            const isBedrockType = bedrockTypeIds.size === 0 || bedrockTypeIds.has(v.gameVersionTypeID);

            // Match exact engine version or major.minor (e.g. 1.21.0 or 1.21)
            const matchesVersion =
                vName === targetEngineVersion ||
                vName === majorMinor ||
                vSlug === targetEngineVersion.replace(/\./g, "-") ||
                vSlug === majorMinor.replace(/\./g, "-") ||
                vName.startsWith(majorMinor);

            if (isBedrockType && matchesVersion) {
                matchedIds.push(v.id);
            }
        }

        if (matchedIds.length > 0) {
            console.log(`[CurseForge] Matched ${matchedIds.length} game version ID(s) for Minecraft Bedrock ${targetEngineVersion}: [${matchedIds.join(", ")}]`);
            return matchedIds;
        }

        // Fallback: match any Bedrock version if available
        for (const v of allVersions) {
            if (bedrockTypeIds.has(v.gameVersionTypeID)) {
                matchedIds.push(v.id);
                if (matchedIds.length >= 3) break;
            }
        }

        return matchedIds;
    } catch (err) {
        console.warn("[CurseForge] Warning: Could not fetch game versions from API:", err.message);
        return [];
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

    console.log(`[CurseForge] Uploading to https://minecraft.curseforge.com/api/projects/${projectId}/upload-file ...`);

    try {
        const fileBytes = readFileSync(addonFile);
        const fileBlob = new Blob([fileBytes], { type: "application/octet-stream" });

        const form = new FormData();
        form.append("file", fileBlob, basename(addonFile));
        form.append("metadata", JSON.stringify(metadata));

        const response = await fetch(`https://minecraft.curseforge.com/api/projects/${projectId}/upload-file`, {
            method: "POST",
            headers: {
                "X-Api-Token": apiKey,
                "x-api-key": apiKey,
                "Accept": "application/json",
            },
            body: form,
        });

        if (response.ok) {
            const data = await response.json();
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
            process.exit(0);
        } else {
            const errBody = await response.text();
            console.error(`[CurseForge] Upload failed (HTTP ${response.status}): ${errBody}`);
            if (process.env.CURSEFORGE_STRICT === "true") {
                process.exit(1);
            }
            process.exit(0);
        }
    } catch (err) {
        console.error(`[CurseForge] Error during upload:`, err.message);
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
