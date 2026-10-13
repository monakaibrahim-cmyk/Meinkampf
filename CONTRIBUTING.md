# Contributing Guide

Thanks for wanting to help make Bedrock QoL Suite better! Whether you're fixing a bug, adding a new feature, or tweaking documentation, contributions are always welcome.

Here's a quick guide to get you set up and make the review process as smooth as possible.

---

## Where to Send Changes

We do all active development on the **`development`** branch:

* **Always branch off and target `development`** for your pull requests.
* The `main` branch is reserved for tagged releases and managed by project maintainers. PRs sent directly to `main` will just be asked to switch base to `development`.

```bash
# Branch off development for your work
git checkout -b feat/my-cool-feature development
```

If you're planning to build a large or experimental feature, it's usually a good idea to chat with us first in the [Discord](https://discord.gg/uNsbXYaQB) (`#dev-logs` channel) so we can coordinate and make sure nobody is duplicating work.

---

## Getting Set Up

You'll need Node.js (v20+ recommended) and Git installed.

1. **Fork and clone the repo:**
   ```bash
   git clone https://github.com/<your-username>/Meinkampf.git
   cd Meinkampf
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   *(Running `npm install` automatically wires up our Git commit template from `.github/.gitmessage`)*

3. **Make sure it builds:**
   ```bash
   npm run typecheck
   npm run build
   ```

---

## Making Changes & Testing

Since this is a Minecraft Bedrock Script API addon, in-game verification is the most important part of testing:

1. **Keep TypeScript types clean:**
   Run `npm run typecheck` (`tsc --noEmit`) to catch any type errors or broken Bedrock API calls.
2. **Bundle the scripts:**
   Run `npm run build` to compile TypeScript into `behavior_pack/scripts/main.js` via esbuild.
3. **Test in Minecraft:**
   * Create a test world with **Beta APIs** enabled under Experiments.
   * Make sure your feature works as expected in survival mode.
   * Check the content log (Settings &rarr; Creator &rarr; Enable Content Log GUI) to ensure there are no script errors or unhandled exceptions.
   * Make sure it doesn't cause tick lag or memory leaks with interval timers.

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) because our CI uses them to generate release notes and alpha preview changelogs.

A good commit looks like:
```
feat(campfire): add healing for neutral and passive mobs
fix(sorter): prevent offhand swap desync when closing container
docs(readme): clarify requirement for beta apis
```

* Common types: `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`
* If you run `git commit` without `-m`, your editor will open with our commit template to help format it.

---

## Sending a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feat/my-cool-feature
   ```
2. Open a Pull Request targeting the **`development`** branch on GitHub.
3. Fill out the PR template with a brief summary of what you changed, how you tested it in-game, and if there are any config options added.

We'll review it as soon as possible. Thanks again for contributing!
