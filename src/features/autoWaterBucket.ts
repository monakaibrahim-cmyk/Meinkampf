import {
    BlockPermutation,
    Dimension,
    EntityComponentTypes,
    EntityEquippableComponent,
    EntityHealthComponent,
    EquipmentSlot,
    GameMode,
    ItemStack,
    Player,
    system,
    Vector3,
    world,
} from "@minecraft/server";
import { AutoWaterBucketConfig } from "../config";
import { showPlayerNotification } from "../utils/notifications";

interface FallTracker {
    highestY: number;
    isFalling: boolean;
}

interface BucketLocation {
    type: "mainhand" | "inventory";
    slotIndex?: number;
}

// Passable or replaceable blocks that should not count as the solid impact surface
const PASSABLE_OR_REPLACEABLE = new Set([
    "minecraft:air",
    "minecraft:short_grass",
    "minecraft:tall_grass",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:deadbush",
    "minecraft:snow_layer",
    "minecraft:yellow_flower",
    "minecraft:red_flower",
    "minecraft:wither_rose",
    "minecraft:poppy",
    "minecraft:dandelion",
    "minecraft:torch",
    "minecraft:soul_torch",
    "minecraft:redstone_torch",
    "minecraft:redstone_wire",
    "minecraft:tripwire",
    "minecraft:lever",
    "minecraft:wooden_button",
    "minecraft:stone_button",
    "minecraft:light_block",
]);

// Blocks that already negate or heavily cushion fall damage
const SAFE_LANDING_BLOCKS = new Set([
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:slime",
    "minecraft:cobweb",
    "minecraft:scaffolding",
    "minecraft:hay_block",
    "minecraft:honey_block",
    "minecraft:powder_snow",
]);

// Active tracking maps (keyed by player ID)
const fallTracking = new Map<string, FallTracker>();
const cooldowns = new Map<string, number>();

/**
 * Searches the player's hands and inventory for a water bucket.
 */
function findWaterBucket(player: Player): BucketLocation | undefined {
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (equippable) {
            const mainhand = equippable.getEquipment(EquipmentSlot.Mainhand);
            if (mainhand && mainhand.typeId === "minecraft:water_bucket") {
                return { type: "mainhand" };
            }
        }

        const inv = player.getComponent(EntityComponentTypes.Inventory);
        if (inv && inv.container) {
            const container = inv.container;
            const maxSlot = AutoWaterBucketConfig.searchEntireInventory ? container.size : 9;
            for (let i = 0; i < maxSlot; i++) {
                const item = container.getItem(i);
                if (item && item.typeId === "minecraft:water_bucket") {
                    return { type: "inventory", slotIndex: i };
                }
            }
        }
    } catch {
        // Fallback
    }
    return undefined;
}

/**
 * Converts a water bucket into an empty bucket at its original slot.
 */
function consumeWaterBucket(player: Player, loc: BucketLocation): void {
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (loc.type === "mainhand" && equippable) {
            equippable.setEquipment(EquipmentSlot.Mainhand, new ItemStack("minecraft:bucket", 1));
            return;
        }
        if (loc.type === "inventory" && loc.slotIndex !== undefined) {
            const inv = player.getComponent(EntityComponentTypes.Inventory);
            if (inv && inv.container) {
                inv.container.setItem(loc.slotIndex, new ItemStack("minecraft:bucket", 1));
                return;
            }
        }
    } catch {
        // Fallback
    }
}

/**
 * Restores the empty bucket back to a water bucket in the player's inventory or hands.
 */
function restoreWaterBucket(player: Player): void {
    if (!player || !player.isValid) return;

    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (equippable) {
            const mainhand = equippable.getEquipment(EquipmentSlot.Mainhand);
            if (mainhand && mainhand.typeId === "minecraft:bucket") {
                equippable.setEquipment(EquipmentSlot.Mainhand, new ItemStack("minecraft:water_bucket", 1));
                if (AutoWaterBucketConfig.playEffects) {
                    player.dimension.playSound("bucket.fill_water", player.location, { volume: 0.8, pitch: 1.1 });
                }
                return;
            }
        }

        const inv = player.getComponent(EntityComponentTypes.Inventory);
        if (inv && inv.container) {
            const container = inv.container;
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item && item.typeId === "minecraft:bucket") {
                    container.setItem(i, new ItemStack("minecraft:water_bucket", 1));
                    if (AutoWaterBucketConfig.playEffects) {
                        player.dimension.playSound("bucket.fill_water", player.location, { volume: 0.8, pitch: 1.1 });
                    }
                    return;
                }
            }

            // Fallback: If empty bucket was displaced, add water bucket directly
            container.addItem(new ItemStack("minecraft:water_bucket", 1));
        }
    } catch {
        // Fallback
    }
}

/**
 * Processes fall detection and clutches for a single player.
 */
function processPlayerFall(player: Player, currentTick: number): void {
    if (!player.isValid) return;

    // Check cooldown
    const cd = cooldowns.get(player.id);
    if (cd && currentTick < cd) return;

    // Ignore creative or spectator mode
    try {
        const gm = player.getGameMode();
        if (gm === GameMode.Creative || gm === GameMode.Spectator) {
            fallTracking.delete(player.id);
            return;
        }
    } catch {
        // Fallback
    }

    // Ignore if player is riding a mount/vehicle, climbing, swimming, flying, or gliding with Elytra
    if (
        player.isGliding ||
        player.isClimbing ||
        player.isSwimming ||
        player.isFlying ||
        player.hasComponent("minecraft:riding")
    ) {
        fallTracking.delete(player.id);
        return;
    }

    const velocity = player.getVelocity();

    // Reset or update tracker if player is on ground or moving upwards
    if (player.isOnGround || velocity.y >= -0.1) {
        fallTracking.set(player.id, {
            highestY: player.location.y,
            isFalling: false,
        });
        return;
    }

    // Fast early exit: If vertical speed is not rapidly downward, do not inspect blocks
    if (velocity.y > AutoWaterBucketConfig.downwardVelocityThreshold) {
        const tracker = fallTracking.get(player.id);
        if (tracker && player.location.y > tracker.highestY) {
            tracker.highestY = player.location.y;
        }
        return;
    }

    // Initialize or retrieve fall tracker
    let tracker = fallTracking.get(player.id);
    if (!tracker) {
        tracker = { highestY: player.location.y, isFalling: true };
        fallTracking.set(player.id, tracker);
    } else {
        tracker.isFalling = true;
    }

    const fallDistance = tracker.highestY - player.location.y;
    // Vanilla fall damage starts above 3 blocks
    if (fallDistance < 3.5) {
        return;
    }

    const projectedDamage = Math.max(0, fallDistance - 3);

    // Filter by configured sensitivity mode
    if (AutoWaterBucketConfig.mode === "lethal_only") {
        const healthComp = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
        const currentHealth = healthComp?.currentValue ?? 20;
        if (projectedDamage < currentHealth) {
            return;
        }
    } else {
        if (fallDistance < AutoWaterBucketConfig.minFallDistance) {
            return;
        }
    }

    const dimension = player.dimension;
    const isNether = dimension.id === "minecraft:nether";
    const playerLoc = player.location;
    const blockX = Math.floor(playerLoc.x);
    const blockZ = Math.floor(playerLoc.z);
    const playerY = Math.floor(playerLoc.y);

    // Scan down 1 to 4 blocks directly beneath the player to identify the ground impact surface
    let groundY: number | null = null;
    let groundBlockType = "";

    for (let y = playerY - 1; y >= playerY - 4; y--) {
        const block = dimension.getBlock({ x: blockX, y, z: blockZ });
        if (!block) break;

        const typeId = block.typeId;
        if (PASSABLE_OR_REPLACEABLE.has(typeId)) continue;

        groundY = y;
        groundBlockType = typeId;
        break;
    }

    if (groundY === null) {
        // Ground is still further down; wait for next tick
        return;
    }

    // If landing on a block that already cushions or eliminates fall damage, do not place water
    if (SAFE_LANDING_BLOCKS.has(groundBlockType)) {
        fallTracking.delete(player.id);
        return;
    }

    // Calculate distance to the top surface of the ground block
    const distanceToGround = playerLoc.y - (groundY + 1);

    // Trigger clutch only within the precise window before impact
    if (distanceToGround > AutoWaterBucketConfig.triggerDistanceBlocks || distanceToGround < 0.1) {
        return;
    }

    // The placement target is directly above the solid ground block
    const targetPos = { x: blockX, y: groundY + 1, z: blockZ };
    const targetBlock = dimension.getBlock(targetPos);
    if (!targetBlock) return;

    // Target block must be air or a replaceable non-solid block
    if (!PASSABLE_OR_REPLACEABLE.has(targetBlock.typeId) && targetBlock.typeId !== "minecraft:air") {
        return;
    }

    // In the Nether, water instantly evaporates
    if (isNether) {
        cooldowns.set(player.id, currentTick + AutoWaterBucketConfig.cooldownTicks);
        fallTracking.delete(player.id);
        if (AutoWaterBucketConfig.playEffects) {
            dimension.playSound("random.fizz", playerLoc, { volume: 0.8, pitch: 1.2 });
        }
        if (AutoWaterBucketConfig.notifyPlayer) {
            showPlayerNotification(player, "§c[MLG Clutch] §fWater evaporates in the Nether!");
        }
        return;
    }

    // Locate water bucket in player's inventory or hands
    const bucketLoc = findWaterBucket(player);
    if (!bucketLoc) {
        return; // No water bucket available
    }

    // === EXECUTE CLUTCH ===
    consumeWaterBucket(player, bucketLoc);

    targetBlock.setPermutation(BlockPermutation.resolve("minecraft:water"));

    // Set cooldown and clear active fall tracking
    cooldowns.set(player.id, currentTick + AutoWaterBucketConfig.cooldownTicks);
    fallTracking.delete(player.id);

    // Audio-visual feedback
    if (AutoWaterBucketConfig.playEffects) {
        dimension.playSound("bucket.empty_water", playerLoc, { volume: 0.9, pitch: 1.0 });
        try {
            dimension.spawnParticle("minecraft:water_splash_particle", targetBlock.location);
        } catch {
            // Particle optional
        }
    }

    if (AutoWaterBucketConfig.notifyPlayer) {
        showPlayerNotification(player, "§b⚡ [MLG Clutch] §fWater bucket clutch saved your fall!");
    }

    // Auto-retrieve water after delay to avoid accidental flooding
    if (AutoWaterBucketConfig.autoRetrieveWater) {
        system.runTimeout(() => {
            try {
                const currentBlock = dimension.getBlock(targetPos);
                if (
                    currentBlock &&
                    (currentBlock.typeId === "minecraft:water" || currentBlock.typeId === "minecraft:flowing_water")
                ) {
                    currentBlock.setPermutation(BlockPermutation.resolve("minecraft:air"));
                }

                restoreWaterBucket(player);
            } catch {
                // Safeguard against unloaded chunks or player leaving
            }
        }, AutoWaterBucketConfig.retrieveDelayTicks);
    }
}

/**
 * Initializes the Auto Water Bucket feature loop.
 */
export function initAutoWaterBucketFeature(): void {
    if (!AutoWaterBucketConfig.enabled) return;

    // Clean up maps when a player leaves to prevent memory leaks
    world.afterEvents.playerLeave.subscribe((event) => {
        fallTracking.delete(event.playerId);
        cooldowns.delete(event.playerId);
    });

    let currentTick = 0;

    system.runInterval(() => {
        currentTick++;
        if (!AutoWaterBucketConfig.enabled) return;

        const players = world.getAllPlayers();
        if (players.length === 0) return;

        for (const player of players) {
            try {
                processPlayerFall(player, currentTick);
            } catch {
                // Ignore unexpected tick errors
            }
        }
    }, 1);
}
