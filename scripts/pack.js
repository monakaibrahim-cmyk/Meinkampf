import { Zip } from "zip-lib";
import { mkdirSync, existsSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { resolve, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = resolve(rootDir, "dist");
const bpDir = resolve(rootDir, "behavior_pack");
const rpDir = resolve(rootDir, "resource_pack");
const manifestPath = resolve(bpDir, "manifest.json");

// Extract mod version from behavior_pack/manifest.json
function getVersion() {
    try {
        if (existsSync(manifestPath)) {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
            if (Array.isArray(manifest?.header?.version)) {
                return manifest.header.version.join(".");
            }
        }
    } catch (err) {
        console.warn("Could not read version from manifest.json, defaulting to 1.0.0:", err);
    }
    return "1.0.0";
}

const modName = "BedrockQoL";
const version = getVersion();

// Target directory can be specified via CLI argument (e.g., node scripts/pack.js BedrockQoL_1.0.2)
// Defaults to the specified name-version directory "BedrockQoL_<version>" under dist/
const targetArg = process.argv[2];
const targetDirName = targetArg || `${modName}_${version}`;
const targetDir = isAbsolute(targetDirName) ? targetDirName : resolve(distDir, targetDirName);

const addonFileName = `${modName}_${version}.mcaddon`;
const addonOutFile = resolve(targetDir, addonFileName);

if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
}
if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
}

function cleanupOtherPackedFiles() {
    console.log("\n2. Cleanup: Removing other packed files...");
    const searchDirs = [distDir, targetDir];
    let removedCount = 0;

    for (const dir of new Set(searchDirs)) {
        if (!existsSync(dir)) continue;
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const fullPath = resolve(dir, entry.name);

            // Keep the freshly generated addon
            if (fullPath === addonOutFile) continue;

            // Remove any other packed files (.mcpack, older unversioned/mismatched .mcaddon)
            if (entry.name.endsWith(".mcpack") || entry.name.endsWith(".mcaddon")) {
                try {
                    unlinkSync(fullPath);
                    console.log(`   -> Removed packed file: ${entry.name} (${dir})`);
                    removedCount++;
                } catch (err) {
                    console.error(`   -> Failed to remove ${entry.name}:`, err);
                }
            }
        }
    }

    if (removedCount === 0) {
        console.log("   -> No other packed files found to clean up.");
    } else {
        console.log(`   -> Cleaned up ${removedCount} other packed file(s).`);
    }
}

async function packageAll() {
    console.log(`=== Packaging ${modName} v${version} ===`);
    console.log(`Target directory: ${targetDir}`);
    console.log(`Output file:      ${addonFileName}`);

    console.log(`\n1. Packaging Combined Add-On (${addonFileName})...`);
    const zip = new Zip();
    zip.addFolder(bpDir, "BedrockQoL_BP");
    zip.addFolder(rpDir, "BedrockQoL_RP");
    await zip.archive(addonOutFile);
    console.log(`   -> Created: ${addonOutFile}`);

    // Cleanup other packed files (.mcpack, etc.)
    cleanupOtherPackedFiles();

    console.log(`\nSuccess! Distribution package built successfully: ${addonOutFile}`);
}

packageAll().catch((err) => {
    console.error("Failed to package:", err);
    process.exit(1);
});
