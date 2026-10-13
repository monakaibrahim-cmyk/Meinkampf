import { Zip } from "zip-lib";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = resolve(rootDir, "dist");
const bpDir = resolve(rootDir, "behavior_pack");
const rpDir = resolve(rootDir, "resource_pack");
const bpManifestPath = resolve(bpDir, "manifest.json");
const rpManifestPath = resolve(rpDir, "manifest.json");
const pkgPath = resolve(rootDir, "package.json");

// Resource Pack UUID referenced in Behavior Pack dependencies
const RP_UUID = "c722186a-c379-414b-a9e6-8fd55187cbe4";

/**
 * Parses a version string (e.g. "1.0.3" or "v1.0.3") into a [major, minor, patch] number tuple.
 */
function parseVersionString(verStr) {
    if (!verStr || typeof verStr !== "string") return null;
    const cleaned = verStr.trim().replace(/^v/, "");
    const parts = cleaned.split(".").map((n) => parseInt(n, 10));
    if (parts.length === 3 && parts.every((n) => !isNaN(n) && n >= 0)) {
        return parts;
    }
    return null;
}

/**
 * Compares two version tuples: returns 1 if a > b, -1 if a < b, 0 if equal.
 */
function compareVersions(a, b) {
    for (let i = 0; i < 3; i++) {
        const valA = a[i] ?? 0;
        const valB = b[i] ?? 0;
        if (valA > valB) return 1;
        if (valA < valB) return -1;
    }
    return 0;
}

/**
 * Resolves the latest version from manifests and determines the target version.
 */
function resolveTargetVersion() {
    let bpVer = [1, 0, 0];
    let rpVer = [1, 0, 0];

    try {
        if (existsSync(bpManifestPath)) {
            const bp = JSON.parse(readFileSync(bpManifestPath, "utf8"));
            if (Array.isArray(bp?.header?.version) && bp.header.version.length === 3) {
                bpVer = bp.header.version;
            }
        }
    } catch {
        // Fallback
    }

    try {
        if (existsSync(rpManifestPath)) {
            const rp = JSON.parse(readFileSync(rpManifestPath, "utf8"));
            if (Array.isArray(rp?.header?.version) && rp.header.version.length === 3) {
                rpVer = rp.header.version;
            }
        }
    } catch {
        // Fallback
    }

    const currentLatest = compareVersions(bpVer, rpVer) >= 0 ? bpVer : rpVer;

    // Check CLI arguments
    const args = process.argv.slice(2);
    const isNoBump = args.includes("--no-bump") || args.includes("--keep-version") || process.env.NO_BUMP === "true";

    if (isNoBump) {
        console.log(`Using existing version: ${currentLatest.join(".")}`);
        return currentLatest;
    }

    const explicitArg = args.find((a) => !a.startsWith("-") && parseVersionString(a) !== null);
    if (explicitArg) {
        const explicitVersion = parseVersionString(explicitArg);
        console.log(`Explicit version specified: ${explicitVersion.join(".")}`);
        return explicitVersion;
    }

    // Auto-increment patch version if not specified
    const incremented = [currentLatest[0], currentLatest[1], currentLatest[2] + 1];
    console.log(`Auto-incrementing version: ${currentLatest.join(".")} -> ${incremented.join(".")}`);
    return incremented;
}

/**
 * Updates version in behavior_pack/manifest.json, resource_pack/manifest.json, and package.json.
 */
function updateManifestsAndPackage(versionTuple) {
    const versionStr = versionTuple.join(".");

    // 1. Behavior Pack Manifest
    if (existsSync(bpManifestPath)) {
        try {
            const bp = JSON.parse(readFileSync(bpManifestPath, "utf8"));
            bp.header.version = [...versionTuple];

            if (Array.isArray(bp.modules)) {
                for (const mod of bp.modules) {
                    mod.version = [...versionTuple];
                }
            }

            if (Array.isArray(bp.dependencies)) {
                for (const dep of bp.dependencies) {
                    if (dep.uuid === RP_UUID) {
                        dep.version = [...versionTuple];
                    }
                }
            }

            writeFileSync(bpManifestPath, JSON.stringify(bp, null, 2) + "\n", "utf8");
            console.log(`   -> Updated behavior_pack/manifest.json: [${versionTuple.join(", ")}]`);
        } catch (err) {
            console.error("Failed to update behavior_pack/manifest.json:", err);
        }
    }

    // 2. Resource Pack Manifest
    if (existsSync(rpManifestPath)) {
        try {
            const rp = JSON.parse(readFileSync(rpManifestPath, "utf8"));
            rp.header.version = [...versionTuple];

            if (Array.isArray(rp.modules)) {
                for (const mod of rp.modules) {
                    mod.version = [...versionTuple];
                }
            }

            writeFileSync(rpManifestPath, JSON.stringify(rp, null, 2) + "\n", "utf8");
            console.log(`   -> Updated resource_pack/manifest.json: [${versionTuple.join(", ")}]`);
        } catch (err) {
            console.error("Failed to update resource_pack/manifest.json:", err);
        }
    }

    // 3. package.json
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
            pkg.version = versionStr;
            writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
            console.log(`   -> Updated package.json: "${versionStr}"`);
        } catch (err) {
            console.error("Failed to update package.json:", err);
        }
    }
}

function cleanupOtherPackedFiles(outDir, keepFile) {
    console.log("\n3. Cleanup: Removing intermediate packed files...");
    const searchDirs = [distDir, outDir];
    let removedCount = 0;

    for (const dir of new Set(searchDirs)) {
        if (!existsSync(dir)) continue;
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const fullPath = resolve(dir, entry.name);

            if (fullPath === keepFile) continue;

            if (entry.name.endsWith(".mcpack") || entry.name.endsWith(".mcaddon")) {
                try {
                    unlinkSync(fullPath);
                    console.log(`   -> Removed: ${entry.name} (${dir})`);
                    removedCount++;
                } catch (err) {
                    console.error(`   -> Failed to remove ${entry.name}:`, err);
                }
            }
        }
    }

    if (removedCount === 0) {
        console.log("   -> No other packed files found.");
    } else {
        console.log(`   -> Cleaned up ${removedCount} other packed file(s).`);
    }
}

async function packageAll() {
    const modName = "BedrockQoL";
    const versionTuple = resolveTargetVersion();
    const version = versionTuple.join(".");

    console.log(`\n1. Syncing version to manifests (${version})...`);
    updateManifestsAndPackage(versionTuple);

    console.log("\n2. Building scripts bundle...");
    execSync("npm run build", { stdio: "inherit", cwd: rootDir });

    // Target folder is named v<version> (e.g. dist/v1.0.3)
    const targetDirName = `v${version}`;
    const targetDir = resolve(distDir, targetDirName);
    const addonFileName = `${modName}_${version}.mcaddon`;
    const addonOutFile = resolve(targetDir, addonFileName);

    if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
    }
    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
    }

    console.log(`\n=== Packaging ${modName} v${version} ===`);
    console.log(`Target directory: ${targetDir}`);
    console.log(`Output file:      ${addonFileName}`);

    const zip = new Zip();
    zip.addFolder(bpDir, "BedrockQoL_BP");
    zip.addFolder(rpDir, "BedrockQoL_RP");
    await zip.archive(addonOutFile);
    console.log(`   -> Created: ${addonOutFile}`);

    cleanupOtherPackedFiles(targetDir, addonOutFile);

    console.log(`\nSuccess! Distribution package built successfully: ${addonOutFile}`);
}

packageAll().catch((err) => {
    console.error("Failed to package:", err);
    process.exit(1);
});
