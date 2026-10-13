import { readFileSync, existsSync, writeFileSync } from "fs";
import { execSync } from "child_process";

function getMetadata() {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const version = pkg.version || "1.0.0";

    const ref = process.env.GITHUB_REF || "";
    const refName = process.env.GITHUB_REF_NAME || getCurrentBranch();
    const runNumber = process.env.GITHUB_RUN_NUMBER || "1";
    const sha = (process.env.GITHUB_SHA || getCurrentCommitSha()).slice(0, 7);
    const repo = process.env.GITHUB_REPOSITORY || "monakaibrahim-cmyk/Meinkampf";

    const isTag = ref.startsWith("refs/tags/");
    const isDevelopment = refName === "development" || refName.startsWith("dev/");

    let tag;
    let title;
    let isPrerelease;
    let makeLatest;
    let changelogFile = "";

    if (isDevelopment) {
        tag = `v${version}-beta.${runNumber}`;
        title = `Bedrock QoL Suite v${version} (Beta #${runNumber})`;
        isPrerelease = "true";
        makeLatest = "false";

        const notesPath = "prerelease_notes.md";

        // 1. Get triggering commit subject, body, and author
        let commitSubject = "";
        let commitBody = "";
        let commitAuthor = "";
        let fullSha = "";
        try {
            commitSubject = execSync("git log -1 --pretty=%s", { encoding: "utf8" }).trim();
            commitBody = execSync("git log -1 --pretty=%b", { encoding: "utf8" }).trim();
            commitAuthor = execSync("git log -1 --pretty=%an", { encoding: "utf8" }).trim();
            fullSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
        } catch {
            // Fallback
        }

        // 2. Collect commit history on development ahead of main, or last 5 commits
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
                const rawCommits = execSync("git log -n 5 --pretty=format:'%s|%h|%H'", { encoding: "utf8" }).trim();
                commitLines = rawCommits.split("\n").filter(Boolean);
            } catch {
                // Fallback
            }
        }

        let commitsMarkdown = "";
        if (commitLines.length > 0) {
            commitsMarkdown = commitLines.map((line) => {
                const [subj, shortH, longH] = line.split("|");
                if (shortH && longH) {
                    return `* ${subj} ([\`${shortH}\`](https://github.com/${repo}/commit/${longH}))`;
                }
                return `* ${line}`;
            }).join("\n");
        }

        // 3. Collect modified addon files in this build
        let changedFilesMarkdown = "";
        try {
            const diffOutput = execSync("git diff --name-only HEAD~1 HEAD", { encoding: "utf8" }).trim();
            const addonFiles = diffOutput.split("\n")
                .map((f) => f.trim())
                .filter((f) => f.startsWith("src/") || f.startsWith("behavior_pack/") || f.startsWith("resource_pack/"));
            if (addonFiles.length > 0) {
                changedFilesMarkdown = addonFiles.map((f) => `* \`${f}\``).join("\n");
            }
        } catch {
            // Fallback
        }

        // 4. Build comprehensive, human-like prerelease notes
        let notesContent = `### ⚠️ Development Preview Build (${tag})\n\n`;

        if (commitSubject) {
            notesContent += `#### 🚀 Latest Addition: **${commitSubject}**\n\n`;
        }

        if (commitBody) {
            notesContent += `**Description & Details:**\n\n${commitBody}\n\n`;
        }

        if (commitsMarkdown) {
            notesContent += `#### 📋 Included in this Preview Build:\n${commitsMarkdown}\n\n`;
        }

        if (changedFilesMarkdown) {
            notesContent += `#### 🛠️ Modified Addon Components:\n${changedFilesMarkdown}\n\n`;
        }

        notesContent += `#### ℹ️ Build Information\n` +
            `- **Branch:** \`${refName}\`\n` +
            `- **Commit:** [\`${sha || "HEAD"}\`](https://github.com/${repo}/commit/${fullSha || sha})\n` +
            `- **Author:** \`${commitAuthor || "developer"}\`\n` +
            `- **Build:** \`#${runNumber}\`\n\n` +
            `*Download the attached \`.mcaddon\` file below to install and test directly in Minecraft Bedrock (1.21+).*`;

        writeFileSync(notesPath, notesContent, "utf8");
        changelogFile = notesPath;
    } else {
        tag = isTag ? refName : `v${version}`;
        title = `Bedrock QoL Suite ${tag}`;
        isPrerelease = "false";
        makeLatest = "true";

        const versionChangelog = `update/v${version}.md`;
        if (existsSync(versionChangelog)) {
            changelogFile = versionChangelog;
        } else {
            const fallbackPath = "release_notes.md";
            writeFileSync(fallbackPath, `### Release v${version}\n\nSee release history in the \`update/\` directory.\n`, "utf8");
            changelogFile = fallbackPath;
        }
    }

    console.log(`Release Version:   ${version}`);
    console.log(`Release Tag:       ${tag}`);
    console.log(`Release Title:     ${title}`);
    console.log(`Is Prerelease:     ${isPrerelease}`);
    console.log(`Make Latest:       ${makeLatest}`);
    console.log(`Changelog Path:    ${changelogFile}`);

    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        const outputs = [
            `version=${version}`,
            `tag=${tag}`,
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
