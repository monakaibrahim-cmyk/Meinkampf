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
 * Safely spawns a particle with optional fallback to avoid transient dimension limit errors.
 */
function safeSpawnParticle(
    dimension: Dimension,
    particleId: string,
    location: Vector3,
    fallbackId?: string
): void {
    try {
        dimension.spawnParticle(particleId, location);
    } catch {
        if (fallbackId) {
            try {
                dimension.spawnParticle(fallbackId, location);
            } catch {
                // Ignore transient particle limits
            }
        }
    }
}

/**
 * Spawns an interpolated continuous line of particles between two 3D points.
 */
function spawnLine(
    dimension: Dimension,
    particleId: string,
    p1: Vector3,
    p2: Vector3,
    steps: number,
    fallbackId?: string
): void {
    for (let i = 0; i <= steps; i++) {
        const t = steps > 0 ? i / steps : 0;
        safeSpawnParticle(
            dimension,
            particleId,
            {
                x: p1.x + (p2.x - p1.x) * t,
                y: p1.y + (p2.y - p1.y) * t,
                z: p1.z + (p2.z - p1.z) * t,
            },
            fallbackId
        );
    }
}

/**
 * Renders an authentic Minecraft Java Edition (F3+B) debug hitbox outline:
 * 1. Pure white wireframe AABB bounding box (0.25 x 0.25) connecting all 12 edges with continuous particles
 * 2. Signature blue line indicating entity look direction / line of sight
 * 3. Signature red horizontal line indicating eye height / front face
 */
function renderJavaDebugOutline(
    dimension: Dimension,
    itemEntity: Entity,
    pos: Vector3,
    boxParticle: string
): void {
    const halfW = DroppedItemOutlineConfig.boxWidth / 2;
    const height = DroppedItemOutlineConfig.boxHeight;

    const minX = pos.x - halfW;
    const maxX = pos.x + halfW;
    const minY = pos.y;
    const maxY = pos.y + height;
    const minZ = pos.z - halfW;
    const maxZ = pos.z + halfW;

    // Density steps along each 0.25m edge (step size ~0.05m ensures unbroken continuous wireframe lines)
    const edgeSteps = 4;

    // 1. Bottom perimeter edges (Y = minY)
    spawnLine(dimension, boxParticle, { x: minX, y: minY, z: minZ }, { x: maxX, y: minY, z: minZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: minX, y: minY, z: maxZ }, { x: maxX, y: minY, z: maxZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: minX, y: minY, z: minZ }, { x: minX, y: minY, z: maxZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: maxX, y: minY, z: minZ }, { x: maxX, y: minY, z: maxZ }, edgeSteps);

    // 2. Top perimeter edges (Y = maxY)
    spawnLine(dimension, boxParticle, { x: minX, y: maxY, z: minZ }, { x: maxX, y: maxY, z: minZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: minX, y: maxY, z: maxZ }, { x: maxX, y: maxY, z: maxZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: minX, y: maxY, z: minZ }, { x: minX, y: maxY, z: maxZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: maxX, y: maxY, z: minZ }, { x: maxX, y: maxY, z: maxZ }, edgeSteps);

    // 3. Four vertical corner pillars (connecting bottom to top)
    spawnLine(dimension, boxParticle, { x: minX, y: minY, z: minZ }, { x: minX, y: maxY, z: minZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: maxX, y: minY, z: minZ }, { x: maxX, y: maxY, z: minZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: minX, y: minY, z: maxZ }, { x: minX, y: maxY, z: maxZ }, edgeSteps);
    spawnLine(dimension, boxParticle, { x: maxX, y: minY, z: maxZ }, { x: maxX, y: maxY, z: maxZ }, edgeSteps);

    // Eye height for item entities in Java Edition is ~0.21m
    const eyeY = minY + height * 0.85;

    // Resolve look vector / facing direction
    let viewDir = { x: 0, y: 0, z: 1 };
    try {
        const vd = itemEntity.getViewDirection();
        if (vd && (vd.x !== 0 || vd.y !== 0 || vd.z !== 0)) {
            viewDir = vd;
        }
    } catch {
        try {
            const rot = itemEntity.getRotation();
            const yawRad = (-rot.y * Math.PI) / 180;
            viewDir = { x: Math.sin(yawRad), y: 0, z: Math.cos(yawRad) };
        } catch {
            // Default forward
        }
    }

    const vLen = Math.sqrt(viewDir.x * viewDir.x + viewDir.y * viewDir.y + viewDir.z * viewDir.z);
    const nx = vLen > 0.001 ? viewDir.x / vLen : 0;
    const ny = vLen > 0.001 ? viewDir.y / vLen : 0;
    const nz = vLen > 0.001 ? viewDir.z / vLen : 1;

    // 4. Blue Line: Look Direction / Line of Sight Vector (Signature Java F3+B)
    if (DroppedItemOutlineConfig.showLookVector) {
        const eyePos: Vector3 = { x: pos.x, y: eyeY, z: pos.z };
        const vectorLength = 0.45; // Extends clearly outside the 0.25m box
        const targetPos: Vector3 = {
            x: eyePos.x + nx * vectorLength,
            y: eyePos.y + ny * vectorLength,
            z: eyePos.z + nz * vectorLength,
        };

        const blueParticle = DroppedItemOutlineConfig.lookVectorParticle || "minecraft:blue_flame_particle";
        spawnLine(dimension, blueParticle, eyePos, targetPos, 5, "minecraft:endrod");
    }

    // 5. Red Line: Horizontal eye-level indicator across front face (Signature Java F3+B)
    if (DroppedItemOutlineConfig.showEyeHeight) {
        const hLen = Math.sqrt(nx * nx + nz * nz);
        const perpX = hLen > 0.001 ? (-nz / hLen) * halfW : halfW;
        const perpZ = hLen > 0.001 ? (nx / hLen) * halfW : 0;
        const frontX = hLen > 0.001 ? (nx / hLen) * halfW : 0;
        const frontZ = hLen > 0.001 ? (nz / hLen) * halfW : halfW;

        const redStart: Vector3 = {
            x: pos.x + frontX - perpX,
            y: eyeY,
            z: pos.z + frontZ - perpZ,
        };
        const redEnd: Vector3 = {
            x: pos.x + frontX + perpX,
            y: eyeY,
            z: pos.z + frontZ + perpZ,
        };

        const redParticle = DroppedItemOutlineConfig.eyeHeightParticle || "minecraft:redstone_wire_dust_particle";
        spawnLine(dimension, redParticle, redStart, redEnd, 3, "minecraft:basic_flame_particle");
    }

    // Optional legacy center axis
    if (DroppedItemOutlineConfig.showCenterAxis) {
        safeSpawnParticle(dimension, "minecraft:endrod", { x: pos.x, y: maxY + 0.08, z: pos.z });
    }
}

/**
 * Updates the Java F3+B debug outline and optional floating nameplate for a dropped item.
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
    const boxParticle = DroppedItemOutlineConfig.colorByRarity && !DroppedItemOutlineConfig.javaDebugStyle
        ? rarity.particleId
        : (DroppedItemOutlineConfig.defaultParticle || "minecraft:endrod");

    const pos = itemEntity.location;

    // 1. Render Java F3+B debug wireframe bounding box
    if (DroppedItemOutlineConfig.showWireframeBox) {
        renderJavaDebugOutline(itemEntity.dimension, itemEntity, pos, boxParticle);
    }

    // 2. Render floating debug info tag (if enabled)
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
function handleScriptEvent(event: { id: string; message?: string; sourceEntity?: any }): void {
    if (!DroppedItemOutlineConfig.enableScriptEventToggle) return;

    if (
        event.id === "qol:item_debug" ||
        event.id === "qol:item_outline" ||
        event.id === "qol:hitbox" ||
        event.id === "qol:debug_items"
    ) {
        const player = event.sourceEntity as Player | undefined;
        const msg = (event.message || "").trim().toLowerCase();

        // Subcommands for granular control
        if (msg === "tags" || msg === "tag" || msg === "name") {
            DroppedItemOutlineConfig.showFloatingInfo = !DroppedItemOutlineConfig.showFloatingInfo;
            if (!DroppedItemOutlineConfig.showFloatingInfo) {
                clearAllDebugTags();
            }
            const status = DroppedItemOutlineConfig.showFloatingInfo ? "§aON" : "§cOFF";
            if (player && player.isValid) {
                player.sendMessage(`§6⚡ [Java Debug] §fFloating Info & Timer Tags: ${status}`);
            }
            return;
        }

        if (msg === "box" || msg === "hitbox" || msg === "wireframe") {
            DroppedItemOutlineConfig.showWireframeBox = !DroppedItemOutlineConfig.showWireframeBox;
            const status = DroppedItemOutlineConfig.showWireframeBox ? "§aON" : "§cOFF";
            if (player && player.isValid) {
                player.sendMessage(`§6⚡ [Java Debug] §fF3+B White Wireframe Bounding Box: ${status}`);
            }
            return;
        }

        if (msg === "vector" || msg === "look" || msg === "blue") {
            DroppedItemOutlineConfig.showLookVector = !DroppedItemOutlineConfig.showLookVector;
            const status = DroppedItemOutlineConfig.showLookVector ? "§aON" : "§cOFF";
            if (player && player.isValid) {
                player.sendMessage(`§6⚡ [Java Debug] §fF3+B Blue Look Vector: ${status}`);
            }
            return;
        }

        // Toggle entire feature
        isFeatureEnabled = !isFeatureEnabled;
        const statusText = isFeatureEnabled ? "§aENABLED" : "§cDISABLED";

        if (!isFeatureEnabled) {
            clearAllDebugTags();
        }

        if (player && player.isValid && player.typeId === "minecraft:player") {
            try {
                player.onScreenDisplay.setActionBar(
                    `§6⚡ [Java Debug F3+B] §fItem Hitboxes & Outlines: ${statusText}`
                );
            } catch {
                player.sendMessage(`§6⚡ [Java Debug F3+B] §fItem Hitboxes & Outlines: ${statusText}`);
            }
        } else {
            console.warn(`[ItemDebug] Java Debug Hitboxes toggled: ${isFeatureEnabled ? "ON" : "OFF"}`);
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
