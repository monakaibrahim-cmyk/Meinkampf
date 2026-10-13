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
        commitMsg.includes("[no release]")
    ) {
        console.log(`[Smart Filter] Commit message contains skip flag ("${commitMsg}"). Skipping build & release.`);
        setOutput("has_addon_changes", "false");
        return false;
    }

    // 3. Inspect changed files in the commit or push range
    let changedFiles = [];
    const beforeSha = process.env.BEFORE_SHA || "";

    if (beforeSha && !/^0+$/.test(beforeSha)) {
        try {
            const diffOutput = execSync(`git diff --name-only ${beforeSha} HEAD`, { encoding: "utf8" });
            changedFiles = diffOutput.split("\n").map((f) => f.trim()).filter(Boolean);
        } catch {
            // Fallback if beforeSha is not available
        }
    }

    if (changedFiles.length === 0) {
        try {
            const diffOutput = execSync("git diff --name-only HEAD~1 HEAD", { encoding: "utf8" });
            changedFiles = diffOutput.split("\n").map((f) => f.trim()).filter(Boolean);
        } catch {
            try {
                const showOutput = execSync('git show --pretty="" --name-only HEAD', { encoding: "utf8" });
                changedFiles = showOutput.split("\n").map((f) => f.trim()).filter(Boolean);
            } catch {
                console.warn("[Smart Filter] Unable to read git diff; defaulting to true for safety.");
                setOutput("has_addon_changes", "true");
                return true;
            }
        }
    }

    console.log(`[Smart Filter] Changed files in commit (${changedFiles.length}):`);
    changedFiles.forEach((f) => console.log(`   - ${f}`));

    // Directories and files that directly constitute addon code, resources, or builds
    const addonPatterns = [
        /^src\//,
        /^behavior_pack\//,
        /^resource_pack\//,
        /^package\.json$/,
        /^package-lock\.json$/,
        /^tsconfig\.json$/,
        /^scripts\/pack\.js$/,
    ];

    const hasAddonChanges = changedFiles.some((file) =>
        addonPatterns.some((pattern) => pattern.test(file))
    );

    if (hasAddonChanges) {
        console.log("[Smart Filter] Result: Addon updates or fixes detected. Proceeding with build & release.");
        setOutput("has_addon_changes", "true");
        return true;
    } else {
        console.log("[Smart Filter] Result: Commit does NOT affect addon files (docs, configs, etc.). Skipping build & release.");
        setOutput("has_addon_changes", "false");
        return false;
    }
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
