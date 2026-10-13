# Bedrock QoL Suite

A modular, high-performance Quality-of-Life add-on for **Minecraft Bedrock Edition (1.21+)** built with the modern Script API (`@minecraft/server`). Designed to reduce repetitive survival micromanagement while maintaining balanced vanilla mechanics.

---

## Features

### 1. Dynamic Lighting & Offhand Torches
* **Held Light Sources**: Torches, lanterns, glowstone, campfires, lava buckets, froglights, copper bulbs, and beacons emit real-time dynamic light around the player.
* **Offhand Equipping**: Torches and lanterns can be held in the offhand slot to illuminate surroundings while keeping the main hand free for tools or weapons.
* **Stance Detection**: Dynamic lighting adjusts between standing height (`y + 1`) and feet level (`y`) when swimming or crawling in 1-block spaces.
* **Water Safety**: Dynamic light placements do not overwrite water source blocks.

### 2. Agriculture & Automation
* **Balanced Crop Growth**:
  * Standard crops follow a vanilla-adjacent growth cycle accelerated by a configurable multiplier (default: 1.25x).
  * Sweet berry bushes and cave vines use an accelerated foraging interval (5 seconds).
* **Right-Click Harvest**: Right-clicking mature crops harvests drops and replants in a single action.
* **Signless Storage Automation**: Crops harvested near any chest or barrel (within 10 blocks) deposit automatically without requiring labeled signs. Signs can still be placed for explicit multi-crop sorting.
* **Composter Routing**: Setting up a chest above a hopper and composter within 10 blocks automatically receives surplus seeds and compostable items.
* **Farmland Protection**: Farmland maintains hydration, resists trampling, and is protected from explosion damage.

### 3. Inventory & Container Sorting
* **Quick Sorter Item**: A dedicated management tool (`qol:quick_sorter`) with custom texture, inventory locking, and keep-on-death retention.
* **Container & Backpack Menus**:
  * **Category**: Groups items by tools, armor, weapons, ores, building blocks, and consumables.
  * **Tier / Quality**: Sorts gear by material tier (Netherite down to Wood) and enchantment presence.
  * **Alphabetical (A–Z)**: Sorts by item display name.
  * **Quantity**: Sorts by stack size descending.
  * **Compact**: Merges matching partial stacks.
  * **Hotbar Protection**: Locks hotbar slots (0–8) during inventory sorting.
  * **Torch to Offhand**: Quick-swaps torches and lanterns directly to the offhand slot.
* **Usage**:
  * Right-click any container with the Quick Sorter item to open container sorting options.
  * Normal attacks / punches break containers without menu interference.
  * Containers automatically sort upon closing when configured.

### 4. Mob Health Bars
* **Typography**: Segmented health bar nameplate formatted using Minecraft font glyphs.
* **Broad Entity Coverage**: Renders over hostile, neutral, and passive mobs.
* **Visibility**: Nameplates render at extended distance up to 64 blocks without requiring crosshair targeting.

### 5. Survival Utilities
* **Morning Creeper Despawn**: Exposed surface creepers in daylight safely despawn with particle feedback.
* **Experience Magnet**: Collects loose XP orbs within 32 blocks toward the player.
* **Ground Egg Incubation**: Laid chicken eggs on ground incubate over 30 seconds and hatch into chicks, subject to local density limits.
* **Auto Totem**: Triggers Totem of Undying protection from inventory without overriding the offhand equipment slot.
* **Auto Shield**: Raises an equipped shield against incoming attacks.
* **Auto Fishing**: Detects bobber movement and recasts automatically.
* **Campfire Defense & Healing**: Lit campfires provide area-of-effect regeneration for players and pets, while repelling and damaging hostile mobs within 10 blocks.
* **Vein Miner**: Mining ores while sneaking harvests connected ore veins.
* **Tree Capitator**: Fells standing trees and naturally fallen logs, featuring species-matched leaf decay and automatic sapling replanting.
* **Durability Freezing**: Freezes tool, weapon, and armor durability wear while fully repaired.
* **Immortal Pets**: Tamed pets and mounts are protected against fatal damage.

---

## Controls Reference

| Action | Control / Trigger |
| :--- | :--- |
| **Open Backpack Sorter** | Right-click the Quick Sorter item in air |
| **Open Container Sorter** | Right-click a container with the Quick Sorter equipped |
| **Break Container** | Punch or mine containers normally with tools or bare hands |
| **Auto-Sort Container** | Close any open container (when enabled) |
| **Offhand Torch Swap** | Click `Torch / Lantern Offhand` in Sorter GUI, or right-click torch in air |
| **Right-Click Harvest** | Right-click mature crops, berry bushes, or cave vines |
| **Vein Mine** | Crouch (sneak) while breaking ore blocks with a pickaxe |
| **Tree Capitator** | Break a tree trunk with an axe |

---

## Configuration

Settings and feature toggles can be customized in [`src/config.ts`](src/config.ts).

Available configurations include:
* `DynamicLightingConfig` — Lighting updates and offhand equipment rules.
* `FarmingConfig` — Growth rates, harvest radii, and hydration behavior.
* `InventorySortingConfig` — Sort methods, hotbar locking, and container triggers.
* `XpMagnetConfig` — Collection radius and pull physics.
* `CampfireRegenConfig` — Regeneration rates, defensive perimeter, and damage scaling.
* `TreeCapitatorConfig` — Max log limits, leaf decay filtering, and sapling spacing.

---

## Installation & Build

### Requirements
* Minecraft Bedrock Edition 1.21.0+
* World Setting: **Beta APIs** enabled under Experiments

### Building from Source

```bash
# Install dependencies
npm install

# Type-check TypeScript sources
npm run typecheck

# Bundle scripts into behavior pack
npm run build

# Package distribution .mcaddon into dist/
npm run pack
```

Build artifacts are generated in [`dist/`](dist/):
* `dist/BedrockQoL_<version>/BedrockQoL_<version>.mcaddon` — Combined Behavior & Resource Pack archive.

---

## Changelog

See [`update/README.md`](update/README.md) for release history and [`update/v1.0.2.md`](update/v1.0.2.md) for the latest release notes.

---

## License

This project is licensed under the [MIT License](LICENSE).
