import {
    Dimension,
    Entity,
    EntityComponentTypes,
    EquipmentSlot,
    ItemComponentTypes,
    ItemEnchantableComponent,
    ItemStack,
    Player,
    system,
    Vector3,
    world,
} from "@minecraft/server";
import { AutoFishingConfig } from "../config";
import { showPlayerNotification } from "../utils/notifications";

interface FishingSession {
    hook: Entity;
    player: Player;
    castTime: number;
    stableTicks: number;
    lastY: number;
    nextBiteTime: number;
    isCatching: boolean;
}

// Track active fishing hook sessions mapped by hook id
const activeHooks = new Map<string, FishingSession>();

// Track player to hook id mapping
const playerHooks = new Map<string, string>();

/**
 * Calculates bite delay in milliseconds based on Lure enchantment level.
 */
function getBiteDelayMs(lureLevel: number): number {
    // Vanilla bite window: ~5 to 15 seconds (reduced by ~2.5s per lure level)
    const baseMinMs = 4000;
    const baseMaxMs = 12000;
    const lureReduction = Math.min(lureLevel, 3) * 2000;

    const minMs = Math.max(1500, baseMinMs - lureReduction);
    const maxMs = Math.max(minMs + 2000, baseMaxMs - lureReduction);

    return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

/**
 * Determines fishing loot category based on Luck of the Sea enchantment level.
 */
function getLootCategory(luckLevel: number): "treasure" | "fish" | "junk" {
    // Base chances: Fish 85%, Junk 10%, Treasure 5%
    // Luck of the Sea increases Treasure (+2% per level) and decreases Junk (-2% per level)
    const treasureWeight = 5 + luckLevel * 3;
    const junkWeight = Math.max(2, 10 - luckLevel * 2.5);
    const fishWeight = 85 - luckLevel * 0.5;

    const total = treasureWeight + junkWeight + fishWeight;
    const roll = Math.random() * total;

    if (roll < treasureWeight) return "treasure";
    if (roll < treasureWeight + junkWeight) return "junk";
    return "fish";
}

/**
 * Generates fallback item drops in case /loot command is restricted or fails.
 */
function getFallbackLootItem(category: "treasure" | "fish" | "junk"): ItemStack {
    if (category === "treasure") {
        const treasures = [
            "minecraft:nautilus_shell",
            "minecraft:saddle",
            "minecraft:name_tag",
            "minecraft:bow",
            "minecraft:fishing_rod",
            "minecraft:lily_pad",
            "minecraft:enchanted_book",
        ];
        const pick = treasures[Math.floor(Math.random() * treasures.length)];
        return new ItemStack(pick, 1);
    }

    if (category === "junk") {
        const junks = [
            "minecraft:leather",
            "minecraft:bone",
            "minecraft:string",
            "minecraft:stick",
            "minecraft:bowl",
            "minecraft:tripwire_hook",
            "minecraft:leather_boots",
            "minecraft:rotten_flesh",
        ];
        const pick = junks[Math.floor(Math.random() * junks.length)];
        return new ItemStack(pick, 1);
    }

    // Default: Fish
    const fishRoll = Math.random();
    if (fishRoll < 0.6) {
        return new ItemStack("minecraft:cod", 1);
    } else if (fishRoll < 0.85) {
        return new ItemStack("minecraft:salmon", 1);
    } else if (fishRoll < 0.95) {
        return new ItemStack("minecraft:tropical_fish", 1);
    } else {
        return new ItemStack("minecraft:pufferfish", 1);
    }
}

/**
 * Handles the automated reeling in and awarding of fishing loot.
 */
function processCatch(session: FishingSession): void {
    const { hook, player } = session;
    session.isCatching = true;

    if (!player || !player.isValid || !hook || !hook.isValid) {
        session.isCatching = false;
        return;
    }

    try {
        const dimension = hook.dimension;
        const hookLoc = hook.location;
        const playerLoc = player.location;

        // Check player's fishing rod enchantment levels
        let luckLevel = 0;
        let lureLevel = 0;

        try {
            const equippable = player.getComponent(EntityComponentTypes.Equippable);
            const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
            const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
            const rod = (mainhand && mainhand.typeId === "minecraft:fishing_rod") ? mainhand : offhand;

            if (rod) {
                const enchantable = rod.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent | undefined;
                if (enchantable) {
                    luckLevel = enchantable.getEnchantment("luck_of_the_sea")?.level ?? 0;
                    lureLevel = enchantable.getEnchantment("lure")?.level ?? 0;
                }
            }
        } catch {
            // Ignore
        }

        const category = getLootCategory(luckLevel);

        // 1. Spawn loot (try vanilla loot command first, fallback to direct spawn)
        let lootSpawned = false;
        try {
            const floorX = Math.floor(playerLoc.x);
            const floorY = Math.floor(playerLoc.y + 0.5);
            const floorZ = Math.floor(playerLoc.z);

            const result = player.runCommand(
                `loot spawn ${floorX} ${floorY} ${floorZ} loot "gameplay/fishing/${category}"`
            );
            if (result && result.successCount > 0) {
                lootSpawned = true;
            }
        } catch {
            lootSpawned = false;
        }

        if (!lootSpawned) {
            const fallbackItem = getFallbackLootItem(category);
            dimension.spawnItem(fallbackItem, {
                x: playerLoc.x,
                y: playerLoc.y + 0.3,
                z: playerLoc.z,
            });
        }

        // 2. Award XP orbs
        const xpCount = category === "treasure" ? 4 : (category === "fish" ? 2 : 1);
        for (let i = 0; i < xpCount; i++) {
            try {
                dimension.spawnEntity("minecraft:xp_orb", {
                    x: playerLoc.x + (Math.random() - 0.5) * 0.4,
                    y: playerLoc.y + 0.2,
                    z: playerLoc.z + (Math.random() - 0.5) * 0.4,
                });
            } catch {
                // Ignore
            }
        }

        // 3. Audio & Particle Feedback
        if (AutoFishingConfig.showEffects) {
            try {
                dimension.playSound("random.splash", hookLoc, { volume: 0.8, pitch: 1.1 });
                dimension.playSound("random.orb", playerLoc, { volume: 0.4, pitch: 1.3 });
                dimension.spawnParticle("minecraft:crop_growth_emitter", {
                    x: hookLoc.x,
                    y: hookLoc.y + 0.3,
                    z: hookLoc.z,
                });

                const prettyName = category === "treasure" ? "§6Treasure§r" : (category === "junk" ? "§7Junk Item§r" : "§aFresh Fish§r");
                showPlayerNotification(player, `§b🎣 Auto Fish: Caught ${prettyName}! (+XP)§r`);
            } catch {
                // Ignore
            }
        }

        // 4. Continuous AFK Fishing Reset
        if (AutoFishingConfig.continuousAFK && hook.isValid) {
            system.runTimeout(() => {
                if (!hook.isValid || !player.isValid) return;

                try {
                    // Reset bobber upward slightly to continue floating in water
                    hook.applyImpulse({ x: 0, y: 0.12, z: 0 });
                    session.stableTicks = 0;
                    session.lastY = hook.location.y;
                    session.nextBiteTime = Date.now() + getBiteDelayMs(lureLevel);
                    session.isCatching = false;
                } catch {
                    // Ignore
                }
            }, 5);
        } else {
            session.isCatching = false;
        }
    } catch {
        session.isCatching = false;
    }
}

/**
 * Initializes the Auto Fishing feature.
 */
export function initAutoFishingFeature(): void {
    if (!AutoFishingConfig.enabled) return;

    // 1. Hook Spawn Listener: associates newly cast fishing hooks with players
    world.afterEvents.entitySpawn.subscribe((event) => {
        if (!AutoFishingConfig.enabled) return;
        const entity = event.entity;
        if (!entity || entity.typeId !== "minecraft:fishing_hook") return;

        system.runTimeout(() => {
            if (!entity.isValid) return;

            // Find nearest player within 6 blocks holding a fishing rod
            const players = Array.from(world.getAllPlayers());
            let nearestPlayer: Player | undefined;
            let minDist = 7.0;

            for (const p of players) {
                if (!p || !p.isValid) continue;
                if (p.dimension.id !== entity.dimension.id) continue;
                const d = Math.hypot(
                    p.location.x - entity.location.x,
                    p.location.y - entity.location.y,
                    p.location.z - entity.location.z
                );
                if (d < minDist) {
                    minDist = d;
                    nearestPlayer = p;
                }
            }

            if (!nearestPlayer) return;

            // Register session
            const hookId = entity.id;
            const lureLevel = 0; // Will be read dynamically on bite

            const session: FishingSession = {
                hook: entity,
                player: nearestPlayer,
                castTime: Date.now(),
                stableTicks: 0,
                lastY: entity.location.y,
                nextBiteTime: Date.now() + getBiteDelayMs(lureLevel),
                isCatching: false,
            };

            activeHooks.set(hookId, session);
            playerHooks.set(nearestPlayer.id, hookId);
        }, 1);
    });

    // 2. Monitoring loop: checks bobber water state and detects bites (runs every 2 ticks = 10 TPS)
    system.runInterval(() => {
        if (!AutoFishingConfig.enabled) return;
        const now = Date.now();

        for (const [hookId, session] of activeHooks.entries()) {
            const { hook, player } = session;

            // Validate entities
            if (!hook.isValid || !player.isValid) {
                activeHooks.delete(hookId);
                playerHooks.delete(player?.id);
                continue;
            }

            // Check if player is holding a fishing rod (mainhand or offhand)
            let holdingRod = false;
            try {
                const equippable = player.getComponent(EntityComponentTypes.Equippable);
                const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
                const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
                holdingRod = Boolean(
                    (mainhand && mainhand.typeId === "minecraft:fishing_rod") ||
                    (offhand && offhand.typeId === "minecraft:fishing_rod")
                );
            } catch {
                holdingRod = false;
            }

            if (!holdingRod) {
                activeHooks.delete(hookId);
                playerHooks.delete(player.id);
                continue;
            }

            if (session.isCatching) continue;

            const loc = hook.location;
            const velocity = hook.getVelocity();

            // Check if hook is in water
            let inWater = false;
            try {
                const block = hook.dimension.getBlock(loc);
                if (
                    block &&
                    (block.typeId === "minecraft:water" ||
                        block.typeId === "minecraft:flowing_water" ||
                        block.isWaterlogged)
                ) {
                    inWater = true;
                }
            } catch {
                inWater = false;
            }

            if (!inWater) {
                session.stableTicks = 0;
                session.lastY = loc.y;
                continue;
            }

            // Bobber is in water, accumulate stability ticks
            session.stableTicks++;

            // After bobber settles on water surface (at least 15 ticks)
            if (session.stableTicks >= 15) {
                const yDelta = loc.y - session.lastY;
                const vy = velocity.y;

                // Bite Detection Conditions:
                // a) Bobber dips downward into water (vy < -0.06 or sudden y dip)
                // b) Wait timer expires (simulates bite if vanilla particle is active)
                const isDipping = vy < -0.06 || yDelta < -0.045;
                const isTimedBite = now >= session.nextBiteTime;

                if (isDipping || isTimedBite) {
                    processCatch(session);
                }
            }

            session.lastY = loc.y;
        }
    }, 2);

    // 3. Periodic prompt: shows AFK Auto Fishing hint on Action Bar when holding a rod
    system.runInterval(() => {
        const players = Array.from(world.getAllPlayers());
        for (const player of players) {
            if (!player || !player.isValid) continue;
            try {
                const equippable = player.getComponent(EntityComponentTypes.Equippable);
                const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
                const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);

                if (
                    (mainhand && mainhand.typeId === "minecraft:fishing_rod") ||
                    (offhand && offhand.typeId === "minecraft:fishing_rod")
                ) {
                    if (playerHooks.has(player.id)) {
                        showPlayerNotification(player, "§b🎣 AFK Auto Fishing: Waiting for bite...§r", 1500);
                    }
                }
            } catch {
                // Ignore
            }
        }
    }, 40);

    // 4. Clean up sessions on player disconnect
    world.afterEvents.playerLeave.subscribe((event) => {
        const hookId = playerHooks.get(event.playerId);
        if (hookId) {
            activeHooks.delete(hookId);
            playerHooks.delete(event.playerId);
        }
    });
}

