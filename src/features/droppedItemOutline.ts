import {
    world,
    system,
    Dimension,
    Entity,
    EntityItemComponent,
    ItemComponentTypes,
    ItemEnchantableComponent,
    ItemStack,
    Vector3,
    Player,
} from "@minecraft/server";
import { DroppedItemOutlineConfig } from "../config";

/**
 * Item rarity tiers for Minecraft-fashion debug styling.
 */
export type ItemRarity = "legendary" | "rare" | "uncommon" | "common";

export interface ItemRarityInfo {
    rarity: ItemRarity;
    badge: string;
    nameColor: string;
    particleId: string;
}

/**
 * High-value / legendary items highlighted with distinct purple/magenta glow.
 */
const LEGENDARY_ITEMS = new Set([
    "minecraft:netherite_sword",
    "minecraft:netherite_pickaxe",
    "minecraft:netherite_axe",
    "minecraft:netherite_shovel",
    "minecraft:netherite_hoe",
    "minecraft:netherite_helmet",
    "minecraft:netherite_chestplate",
    "minecraft:netherite_leggings",
    "minecraft:netherite_boots",
    "minecraft:netherite_ingot",
    "minecraft:netherite_block",
    "minecraft:netherite_upgrade_smithing_template",
    "minecraft:elytra",
    "minecraft:totem_of_undying",
    "minecraft:enchanted_golden_apple",
    "minecraft:nether_star",
    "minecraft:beacon",
    "minecraft:trident",
    "minecraft:mace",
    "minecraft:heavy_core",
    "minecraft:dragon_egg",
    "minecraft:dragon_breath",
    "minecraft:heart_of_the_sea",
    "minecraft:conduit",
]);

/**
 * Rare items highlighted with cyan/aqua glow.
 */
const RARE_ITEMS = new Set([
    "minecraft:diamond_sword",
    "minecraft:diamond_pickaxe",
    "minecraft:diamond_axe",
    "minecraft:diamond_shovel",
    "minecraft:diamond_hoe",
    "minecraft:diamond_helmet",
    "minecraft:diamond_chestplate",
    "minecraft:diamond_leggings",
    "minecraft:diamond_boots",
    "minecraft:diamond",
    "minecraft:diamond_block",
    "minecraft:diamond_ore",
    "minecraft:deepslate_diamond_ore",
    "minecraft:emerald",
    "minecraft:emerald_block",
    "minecraft:emerald_ore",
    "minecraft:deepslate_emerald_ore",
    "minecraft:golden_apple",
    "minecraft:ender_pearl",
    "minecraft:ender_eye",
    "minecraft:shulker_box",
    "minecraft:shulker_shell",
    "minecraft:echo_shard",
    "minecraft:recovery_compass",
    "minecraft:enchanted_book",
    "minecraft:music_disc_5",
    "minecraft:music_disc_pigstep",
    "minecraft:music_disc_otherside",
    "minecraft:music_disc_relic",
    "minecraft:music_disc_creator",
    "minecraft:music_disc_creator_music_box",
    "minecraft:music_disc_precipice",
]);

/**
 * Uncommon items highlighted with warm gold/yellow glow.
 */
const UNCOMMON_ITEMS = new Set([
    "minecraft:iron_sword",
    "minecraft:iron_pickaxe",
    "minecraft:iron_axe",
    "minecraft:iron_shovel",
    "minecraft:iron_hoe",
    "minecraft:iron_helmet",
    "minecraft:iron_chestplate",
    "minecraft:iron_leggings",
    "minecraft:iron_boots",
    "minecraft:iron_ingot",
    "minecraft:iron_block",
    "minecraft:raw_iron",
    "minecraft:golden_sword",
    "minecraft:golden_pickaxe",
    "minecraft:golden_axe",
    "minecraft:golden_shovel",
    "minecraft:golden_hoe",
    "minecraft:golden_helmet",
    "minecraft:golden_chestplate",
    "minecraft:golden_leggings",
    "minecraft:golden_boots",
    "minecraft:gold_ingot",
    "minecraft:gold_block",
    "minecraft:raw_gold",
    "minecraft:copper_ingot",
    "minecraft:copper_block",
    "minecraft:raw_copper",
    "minecraft:redstone",
    "minecraft:redstone_block",
    "minecraft:lapis_lazuli",
    "minecraft:lapis_block",
    "minecraft:amethyst_shard",
    "minecraft:quartz",
    "minecraft:quartz_block",
    "minecraft:blaze_rod",
    "minecraft:blaze_powder",
    "minecraft:ghast_tear",
    "minecraft:magma_cream",
    "minecraft:slime_ball",
    "minecraft:glistering_melon_slice",
    "minecraft:golden_carrot",
    "minecraft:brewing_stand",
    "minecraft:experience_bottle",
    "minecraft:glowstone_dust",
    "minecraft:obsidian",
    "minecraft:crying_obsidian",
    "minecraft:respawn_anchor",
    "minecraft:bow",
    "minecraft:crossbow",
    "minecraft:shield",
]);

// Track entity spawn ticks to compute real-time despawn countdowns (6000 ticks = 5 minutes in vanilla)
const itemSpawnTicks = new Map<string, number>();
const VANILLA_DESPAWN_TICKS = 6000;

// Runtime feature toggle (switchable via /scriptevent qol:item_debug)
let isFeatureEnabled = DroppedItemOutlineConfig.enabled;

/**
 * Determines the rarity tier, badge, and particle outline color for an item.
 */
export function getItemRarity(itemStack: ItemStack): ItemRarityInfo {
    const typeId = itemStack.typeId;

    // Check if the item carries enchantments
    let hasEnchants = false;
    try {
        const enchComp = itemStack.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent;
        if (enchComp && enchComp.getEnchantments().length > 0) {
            hasEnchants = true;
        }
    } catch {
        // Fallback
    }

    if (LEGENDARY_ITEMS.has(typeId)) {
        return {
            rarity: "legendary",
            badge: "§d[Epic]",
            nameColor: "§d",
            particleId: "minecraft:sculk_soul_particle",
        };
    }

    if (RARE_ITEMS.has(typeId) || hasEnchants) {
        return {
            rarity: "rare",
            badge: hasEnchants ? "§b[Enchanted]" : "§b[Rare]",
            nameColor: "§b",
            particleId: "minecraft:electric_spark_particle",
        };
    }

    if (UNCOMMON_ITEMS.has(typeId)) {
        return {
            rarity: "uncommon",
            badge: "§e[Uncommon]",
            nameColor: "§e",
            particleId: "minecraft:wax_particle",
        };
    }

    return {
        rarity: "common",
        badge: "§7[Common]",
        nameColor: "§f",
        particleId: DroppedItemOutlineConfig.defaultParticle || "minecraft:endrod",
    };
}

/**
 * Formats a typeId identifier into clean Title Case (e.g. "minecraft:raw_iron" -> "Raw Iron").
 */
function formatItemName(typeId: string): string {
    const raw = typeId.replace(/^minecraft:/, "").replace(/_/g, " ");
    return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Calculates and formats the remaining time before the item entity despawns.
 */
function formatDespawnCountdown(spawnTick: number, currentTick: number): string {
    const elapsed = Math.max(0, currentTick - spawnTick);
    const remainingTicks = Math.max(0, VANILLA_DESPAWN_TICKS - elapsed);
    const totalSeconds = Math.floor(remainingTicks / 20);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    if (totalSeconds <= 30) {
        return `§c⏱ ${timeStr} 🚨`;
    } else if (totalSeconds <= 60) {
        return `§e⏱ ${timeStr} ⚠️`;
    }
    return `§7⏱ ${timeStr}`;
}

/**
 * Spawns a 3D AABB wireframe bounding box particle outline around a dropped item entity.
 * Traces the 8 vertices and 12 connecting edges in classic Minecraft F3 debug fashion.
 */
function renderDebugWireframe(
    dimension: Dimension,
    pos: Vector3,
    particleId: string
): void {
    const halfW = DroppedItemOutlineConfig.boxWidth / 2;
    const h = DroppedItemOutlineConfig.boxHeight;

    const minX = pos.x - halfW;
    const maxX = pos.x + halfW;
    const minY = pos.y + 0.05;
    const maxY = pos.y + 0.05 + h;
    const minZ = pos.z - halfW;
    const maxZ = pos.z + halfW;

    const midX = pos.x;
    const midY = minY + h / 2;
    const midZ = pos.z;

    try {
        // 1. Eight corners / vertices of the AABB cuboid
        dimension.spawnParticle(particleId, { x: minX, y: minY, z: minZ });
        dimension.spawnParticle(particleId, { x: maxX, y: minY, z: minZ });
        dimension.spawnParticle(particleId, { x: maxX, y: minY, z: maxZ });
        dimension.spawnParticle(particleId, { x: minX, y: minY, z: maxZ });

        dimension.spawnParticle(particleId, { x: minX, y: maxY, z: minZ });
        dimension.spawnParticle(particleId, { x: maxX, y: maxY, z: minZ });
        dimension.spawnParticle(particleId, { x: maxX, y: maxY, z: maxZ });
        dimension.spawnParticle(particleId, { x: minX, y: maxY, z: maxZ });

        // 2. Midpoints along the 12 edges to form complete wireframe lines
        // Bottom perimeter (Y = minY)
        dimension.spawnParticle(particleId, { x: midX, y: minY, z: minZ });
        dimension.spawnParticle(particleId, { x: maxX, y: minY, z: midZ });
        dimension.spawnParticle(particleId, { x: midX, y: minY, z: maxZ });
        dimension.spawnParticle(particleId, { x: minX, y: minY, z: midZ });

        // Top perimeter (Y = maxY)
        dimension.spawnParticle(particleId, { x: midX, y: maxY, z: minZ });
        dimension.spawnParticle(particleId, { x: maxX, y: maxY, z: midZ });
        dimension.spawnParticle(particleId, { x: midX, y: maxY, z: maxZ });
        dimension.spawnParticle(particleId, { x: minX, y: maxY, z: midZ });

        // Four vertical corner pillars
        dimension.spawnParticle(particleId, { x: minX, y: midY, z: minZ });
        dimension.spawnParticle(particleId, { x: maxX, y: midY, z: minZ });
        dimension.spawnParticle(particleId, { x: maxX, y: midY, z: maxZ });
        dimension.spawnParticle(particleId, { x: minX, y: midY, z: maxZ });

        // 3. Center vertical axis indicator (F3 axis tick)
        if (DroppedItemOutlineConfig.showCenterAxis) {
            dimension.spawnParticle("minecraft:endrod", { x: pos.x, y: maxY + 0.08, z: pos.z });
        }
    } catch {
        // Ignore transient particle limits
    }
}

/**
 * Updates the floating debug info label (nameplate) and wireframe outline for a dropped item.
 */
function updateItemDebugVisuals(itemEntity: Entity, currentTick: number): void {
    if (!itemEntity.isValid) return;

    let itemComp: EntityItemComponent | undefined;
    try {
        itemComp = itemEntity.getComponent("minecraft:item") as EntityItemComponent;
    } catch {
        return;
    }
    if (!itemComp || !itemComp.itemStack) return;

    const itemStack = itemComp.itemStack;
    const rarity = getItemRarity(itemStack);
    const particleId = DroppedItemOutlineConfig.colorByRarity
        ? rarity.particleId
        : (DroppedItemOutlineConfig.defaultParticle || "minecraft:endrod");

    const pos = itemEntity.location;

    // 1. Render 3D wireframe bounding box
    if (DroppedItemOutlineConfig.showWireframeBox) {
        renderDebugWireframe(itemEntity.dimension, pos, particleId);
    }

    // 2. Render floating debug info tag
    if (DroppedItemOutlineConfig.showFloatingInfo) {
        let spawnTick = itemSpawnTicks.get(itemEntity.id);
        if (spawnTick === undefined) {
            spawnTick = currentTick;
            itemSpawnTicks.set(itemEntity.id, spawnTick);
        }

        const count = itemStack.amount;
        const displayName = itemStack.nameTag || formatItemName(itemStack.typeId);
        const countBadge = count > 1 ? ` §e×${count}` : "";

        // Line 1: [Icon] Display Name [Rarity] xCount
        const line1 = `${rarity.nameColor}◆ §f${displayName} ${rarity.badge}${countBadge}`;

        // Line 2: Despawn Countdown | Coords
        let line2 = `§8XYZ: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`;
        if (DroppedItemOutlineConfig.showDespawnTimer) {
            const timer = formatDespawnCountdown(spawnTick, currentTick);
            line2 = `${timer} §8│ ${line2}`;
        }

        try {
            itemEntity.nameTag = `${line1}\n${line2}`;
        } catch {
            // Ignore
        }
    }
}

/**
 * Clears debug nameplates from all dropped items within range of active players.
 */
function clearAllDebugTags(): void {
    const players = world.getAllPlayers();
    for (const player of players) {
        if (!player.isValid) continue;
        try {
            const nearby = player.dimension.getEntities({
                location: player.location,
                maxDistance: DroppedItemOutlineConfig.radius,
                type: "minecraft:item",
            });
            for (const item of nearby) {
                if (item.isValid) {
                    item.nameTag = "";
                }
            }
        } catch {
            // Ignore
        }
    }
}

/**
 * Main scan loop that updates outlines and debug tags around all players.
 */
function processDroppedItemsTick(): void {
    if (!isFeatureEnabled) return;

    const players = world.getAllPlayers();
    if (players.length === 0) return;

    const currentTick = system.currentTick;
    const processedEntityIds = new Set<string>();
    const radius = DroppedItemOutlineConfig.radius;
    const maxItems = DroppedItemOutlineConfig.maxTrackedItems;

    for (const player of players) {
        if (!player.isValid) continue;

        try {
            const nearbyItems = player.dimension.getEntities({
                location: player.location,
                maxDistance: radius,
                type: "minecraft:item",
            });

            for (const itemEntity of nearbyItems) {
                if (processedEntityIds.has(itemEntity.id)) continue;
                if (processedEntityIds.size >= maxItems) break;

                processedEntityIds.add(itemEntity.id);
                updateItemDebugVisuals(itemEntity, currentTick);
            }
        } catch {
            // Ignore dimension transition errors
        }
    }
}

/**
 * Handles /scriptevent commands to toggle the feature in-game.
 */
function handleScriptEvent(event: { id: string; sourceEntity?: any }): void {
    if (!DroppedItemOutlineConfig.enableScriptEventToggle) return;

    if (
        event.id === "qol:item_debug" ||
        event.id === "qol:item_outline" ||
        event.id === "qol:hitbox" ||
        event.id === "qol:debug_items"
    ) {
        isFeatureEnabled = !isFeatureEnabled;

        const player = event.sourceEntity as Player | undefined;
        const statusText = isFeatureEnabled ? "§aENABLED" : "§cDISABLED";

        if (!isFeatureEnabled) {
            clearAllDebugTags();
        }

        if (player && player.isValid && player.typeId === "minecraft:player") {
            try {
                player.onScreenDisplay.setActionBar(
                    `§6⚡ [Item Debug] §fDropped Item Bounding Box & Tags: ${statusText}`
                );
            } catch {
                player.sendMessage(`§6⚡ [Item Debug] §fDropped Item Bounding Box & Tags: ${statusText}`);
            }
        } else {
            console.warn(`[ItemDebug] Dropped Item Debug Outline toggled: ${isFeatureEnabled ? "ON" : "OFF"}`);
        }
    }
}

/**
 * Initializes the Dropped Item Entity Debug Outline feature.
 */
export function initDroppedItemOutlineFeature(): void {
    if (!DroppedItemOutlineConfig.enabled) {
        console.warn("[ItemDebug] Dropped Item Debug Outline feature is disabled in configuration.");
        return;
    }

    // 1. Track newly spawned items immediately
    world.afterEvents.entitySpawn.subscribe((event) => {
        const entity = event.entity;
        if (entity && entity.isValid && entity.typeId === "minecraft:item") {
            itemSpawnTicks.set(entity.id, system.currentTick);
        }
    });

    // 2. Clean up removed items (picked up, despawned, destroyed in lava/fire)
    world.afterEvents.entityRemove.subscribe((event) => {
        if (event.typeId === "minecraft:item") {
            itemSpawnTicks.delete(event.removedEntityId);
        }
    });

    // 3. Periodic wireframe and debug info renderer loop
    system.runInterval(processDroppedItemsTick, DroppedItemOutlineConfig.updateIntervalTicks);

    // 4. ScriptEvent toggle listener (/scriptevent qol:item_debug)
    system.afterEvents.scriptEventReceive.subscribe((event) => {
        handleScriptEvent(event);
    });

    console.warn("[ItemDebug] Dropped Item Entity Debug Outline initialized successfully.");
}
