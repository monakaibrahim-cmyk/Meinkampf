# Contributing to Bedrock QoL Suite

Thank you for your interest in contributing to **Bedrock QoL Suite**! We welcome bug reports, feature suggestions, code optimizations, and documentation improvements from the community.

---

## 🚀 Quick Start

1. **Fork & Clone:**
   ```bash
   git clone https://github.com/<your-username>/Meinkampf.git
   cd Meinkampf
   ```

2. **Install Dependencies & Auto-Configure Git:**
   ```bash
   npm install
   ```
   > 💡 Running `npm install` automatically configures Git to use our professional commit message template (`.github/.gitmessage`). You can also manually enable it anytime with:
   > ```bash
   > npm run setup:git
   > ```

3. **Verify Setup:**
   ```bash
   npm run typecheck
   npm run build
   ```

---

## 🌲 Branching Strategy

To maintain a clean and reliable release cycle, we follow a dual-channel branch workflow:

| Branch | Purpose | PR Target |
| :--- | :--- | :--- |
| **`development`** | Active development, experimental features, alpha/beta builds | **All community PRs should target this branch!** |
| **`main`** | Production-ready stable releases only (tagged versions) | Maintained exclusively by project leads |

> [!IMPORTANT]
> Always branch off `development` and create pull requests targeting `development`. Direct PRs to `main` will be asked to re-target `development`.

```bash
git checkout -b feat/my-new-feature development
```

---

## ✍️ Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) to generate automated changelogs and maintain clear history.

### Commit Structure
```
<type>(<scope>): <concise description in imperative mood>

[optional body explaining why and what changed]

[optional footer, e.g. Closes #123, BREAKING CHANGE]
```

### Commit Types
* `feat`: A new feature or capability
* `fix`: A bug fix or behavioral patch
* `perf`: Performance improvement (reduced ticks, memory, caching)
* `refactor`: Code restructure without changing behavior
* `docs`: Documentation, README, or code comment updates
* `style`: Code style, formatting, whitespace
* `test`: Adding or updating tests
* `build`: Build system, packaging, esbuild, npm dependencies
* `ci`: GitHub Actions workflows, CI/CD scripts
* `chore`: General repository maintenance

### Common Scopes
`campfire`, `afk`, `sorter`, `auto-bucket`, `auto-totem`, `auto-shield`, `lighting`, `farming`, `vein-miner`, `tree-capitator`, `fishing`, `config`, `pack`

### Auto-Configured Commit Template
When you run `git commit` (without `-m`), Git will automatically open our standardized template with helpful prompts and reminders.

---

## 🧪 Testing & Code Standards

Before opening a pull request, ensure your code meets the following quality standards:

1. **Type Safety:**
   ```bash
   npm run typecheck
   ```
   Must pass with zero TypeScript errors (`tsc --noEmit`).

2. **Bundle Build:**
   ```bash
   npm run build
   ```
   Ensures esbuild bundles cleanly into `behavior_pack/scripts/main.js`.

3. **Packaging Test:**
   ```bash
   npm run pack -- --no-bump
   ```
   Verifies that the `.mcaddon` package compiles without manifest errors.

4. **In-Game Testing:**
   Test your changes in Minecraft Bedrock Edition (1.21+) with **Beta APIs** enabled under World Experiments. Verify:
   - Feature functions as expected in survival mode.
   - No script crashes or console errors in the content log.
   - Smooth performance with no tick desync or memory leaks.

---

## 📥 Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feat/my-new-feature
   ```
2. Open a Pull Request on GitHub targeting the **`development`** branch.
3. GitHub will automatically populate our **Pull Request Template** (`.github/pull_request_template.md`). Please fill out:
   - Description and motivation
   - Type of change
   - In-game testing details
   - Checklist items

---

## 💬 Community & Discussion

Have questions or want to discuss feature designs before writing code?
Join our **[Official Discord Server](https://discord.gg/uNsbXYaQB)** in the `#dev-logs` or `#general` channels!
