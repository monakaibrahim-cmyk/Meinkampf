# Bedrock QoL Suite — Update Index

Directory of version patches and changelogs for the Bedrock QoL Suite add-on.

---

## Release History

* **[v1.0.3 (Automation & CI/CD Update)](./v1.0.3.md)**:
  * Automated packaging script with explicit version arguments (`npm run pack 1.0.3`) and smart patch auto-incrementing.
  * Synchronized manifests and package versioning with clean `dist/v<version>/` output directories.
  * Added Discord webhook notifications for commits, releases, and workflow failures.
  * Full GitHub Actions pipeline supporting stable production and beta/alpha development releases.

* **[v1.0.2 (Hotfix Update)](./v1.0.2.md)**:
  * Restored standard chest punch breaking: removed punch/attack interception on chests/containers so players can destroy chests normally.
  * Accessing container sorting options now requires equipping the ⚡ Quick Sorter tool and right-clicking on the chest.
  * Offhand torch and lantern equipping handled seamlessly through the Quick Sorter GUI button (`Torch / Lantern Offhand`) and right-click air use without sneak-swinging or command macros.
  * Fixed hostile mobs inside lit campfire radius to take damage continuously/indefinitely each second (with 3x damage multiplier) as long as they stay inside the radius.
  * Added `always_show: true` entity definitions for all 30+ passive mobs, zombified piglins, and zombie villagers (`zombie_villager_v2`), allowing nameplates to display up to 64 blocks away without crosshair aiming or 1–2 block proximity.

* **[v1.0.1 (Interaction & Stability Update)](./v1.0.1.md)**:
  * Dedicated custom Quick Sorter item (`qol:quick_sorter`) with custom pixel art icon, keep-on-death retention, inventory lock, and anti-duplication protection.
  * Added "Quality / Tier" sorting mode (Netherite > Diamond > Iron > Gold > Copper > Stone > Wood, enchanted gear prioritized).
  * Removed Auto Totem automatic offhand slot populating; players keep their chosen offhand items.
  * Removed crouch right-click chest interception to preserve vanilla hopper and block placement; right-clicking chests with the Quick Sorter item opens container sorting.
  * Campfire defense out-of-range lingering burn duration (`burnHostileDurationSeconds`) and 3x hostile mob campfire damage.
  * Cleaned Dynamic Lighting mechanics: removed sneak-swing equip listener and configuration.
  * Stabilized crop growth indicator with extended particle lifetime and continuous grid scanning to prevent flickering.
  * Fixed neutral mob nameplates so health bars render statically from up to 64 blocks without requiring crosshair targeting.

* **[v1.0.0 (Initial Release)](./v1.0.0.md)** — Full public launch featuring:
  * Over 50 held dynamic light sources + dual-wielding offhand torches & lanterns.
  * Balanced crop growth (16 min default + 1.25x boost) with fast 5s Sweet Berries & Cave Vines.
  * In-game Backpack and Container Sorter GUI with hotbar lock and auto-sort.
  * Vanilla-font Mob Health Bar up to 15 blocks away.
  * Morning Creeper Despawn, 32-block XP Magnet, and Ground Egg Incubation.
  * Combat & Utility automation (Auto Totem, Auto Shield, Auto Fishing, Campfire Regen).
  * Vein Miner, Tree Capitator, Durability Freezing, and Immortal Pets.
