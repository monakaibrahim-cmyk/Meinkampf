import { readFileSync, existsSync, writeFileSync } from "fs";
import { execSync } from "child_process";

/**
 * Checks if a commit modified actual Minecraft Bedrock addon code, behaviors, or resources.
 * Excludes tooling, CI/CD scripts, documentation, and metadata files.
 */
function isAddonCommit(commitHash) {
    try {
        const files = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { encoding: "utf8" });
        return files.split("\n").some((f) => {
            const trimmed = f.trim();
            return (
                trimmed.startsWith("src/") ||
                trimmed.startsWith("behavior_pack/") ||
                trimmed.startsWith("resource_pack/")
            );
        });
    } catch {
        return false;
    }
}

/**
 * Finds the latest stable release tag (ignoring beta/alpha tags and any tag pointing directly to HEAD).
 */
function getPreviousStableTag(targetTag) {
    try {
        const raw = execSync('git tag -l "v[0-9]*.[0-9]*.[0-9]*"', { encoding: "utf8" }).trim();
        if (!raw) return null;
        let tags = raw.split("\n")
            .map((t) => t.trim())
            .filter((t) => !t.includes("beta") && !t.includes("alpha"));
        if (tags.length === 0) return null;

        const headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
        tags = tags.filter((t) => {
            if (t === targetTag) {
                try {
                    const tagSha = execSync(`git rev-parse -q --verify "refs/tags/${t}^{commit}"`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
                    return tagSha !== "" && tagSha !== headSha;
                } catch {
                    return false;
                }
            }
            return true;
        });

        if (tags.length === 0) return null;

        tags.sort((a, b) => {
            const pa = a.replace(/^v/, "").split(".").map(Number);
            const pb = b.replace(/^v/, "").split(".").map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const na = pa[i] || 0;
                const nb = pb[i] || 0;
                if (na !== nb) return na - nb;
            }
            return 0;
        });
        return tags[tags.length - 1] || null;
    } catch {
        return null;
    }
}

/**
 * Checks whether a tag already exists and HEAD has progressed past it.
 */
function isTagAlreadyReleased(tag) {
    try {
        const tagSha = execSync(`git rev-parse -q --verify "refs/tags/${tag}^{commit}"`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
        const headSha = execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
        return tagSha !== "" && tagSha !== headSha;
    } catch {
        return false;
    }
}

/**
 * Finds the latest commit that modified addon code/assets for preview highlights.
 */
function getLatestAddonCommit() {
    try {
        const raw = execSync("git log -n 25 --pretty=format:'%H'", { encoding: "utf8" }).trim();
        const hashes = raw.split("\n").filter(Boolean);
        for (const h of hashes) {
            if (isAddonCommit(h)) {
                const subject = execSync(`git log -1 --pretty=%s ${h}`, { encoding: "utf8" }).trim();
                const body = execSync(`git log -1 --pretty=%b ${h}`, { encoding: "utf8" }).trim();
                const author = execSync(`git log -1 --pretty=%an ${h}`, { encoding: "utf8" }).trim();
                return { hash: h, subject, body, author };
            }
        }
    } catch {
        // Fallback
    }
    return null;
}

/**
 * Generates an addon-only release changelog from git history for main releases.
 * Categorizes changes into Features, Fixes & Improvements, and Other Updates.
 * Excludes all tools, scripts, CI/CD, templates, and documentation commits.
 */
function generateAddonChangelog(version, repo, prevTag) {
    let commitLines = [];
    try {
        const range = prevTag ? `${prevTag}..HEAD` : "-n 50";
        const rawCommits = execSync(`git log ${range} --pretty=format:'%s|%h|%H'`, { encoding: "utf8" }).trim();
        if (rawCommits) {
            commitLines = rawCommits.split("\n").filter(Boolean);
        }
    } catch {
        // Fallback
    }

    const addonCommits = commitLines
        .map((line) => {
            const [subj, shortH, longH] = line.split("|");
            return { subject: subj, shortHash: shortH, fullHash: longH };
        })
        .filter((c) => isAddonCommit(c.fullHash));

    const features = addonCommits.filter((c) => /^feat(\(.*\))?:/i.test(c.subject));
    const fixes = addonCommits.filter((c) => /^(fix|perf|refactor)(\(.*\))?:/i.test(c.subject));
    const others = addonCommits.filter((c) => !features.includes(c) && !fixes.includes(c));

    let content = `# Bedrock QoL Suite — v${version} Release Notes\n\n`;
    content += `**Release Version:** \`v${version}\`  \n`;
    content += `**Compatibility:** Minecraft Bedrock Edition 1.21.0+ (\`@minecraft/server\` 2.10.0, \`@minecraft/server-ui\` 2.2.0)\n\n`;
    content += `---\n\n`;

    if (features.length > 0) {
        content += `### 🚀 New Features & Capabilities\n`;
        content += features.map((c) => `* ${c.subject} ([\`${c.shortHash}\`](https://github.com/${repo}/commit/${c.fullHash}))`).join("\n") + "\n\n";
    }

    if (fixes.length > 0) {
        content += `### 🐛 Fixes & Improvements\n`;
        content += fixes.map((c) => `* ${c.subject} ([\`${c.shortHash}\`](https://github.com/${repo}/commit/${c.fullHash}))`).join("\n") + "\n\n";
    }

    if (others.length > 0) {
        content += `### ⚡ Addon Updates\n`;
        content += others.map((c) => `* ${c.subject} ([\`${c.shortHash}\`](https://github.com/${repo}/commit/${c.fullHash}))`).join("\n") + "\n\n";
    }

    if (addonCommits.length === 0) {
        content += `### 📦 Release Notes\n`;
        content += `Quality-of-life enhancements and performance updates for Minecraft Bedrock Edition.\n\n`;
    }

    content += `---\n`;
    content += `*Download the \`.mcaddon\` bundle below to import directly into Minecraft Bedrock.*`;

    return content;
}

/**
 * Checks if a commit message indicates an experimental or new feature.
 */
function isFeatureOrExperimental(subject) {
    if (!subject || typeof subject !== "string") return false;
    const s = subject.trim();
    return (
        /^feat(\(.*\))?:/i.test(s) ||
        /experimental/i.test(s) ||
        /^feature(\(.*\))?:/i.test(s) ||
        /\b(feat|feature|experiment|experimental)\b/i.test(s)
    );
}

/**
 * Calculates separate sequential build numbers for Alpha and Beta channels.
 * - Alpha build numbers count experimental/feature commits for this version.
 * - Beta build numbers count bug fix/improvement commits for this version.
 * When the version in package.json changes, both alpha and beta counters revert to 1.
 */
function getChannelBuildNumber(version, channel) {
    if (channel === "alpha" && process.env.ALPHA_NUMBER) {
        const parsed = parseInt(process.env.ALPHA_NUMBER, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (channel === "beta" && process.env.BETA_NUMBER) {
        const parsed = parseInt(process.env.BETA_NUMBER, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (process.env.BUILD_NUMBER) {
        const parsed = parseInt(process.env.BUILD_NUMBER, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    try {
        const logCmd = `git log -S '"version": "${version}"' --reverse --pretty=format:%H package.json`;
        const output = execSync(logCmd, { encoding: "utf8" }).trim();
        if (output) {
            const bumpCommit = output.split("\n")[0].trim();
            if (bumpCommit) {
                let range = `${bumpCommit}..HEAD`;
                try {
                    execSync(`git rev-parse --verify "${bumpCommit}^"`, { stdio: "ignore" });
                    range = `${bumpCommit}^..HEAD`;
                } catch {
                    range = `${bumpCommit}..HEAD`;
                }

                const rawCommits = execSync(`git log ${range} --pretty=format:'%H|%s'`, { encoding: "utf8" }).trim();
                if (rawCommits) {
                    const commits = rawCommits.split("\n").filter(Boolean).map((line) => {
                        const [hash, ...subjParts] = line.split("|");
                        return { hash, subject: subjParts.join("|") };
                    });

                    let channelCount = 0;
                    for (const c of commits) {
                        const isFeat = isFeatureOrExperimental(c.subject);
                        if (channel === "alpha" && isFeat) {
                            channelCount++;
                        } else if (channel === "beta" && !isFeat) {
                            if (c.hash.startsWith(bumpCommit) && commits.length > 1) {
                                continue;
                            }
                            channelCount++;
                        }
                    }

                    if (channelCount > 0) return channelCount;
                }
            }
        }
    } catch {
        // Fallback
    }

    return 1;
}

/**
 * Smart filter for pre-release builds:
 * - Experimental / new features -> Alpha
 * - Bug fixes, performance improvements, refactors, and maintenance -> Beta
 */
function determineReleaseChannel(commits, refName) {
    if (refName && refName.startsWith("alpha")) return "alpha";
    if (refName && refName.startsWith("beta")) return "beta";
    if (process.env.RELEASE_CHANNEL) {
        const explicit = process.env.RELEASE_CHANNEL.toLowerCase();
        if (explicit === "alpha" || explicit === "beta") return explicit;
    }

    // Inspect the head/triggering commit for this build:
    // If the latest commit is a feature or experimental -> Alpha
    // If it's a bug fix, refactor, maintenance, etc. -> Beta
    const headCommit = Array.isArray(commits) && commits.length > 0 ? commits[0] : null;
    if (headCommit && headCommit.subject) {
        return isFeatureOrExperimental(headCommit.subject) ? "alpha" : "beta";
    }

    try {
        const latestSubject = execSync("git log -1 --pretty=%s", { encoding: "utf8" }).trim();
        if (isFeatureOrExperimental(latestSubject)) {
            return "alpha";
        }
    } catch {
        // Fallback
    }

    return "beta";
}

function getMetadata() {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const version = pkg.version || "1.0.0";

    const ref = process.env.GITHUB_REF || "";
    const refName = process.env.GITHUB_REF_NAME || getCurrentBranch();
    const sha = (process.env.GITHUB_SHA || getCurrentCommitSha()).slice(0, 7);
    const repo = process.env.GITHUB_REPOSITORY || "monakaibrahim-cmyk/Meinkampf";

    const isTag = ref.startsWith("refs/tags/");
    const isDevelopment = refName === "development" || refName.startsWith("dev/");

    let tag;
    let title;
    let channel = "release";
    let isPrerelease;
    let makeLatest;
    let changelogFile = "";

    if (isDevelopment) {
        const notesPath = "prerelease_notes.md";

        // 1. Get latest addon commit for highlight header and description
        const latestAddon = getLatestAddonCommit();

        // 2. Collect commit history on development ahead of main, or recent commits
        let commitLines = [];
        try {
            const rawCommits = execSync("git log origin/main..HEAD --pretty=format:'%s|%h|%H' 2>/dev/null || git log main..HEAD --pretty=format:'%s|%h|%H' 2>/dev/null", { encoding: "utf8" }).trim();
            if (rawCommits) {
                commitLines = rawCommits.split("\n").filter(Boolean);
            }
        } catch {
            // Fallback
        }

        if (commitLines.length === 0) {
            try {
                const rawCommits = execSync("git log -n 15 --pretty=format:'%s|%h|%H'", { encoding: "utf8" }).trim();
                commitLines = rawCommits.split("\n").filter(Boolean);
            } catch {
                // Fallback
            }
        }

        // Filter to include only addon commits (no tools, ci, docs, templates)
        const addonCommits = commitLines
            .map((line) => {
                const [subj, shortH, longH] = line.split("|");
                return { subject: subj, shortHash: shortH, fullHash: longH };
            })
            .filter((c) => isAddonCommit(c.fullHash));

        // 3. Smart filter: experimental/new features -> Alpha, fixes -> Beta
        channel = determineReleaseChannel(addonCommits.length > 0 ? addonCommits : (latestAddon ? [latestAddon] : []), refName);
        const buildNum = getChannelBuildNumber(version, channel);
        tag = `v${version}-${channel}.${buildNum}`;
        const channelDisplayName = channel === "alpha" ? "Alpha" : "Beta";
        title = `Bedrock QoL Suite v${version} (${channelDisplayName} #${buildNum})`;
        isPrerelease = "true";
        makeLatest = "false";

        let commitsMarkdown = "";
        if (addonCommits.length > 0) {
            commitsMarkdown = addonCommits
                .map((c) => `* ${c.subject} ([\`${c.shortHash}\`](https://github.com/${repo}/commit/${c.fullHash}))`)
                .join("\n");
        }

        // 3. Build comprehensive prerelease notes strictly for addon changes
        let notesContent = `### ⚠️ Development Preview Build (${tag})\n\n`;

        if (latestAddon) {
            notesContent += `#### 🚀 Latest Addon Feature: **${latestAddon.subject}**\n\n`;
            if (latestAddon.body) {
                notesContent += `**Description & Details:**\n\n${latestAddon.body}\n\n`;
            }
        }

        if (commitsMarkdown) {
            notesContent += `#### 📋 Included Addon Features in this Preview Build:\n${commitsMarkdown}\n\n`;
        }

        notesContent += `#### ℹ️ Build Information\n` +
            `- **Branch:** \`${refName}\`\n` +
            `- **Commit:** [\`${sha || "HEAD"}\`](https://github.com/${repo}/commit/${process.env.GITHUB_SHA || getCurrentCommitSha()})\n` +
            `- **Author:** \`${latestAddon?.author || "developer"}\`\n` +
            `- **Build:** \`#${buildNum}\`\n\n` +
            `*Download the attached \`.mcaddon\` file below to install and test directly in Minecraft Bedrock (1.21+).*`;

        writeFileSync(notesPath, notesContent, "utf8");
        changelogFile = notesPath;
    } else {
        tag = isTag ? refName : `v${version}`;
        title = `Bedrock QoL Suite ${tag}`;
        isPrerelease = "false";
        makeLatest = "true";

        const versionChangelog = `update/v${version}.md`;
        // Use custom update/v<version>.md if it exists AND is not an older already-tagged release
        if (existsSync(versionChangelog) && !isTagAlreadyReleased(tag)) {
            changelogFile = versionChangelog;
        } else {
            // Generate clean, addon-only release changelog from git history
            const prevTag = getPreviousStableTag(tag);
            const notes = generateAddonChangelog(version, repo, prevTag);
            const fallbackPath = "release_notes.md";
            writeFileSync(fallbackPath, notes, "utf8");
            changelogFile = fallbackPath;
        }
    }

    console.log(`Release Version:   ${version}`);
    console.log(`Release Tag:       ${tag}`);
    console.log(`Release Channel:   ${channel}`);
    console.log(`Release Title:     ${title}`);
    console.log(`Is Prerelease:     ${isPrerelease}`);
    console.log(`Make Latest:       ${makeLatest}`);
    console.log(`Changelog Path:    ${changelogFile}`);

    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        const outputs = [
            `version=${version}`,
            `tag=${tag}`,
            `channel=${channel}`,
            `title=${title}`,
            `is_prerelease=${isPrerelease}`,
            `make_latest=${makeLatest}`,
            `changelog=${changelogFile}`
        ].join("\n") + "\n";
        writeFileSync(outputFile, outputs, { flag: "a" });
    }
}

function getCurrentBranch() {
    try {
        return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
    } catch {
        return "development";
    }
}

function getCurrentCommitSha() {
    try {
        return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {
        return "HEAD";
    }
}

getMetadata();
