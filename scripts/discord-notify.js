import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

/**
 * Sends rich Discord notifications for repository events (commit, release, failure).
 * Exits gracefully without failing CI if DISCORD_WEBHOOK is not configured.
 */
async function sendDiscordNotification() {
    const webhookUrl = process.env.DISCORD_WEBHOOK || "";
    const eventType = process.argv[2] || "commit";

    if (!webhookUrl) {
        console.log(`[Discord Notify] DISCORD_WEBHOOK is not configured. Skipping '${eventType}' notification.`);
        return;
    }

    // Git / GitHub environment context
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
            const tag = process.env.RELEASE_TAG || `v${version}`;
            const title = process.env.RELEASE_TITLE || `Bedrock QoL Suite ${tag}`;
            const isPrerelease = process.env.IS_PRERELEASE === "true" || refName === "development";
            const releaseUrl = `${repoUrl}/releases/tag/${tag}`;

            embed = {
                title: isPrerelease ? `🧪 Beta Release: ${title}` : `🚀 Official Release: ${title}`,
                url: releaseUrl,
                color: isPrerelease ? 0xF1C40F : 0x2ECC71, // Gold for beta, Green for stable
                description: isPrerelease
                    ? `A new development preview build (\`${tag}\`) is now ready for testing!`
                    : `A new stable release (\`${tag}\`) is published and available for download.`,
                fields: [
                    { name: "Tag", value: `[\`${tag}\`](${releaseUrl})`, inline: true },
                    { name: "Branch", value: `\`${refName}\``, inline: true },
                    { name: "Channel", value: isPrerelease ? "Beta / Development" : "Stable Release", inline: true },
                    { name: "Build", value: `#${runNumber}`, inline: true },
                    { name: "Triggered By", value: `\`${actor}\``, inline: true },
                    { name: "Downloads", value: `[View Assets & Changelog](${releaseUrl})`, inline: true }
                ],
                footer: { text: "Bedrock QoL Suite • GitHub Releases" },
                timestamp: new Date().toISOString()
            };
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
        username: "Bedrock QoL CI",
        embeds: [embed]
    };

    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log(`[Discord Notify] Successfully sent '${eventType}' notification.`);
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
