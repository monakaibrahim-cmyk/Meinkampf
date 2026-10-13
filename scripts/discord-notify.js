import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = resolve(rootDir, "dist");

/**
 * Searches dist directory for the built .mcaddon file.
 */
function findMcAddonFile(targetVersion) {
    if (!existsSync(distDir)) return null;

    // 1. Check versioned subfolder: dist/v<version>/BedrockQoL_<version>.mcaddon
    const versionDir = resolve(distDir, `v${targetVersion}`);
    if (existsSync(versionDir)) {
        const directMatch = resolve(versionDir, `BedrockQoL_${targetVersion}.mcaddon`);
        if (existsSync(directMatch)) return directMatch;

        const entries = readdirSync(versionDir);
        const addon = entries.find((e) => e.endsWith(".mcaddon"));
        if (addon) return resolve(versionDir, addon);
    }

    // 2. Scan entire dist directory recursively for any .mcaddon matching targetVersion
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
                if (entry.name.includes(targetVersion)) {
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
 * Resolves the patch notes or changelog markdown file for the release.
 */
function findPatchNotesFile(targetVersion) {
    if (process.env.CHANGELOG_PATH && existsSync(process.env.CHANGELOG_PATH)) {
        return resolve(process.env.CHANGELOG_PATH);
    }

    const candidates = [
        resolve(rootDir, `update/v${targetVersion}.md`),
        resolve(rootDir, "prerelease_notes.md"),
        resolve(rootDir, "release_notes.md")
    ];

    for (const cand of candidates) {
        if (existsSync(cand)) return cand;
    }

    return null;
}

/**
 * Sends rich Discord notifications with optional file attachments (for releases).
 * Exits gracefully without failing CI if no webhook is configured.
 */
async function sendDiscordNotification() {
    const eventType = process.argv[2] || "commit";

    // Allow dedicated release webhook channel (falling back to general webhook)
    const webhookUrl = eventType === "release"
        ? (process.env.DISCORD_RELEASE_WEBHOOK || process.env.DISCORD_WEBHOOK || "")
        : (process.env.DISCORD_DEV_WEBHOOK || process.env.DISCORD_WEBHOOK || "");

    if (!webhookUrl) {
        const targetEnv = eventType === "release" ? "DISCORD_RELEASE_WEBHOOK or DISCORD_WEBHOOK" : "DISCORD_WEBHOOK";
        console.log(`[Discord Notify] ${targetEnv} is not configured. Skipping '${eventType}' notification.`);
        return;
    }

    // Git and CI metadata
    const repo = process.env.GITHUB_REPOSITORY || "BedrockQoL";
    const refName = process.env.GITHUB_REF_NAME || getCurrentBranch();
    const sha = process.env.GITHUB_SHA || getCurrentCommitSha();
    const shortSha = sha ? sha.slice(0, 7) : "HEAD";
    const actor = process.env.GITHUB_ACTOR || getCurrentGitAuthor();
    const runId = process.env.GITHUB_RUN_ID || "";
    const runNumber = process.env.GITHUB_RUN_NUMBER || "1";

    let version = "1.0.0";
    try {
        const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
        version = pkg.version || version;
    } catch {
        // Fallback
    }

    const repoUrl = `https://github.com/${repo}`;
    const commitUrl = sha ? `${repoUrl}/commit/${sha}` : repoUrl;
    const actionUrl = runId ? `${repoUrl}/actions/runs/${runId}` : `${repoUrl}/actions`;

    let embed = {};
    const filesToAttach = [];

    switch (eventType) {
        case "commit": {
            const commitMessage = getLatestCommitMessage();
            embed = {
                title: `🔨 New Commit on \`${refName}\``,
                url: commitUrl,
                color: 0x5865F2, // Discord Blurple
                fields: [
                    { name: "Repository", value: `[${repo}](${repoUrl})`, inline: true },
                    { name: "Branch", value: `\`${refName}\``, inline: true },
                    { name: "Author", value: `\`${actor}\``, inline: true },
                    { name: "Commit", value: `[\`${shortSha}\`](${commitUrl})`, inline: true },
                    { name: "Version", value: `\`v${version}\``, inline: true },
                    {
                        name: "Commit Message",
                        value: commitMessage ? `\`\`\`\n${commitMessage.slice(0, 1000)}\n\`\`\`` : "*No commit message*"
                    }
                ],
                footer: { text: "Bedrock QoL Suite • CI/CD" },
                timestamp: new Date().toISOString()
            };
            break;
        }

        case "release": {
            const rawTag = process.env.RELEASE_TAG || `v${version}`;
            const cleanVersion = rawTag.replace(/^v/, "").split("-")[0];
            const title = process.env.RELEASE_TITLE || `Bedrock QoL Suite ${rawTag}`;
            const isPrerelease = process.env.IS_PRERELEASE === "true" || refName === "development";
            const releaseUrl = `${repoUrl}/releases/tag/${rawTag}`;

            // 1. Locate and prepare .mcaddon attachment
            const addonPath = findMcAddonFile(cleanVersion);
            if (addonPath && existsSync(addonPath)) {
                try {
                    const stat = statSync(addonPath);
                    const maxDiscordBytes = 24 * 1024 * 1024; // 24 MB safe threshold for Discord's 25 MB limit
                    if (stat.size <= maxDiscordBytes) {
                        filesToAttach.push({
                            filename: basename(addonPath),
                            buffer: readFileSync(addonPath),
                            contentType: "application/octet-stream",
                            sizeKb: Math.round(stat.size / 1024)
                        });
                        console.log(`[Discord Notify] Attaching addon: ${basename(addonPath)} (${Math.round(stat.size / 1024)} KB)`);
                    } else {
                        console.warn(`[Discord Notify] Addon exceeds Discord size limit: ${stat.size} bytes`);
                    }
                } catch (err) {
                    console.warn("[Discord Notify] Failed to read addon file:", err.message);
                }
            } else {
                console.warn(`[Discord Notify] No .mcaddon found for version ${cleanVersion}`);
            }

            // 2. Locate and read patch notes / changelog
            const patchNotesPath = findPatchNotesFile(cleanVersion);
            let patchNotesText = "";
            if (patchNotesPath && existsSync(patchNotesPath)) {
                try {
                    patchNotesText = readFileSync(patchNotesPath, "utf8").trim();
                } catch (err) {
                    console.warn("[Discord Notify] Failed to read patch notes:", err.message);
                }
            }

            // 3. Prepare description with highlights and full changelog in embed
            let descriptionPrefix = isPrerelease
                ? `⚠️ **Development Preview Build (${rawTag})** is ready for testing!\nDownload the attached \`.mcaddon\` below to install directly into Minecraft Bedrock.`
                : `🎉 **New Official Release (${rawTag})** is now live!\nDownload the attached \`.mcaddon\` below to install directly into Minecraft Bedrock.`;

            let changelogSection = "";
            if (patchNotesText) {
                // Discord embed description limit is 4096 characters (keep under 3600 for safe headroom)
                const maxChangelogLen = 3600;
                if (patchNotesText.length > maxChangelogLen) {
                    changelogSection = `\n\n### 📋 Changelog\n` +
                        patchNotesText.slice(0, maxChangelogLen).trim() +
                        `\n\n... *(view complete changelog on [GitHub Releases](${releaseUrl}))*`;
                } else {
                    changelogSection = `\n\n### 📋 Changelog\n` + patchNotesText;
                }
            }

            embed = {
                title: isPrerelease ? `🧪 Beta Release: ${title}` : `🚀 Official Release: ${title}`,
                url: releaseUrl,
                color: isPrerelease ? 0xF1C40F : 0x2ECC71, // Gold for Beta, Green for Stable
                description: descriptionPrefix + changelogSection,
                fields: [
                    { name: "Tag", value: `[\`${rawTag}\`](${releaseUrl})`, inline: true },
                    { name: "Channel", value: isPrerelease ? "Beta / Development" : "Stable Release", inline: true },
                    { name: "Target", value: `\`${refName}\``, inline: true }
                ],
                footer: { text: "Bedrock QoL Suite • Releases" },
                timestamp: new Date().toISOString()
            };

            if (filesToAttach.length > 0) {
                const attachmentList = filesToAttach
                    .map((f) => `📎 **\`${f.filename}\`** (${f.sizeKb} KB)`)
                    .join("\n");
                embed.fields.push({
                    name: "Attached Addon File",
                    value: attachmentList,
                    inline: false
                });
            }

            embed.fields.push({
                name: "GitHub Release & Assets",
                value: `[View Full Release on GitHub](${releaseUrl})`,
                inline: false
            });

            break;
        }

        case "failure": {
            embed = {
                title: `❌ CI Build Failed`,
                url: actionUrl,
                color: 0xED4245, // Red
                description: `Workflow run failed on branch \`${refName}\`. Please review the CI logs for details.`,
                fields: [
                    { name: "Branch", value: `\`${refName}\``, inline: true },
                    { name: "Commit", value: `[\`${shortSha}\`](${commitUrl})`, inline: true },
                    { name: "Author", value: `\`${actor}\``, inline: true },
                    { name: "Workflow Run", value: `[#${runNumber} Logs](${actionUrl})`, inline: true }
                ],
                footer: { text: "Bedrock QoL Suite • Action Check Failed" },
                timestamp: new Date().toISOString()
            };
            break;
        }

        default: {
            embed = {
                title: `Notice: ${eventType}`,
                color: 0x3498DB,
                description: `Event \`${eventType}\` triggered on repository ${repo}.`,
                timestamp: new Date().toISOString()
            };
        }
    }

    const payload = {
        username: process.env.DISCORD_USERNAME || "Meinkampf",
        embeds: [embed]
    };

    try {
        let response;
        if (filesToAttach.length > 0) {
            const formData = new FormData();
            formData.append("payload_json", JSON.stringify(payload));

            for (let i = 0; i < filesToAttach.length; i++) {
                const file = filesToAttach[i];
                const blob = new Blob([file.buffer], { type: file.contentType });
                formData.append(`files[${i}]`, blob, file.filename);
            }

            response = await fetch(webhookUrl, {
                method: "POST",
                body: formData
            });
        } else {
            response = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        if (response.ok) {
            console.log(`[Discord Notify] Successfully sent '${eventType}' notification with ${filesToAttach.length} attachment(s).`);
        } else {
            console.warn(`[Discord Notify] Webhook returned status ${response.status}: ${await response.text()}`);
        }
    } catch (err) {
        console.warn(`[Discord Notify] Failed to send webhook:`, err.message);
    }
}

function getCurrentBranch() {
    try {
        return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
    } catch {
        return "main";
    }
}

function getCurrentCommitSha() {
    try {
        return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {
        return "";
    }
}

function getCurrentGitAuthor() {
    try {
        return execSync("git log -1 --pretty=%an", { encoding: "utf8" }).trim();
    } catch {
        return "developer";
    }
}

function getLatestCommitMessage() {
    try {
        return execSync("git log -1 --pretty=%B", { encoding: "utf8" }).trim();
    } catch {
        return "";
    }
}

sendDiscordNotification().catch((err) => {
    console.error("[Discord Notify] Unexpected error:", err);
    process.exit(0); // Do not break workflow
});
