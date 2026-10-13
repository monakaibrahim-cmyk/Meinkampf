import { execSync } from "child_process";
import { appendFileSync } from "fs";

/**
 * Smart filter for GitHub Actions CI and Releases:
 * Detects whether the triggering commit actually modifies addon code or assets.
 * Skips building / releasing if the commit only touches docs, readmes, configs, etc.
 */
function checkAddonChanges() {
    const ref = process.env.GITHUB_REF || "";
    const eventName = process.env.GITHUB_EVENT_NAME || "";

    // 1. Always build and release for manual triggers (workflow_dispatch) or version tags
    if (ref.startsWith("refs/tags/") || eventName === "workflow_dispatch") {
        console.log(`[Smart Filter] Triggered via ${eventName || "tag"} (${ref}): proceeding with build/release.`);
        setOutput("has_addon_changes", "true");
        return true;
    }

    // 2. Check latest commit message for manual skip directives
    let commitMsg = "";
    try {
        commitMsg = execSync("git log -1 --pretty=%B", { encoding: "utf8" }).trim();
    } catch {
        // Fallback
    }

    if (
        commitMsg.includes("[skip build]") ||
        commitMsg.includes("[skip release]") ||
        commitMsg.includes("[no release]") ||
        commitMsg.includes("[skip ci]")
    ) {
        console.log(`[Smart Filter] Commit message contains skip flag. Skipping build & release.`);
        setOutput("has_addon_changes", "false");
        return false;
    }

    // 3. Inspect changed files in the commit or push range
    let changedFiles = [];
    const beforeSha = process.env.BEFORE_SHA || "";
    let diffRange = "HEAD~1 HEAD";

    if (beforeSha && !/^0+$/.test(beforeSha)) {
        try {
            const diffOutput = execSync(`git diff --name-only ${beforeSha} HEAD`, { encoding: "utf8" });
            changedFiles = diffOutput.split("\n").map((f) => f.trim()).filter(Boolean);
            diffRange = `${beforeSha} HEAD`;
        } catch {
            // Fallback if beforeSha is not available
        }
    }

    if (changedFiles.length === 0) {
        try {
            const diffOutput = execSync("git diff --name-only HEAD~1 HEAD", { encoding: "utf8" });
            changedFiles = diffOutput.split("\n").map((f) => f.trim()).filter(Boolean);
            diffRange = "HEAD~1 HEAD";
        } catch {
            try {
                const showOutput = execSync('git show --pretty="" --name-only HEAD', { encoding: "utf8" });
                changedFiles = showOutput.split("\n").map((f) => f.trim()).filter(Boolean);
                diffRange = "HEAD";
            } catch {
                console.warn("[Smart Filter] Unable to read git diff; defaulting to false to avoid unwanted releases.");
                setOutput("has_addon_changes", "false");
                return false;
            }
        }
    }

    console.log(`[Smart Filter] Changed files in commit range (${changedFiles.length}):`);
    changedFiles.forEach((f) => console.log(`   - ${f}`));

    // Determine which files actually modify addon gameplay code, resources, or dependencies
    const addonChangedFiles = changedFiles.filter((file) => isAddonFile(file, diffRange));

    console.log(`[Smart Filter] Addon-affecting files (${addonChangedFiles.length}):`);
    addonChangedFiles.forEach((f) => console.log(`   * ${f}`));

    if (addonChangedFiles.length > 0) {
        console.log("[Smart Filter] Result: Addon updates or fixes detected. Proceeding with build & release.");
        setOutput("has_addon_changes", "true");
        return true;
    } else {
        console.log("[Smart Filter] Result: No addon gameplay, behavior, or resource files were changed (only docs, templates, CI, etc.). Skipping build & release.");
        setOutput("has_addon_changes", "false");
        return false;
    }
}

/**
 * Determines if a modified file affects the actual Minecraft Bedrock addon.
 */
function isAddonFile(filePath, diffRange) {
    // 1. Files that are strictly documentation, templates, git configurations, or tooling
    if (
        filePath.endsWith(".md") ||
        filePath.startsWith(".github/") ||
        filePath.startsWith("update/") ||
        filePath.startsWith("docs/") ||
        filePath === ".gitignore" ||
        filePath === ".gitmessage" ||
        filePath === ".gitattributes" ||
        filePath === "LICENSE" ||
        filePath.startsWith("LICENSE")
    ) {
        return false;
    }

    // 2. CI/CD notification and metadata scripts do not change the addon itself
    if (
        filePath === "scripts/check-addon-changes.js" ||
        filePath === "scripts/discord-notify.js" ||
        filePath === "scripts/release-metadata.js"
    ) {
        return false;
    }

    // 3. Direct addon source code, behavior pack, and resource pack assets
    if (
        filePath.startsWith("src/") ||
        filePath.startsWith("behavior_pack/") ||
        filePath.startsWith("resource_pack/")
    ) {
        return true;
    }

    // 4. Packaging logic script
    if (filePath === "scripts/pack.js") {
        return true;
    }

    // 5. package.json: only consider an addon change if dependencies changed (e.g. @minecraft/server)
    if (filePath === "package.json") {
        try {
            const diff = execSync(`git diff ${diffRange} -- package.json`, { encoding: "utf8" });
            return /"dependencies"|"@minecraft\//.test(diff);
        } catch {
            return false;
        }
    }

    return false;
}

function setOutput(key, value) {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        try {
            appendFileSync(outputFile, `${key}=${value}\n`, "utf8");
        } catch (err) {
            console.error("Failed to write to GITHUB_OUTPUT:", err);
        }
    }
}

checkAddonChanges();
