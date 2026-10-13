import { readFileSync, existsSync, writeFileSync } from "fs";

function getMetadata() {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const version = pkg.version || "1.0.0";

    const ref = process.env.GITHUB_REF || "";
    const refName = process.env.GITHUB_REF_NAME || "main";
    const runNumber = process.env.GITHUB_RUN_NUMBER || "1";
    const sha = (process.env.GITHUB_SHA || "").slice(0, 7);

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
        const notesContent = `### ⚠️ Development Preview (Beta / Alpha)\n\n` +
            `- **Branch:** \`${refName}\`\n` +
            `- **Commit:** \`${sha || "HEAD"}\`\n` +
            `- **Build:** \`#${runNumber}\`\n\n` +
            `*Automated development build for preview and testing.*\n`;
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
            writeFileSync(fallbackPath, `### Release v${version}\n\nSee release history in [update/README.md](update/README.md).\n`, "utf8");
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

getMetadata();
