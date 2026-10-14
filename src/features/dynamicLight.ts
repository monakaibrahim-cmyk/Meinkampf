import {
    Block,
    BlockPermutation,
    Direction,
    EntityComponentTypes,
    EntityEquippableComponent,
    EntityHitBlockAfterEvent,
    EquipmentSlot,
    GameMode,
    ItemStack,
    ItemUseAfterEvent,
    Player,
    system,
    Vector3,
    world,
} from "@minecraft/server";
import { DynamicLightingConfig } from "../config";

/**
 * Held items that emit dynamic light and their corresponding brightness levels (1-15).
 * Complete coverage of all luminous blocks and items across Minecraft Bedrock.
 */
export const HELD_LIGHT_SOURCES: Record<string, number> = {
    // Torches
    "minecraft:torch": 14,
    "minecraft:soul_torch": 10,
    "minecraft:redstone_torch": 7,
    "minecraft:underwater_torch": 14,
    "minecraft:colored_torch_blue": 14,
    "minecraft:colored_torch_red": 14,
    "minecraft:colored_torch_green": 14,
    "minecraft:colored_torch_purple": 14,

    // Lanterns
    "minecraft:lantern": 15,
    "minecraft:soul_lantern": 10,
    "minecraft:sea_lantern": 15,
    "minecraft:jack_o_lantern": 15,
    "minecraft:lit_pumpkin": 15,

    // Campfires
    "minecraft:campfire": 15,
    "minecraft:soul_campfire": 10,

    // Froglights, Fungus & Natural Glowing Flora
    "minecraft:glowstone": 15,
    "minecraft:shroomlight": 15,
    "minecraft:ochre_froglight": 15,
    "minecraft:pearlescent_froglight": 15,
    "minecraft:verdant_froglight": 15,
    "minecraft:glow_berries": 14,
    "minecraft:cave_vines": 14,
    "minecraft:glow_lichen": 7,
    "minecraft:crimson_fungus": 2,
    "minecraft:warped_fungus": 2,

    // Minerals, Redstone & End Items
    "minecraft:amethyst_cluster": 5,
    "minecraft:large_amethyst_bud": 4,
    "minecraft:medium_amethyst_bud": 2,
    "minecraft:small_amethyst_bud": 1,
    "minecraft:redstone_ore": 9,
    "minecraft:lit_redstone_ore": 9,
    "minecraft:deepslate_redstone_ore": 9,
    "minecraft:lit_deepslate_redstone_ore": 9,
    "minecraft:redstone_lamp": 15,
    "minecraft:lit_redstone_lamp": 15,
    "minecraft:end_rod": 14,
    "minecraft:ender_chest": 7,
    "minecraft:crying_obsidian": 10,
    "minecraft:respawn_anchor": 15,
    "minecraft:beacon": 15,
    "minecraft:conduit": 15,

    // Sea & Water Glowing Items
    "minecraft:sea_pickle": 6,

    // Buckets & Liquids
    "minecraft:lava_bucket": 15,

    // Luminous Mob Drops & Materials
    "minecraft:glowstone_dust": 8,
    "minecraft:glow_ink_sac": 8,
    "minecraft:blaze_rod": 6,
    "minecraft:blaze_powder": 6,
    "minecraft:magma_cream": 6,
    "minecraft:magma": 3,
    "minecraft:dragon_breath": 5,
    "minecraft:nether_star": 10,
    "minecraft:fire_charge": 10,

    // Ores & Rare Blocks
    "minecraft:raw_gold": 2,
    "minecraft:raw_iron": 1,
    "minecraft:raw_copper": 1,
    "minecraft:torchflower": 4,

    // Enchanted & Magic Items
    "minecraft:totem_of_undying": 10,
};

/**
 * Supported placeable light source items and their target block IDs.
 */
export const PLACEABLE_LIGHT_BLOCKS: Record<string, string> = {
    "minecraft:torch": "minecraft:torch",
    "minecraft:soul_torch": "minecraft:soul_torch",
    "minecraft:redstone_torch": "minecraft:redstone_torch",
    "minecraft:underwater_torch": "minecraft:underwater_torch",
    "minecraft:colored_torch_blue": "minecraft:colored_torch_blue",
    "minecraft:colored_torch_red": "minecraft:colored_torch_red",
    "minecraft:colored_torch_green": "minecraft:colored_torch_green",
    "minecraft:colored_torch_purple": "minecraft:colored_torch_purple",
    "minecraft:lantern": "minecraft:lantern",
    "minecraft:soul_lantern": "minecraft:soul_lantern",
    "minecraft:sea_lantern": "minecraft:sea_lantern",
    "minecraft:candle": "minecraft:candle",
    "minecraft:end_rod": "minecraft:end_rod",
};

interface PlayerLightState {
    dimId: string;
    pos: Vector3;
    lightLevel: number;
}

const playerLightMap = new Map<string, PlayerLightState>();

/**
 * Returns the highest light level emitted by an item stack (0 if non-luminous).
 */
function getItemLightLevel(itemStack: ItemStack | undefined): number {
    if (!itemStack) return 0;
    return HELD_LIGHT_SOURCES[itemStack.typeId] ?? 0;
}

/**
 * Removes any dynamic light block spawned by a player.
 */
function clearPlayerLight(playerId: string): void {
    const state = playerLightMap.get(playerId);
    if (!state) return;

    try {
        const dim = world.getDimension(state.dimId);
        const block = dim.getBlock(state.pos);
        if (block && block.typeId.startsWith("minecraft:light_block_")) {
            block.setPermutation(BlockPermutation.resolve("minecraft:air"));
        }
    } catch {
        // Dimension / unloaded chunk safety
    }

    playerLightMap.delete(playerId);
}

/**
 * Updates dynamic lighting around a player based on held light sources.
 */
function updatePlayerLight(player: Player): void {
    if (!player || !player.isValid) return;

    // Spectator and dead players emit no light
    if (player.getGameMode() === GameMode.Spectator) {
        clearPlayerLight(player.id);
        return;
    }

    let mainhandLight = 0;
    let offhandLight = 0;

    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (equippable) {
            if (DynamicLightingConfig.mainHand) {
                mainhandLight = getItemLightLevel(equippable.getEquipment(EquipmentSlot.Mainhand));
            }
            if (DynamicLightingConfig.offhand) {
                offhandLight = getItemLightLevel(equippable.getEquipment(EquipmentSlot.Offhand));
            }
        }
    } catch {
        // Equipment query safety
    }

    const currentLight = Math.max(mainhandLight, offhandLight);

    if (currentLight === 0) {
        clearPlayerLight(player.id);
        return;
    }

    // Determine target location: eye position first, feet fallback
    const headLoc = player.getHeadLocation();
    const headPos: Vector3 = {
        x: Math.floor(headLoc.x),
        y: Math.floor(headLoc.y),
        z: Math.floor(headLoc.z),
    };

    let targetPos = headPos;
    let block: Block | undefined;

    try {
        const headBlock = player.dimension.getBlock(headPos);
        if (headBlock && (headBlock.isAir || headBlock.typeId.startsWith("minecraft:light_block_"))) {
            block = headBlock;
        }
    } catch {
        // Dimension query safety
    }

    if (!block) {
        const feetLoc = player.location;
        const feetPos: Vector3 = {
            x: Math.floor(feetLoc.x),
            y: Math.floor(feetLoc.y),
            z: Math.floor(feetLoc.z),
        };

        try {
            const feetBlock = player.dimension.getBlock(feetPos);
            if (feetBlock && (feetBlock.isAir || feetBlock.typeId.startsWith("minecraft:light_block_"))) {
                targetPos = feetPos;
                block = feetBlock;
            }
        } catch {
            // Dimension query safety
        }
    }

    const currentState = playerLightMap.get(player.id);

    // If player is still in the same block and light level hasn't changed, skip completely
    if (
        currentState &&
        currentState.dimId === player.dimension.id &&
        currentState.pos.x === targetPos.x &&
        currentState.pos.y === targetPos.y &&
        currentState.pos.z === targetPos.z &&
        currentState.lightLevel === currentLight
    ) {
        return;
    }

    // Player moved or changed light level: clear previous block
    clearPlayerLight(player.id);

    try {
        if (block && (block.isAir || block.typeId.startsWith("minecraft:light_block_"))) {
            const lightBlockId = `minecraft:light_block_${currentLight}`;
            block.setPermutation(BlockPermutation.resolve(lightBlockId));

            playerLightMap.set(player.id, {
                dimId: player.dimension.id,
                pos: targetPos,
                lightLevel: currentLight,
            });
        }
    } catch {
        // Unloaded chunk safety
    }
}

/**
 * Checks whether an item type is a torch, lantern, or candle
 * that is supported for right-click offhand equipping.
 */
export function isOffhandEquippableLight(typeId: string): boolean {
    return (
        typeId.includes("torch") ||
        typeId.includes("lantern") ||
        typeId.includes("candle")
    );
}

const placementCooldown = new Set<string>();

/**
 * Calculates target location based on the face that was hit or targeted.
 */
function offsetLocationFromFace(blockLocation: Vector3, face: Direction | string): Vector3 | null {
    const location: Vector3 = {
        x: blockLocation.x,
        y: blockLocation.y,
        z: blockLocation.z,
    };

    switch (String(face)) {
        case "Up":
            location.y++;
            break;
        case "Down":
            location.y--;
            break;
        case "North":
            location.z--;
            break;
        case "South":
            location.z++;
            break;
        case "East":
            location.x++;
            break;
        case "West":
            location.x--;
            break;
        default:
            return null;
    }

    return location;
}

/**
 * Resolves placement target and hit face from player view direction.
 */
function placementTargetFromView(player: Player): { block: Block; location: Vector3; face: string } | null {
    let view;
    try {
        view = player.getBlockFromViewDirection({ maxDistance: 7 });
    } catch {
        return null;
    }

    if (!view?.block) return null;

    const location = offsetLocationFromFace(view.block.location, view.face);
    return location ? { block: view.block, location, face: String(view.face) } : null;
}

/**
 * Resolves proper block permutation including wall/standing orientation for torches
 * and hanging states for lanterns.
 */
function resolveLightPermutation(blockId: string, face: string): BlockPermutation | null {
    try {
        if (blockId.includes("torch")) {
            if (face === "Down") return null; // Torches cannot hang from ceiling
            const faceMap: Record<string, string> = {
                Up: "top",
                North: "north",
                South: "south",
                East: "east",
                West: "west",
            };
            const dir = faceMap[face];
            if (dir) {
                return BlockPermutation.resolve(blockId, { torch_facing_direction: dir });
            }
        } else if (blockId.includes("lantern")) {
            if (face === "Down") {
                return BlockPermutation.resolve(blockId, { hanging: true });
            } else if (face === "Up") {
                return BlockPermutation.resolve(blockId, { hanging: false });
            }
        }
    } catch {
        // Fallback to default permutation if states resolution fails
    }

    try {
        return BlockPermutation.resolve(blockId);
    } catch {
        return null;
    }
}

/**
 * Safely updates or clears the offhand slot using Script API, falling back to
 * `replaceitem` command for items that lack vanilla Bedrock `allow_off_hand`.
 */
function replaceOffhandSlot(
    player: Player,
    equippable: EntityEquippableComponent | undefined,
    itemStack: ItemStack | undefined
): boolean {
    if (equippable) {
        try {
            const changed = equippable.setEquipment(
                EquipmentSlot.Offhand,
                itemStack ? itemStack.clone() : undefined
            );
            if (changed) return true;
        } catch {
            // Script API failed, try command fallback
        }
    }

    try {
        const command = itemStack
            ? `replaceitem entity @s slot.weapon.offhand 0 ${itemStack.typeId} ${itemStack.amount}`
            : "replaceitem entity @s slot.weapon.offhand 0 air";

        const result = player.runCommand(command);
        return Boolean(result && result.successCount > 0);
    } catch {
        return false;
    }
}

/**
 * Decrements offhand item stack size by 1 or clears if empty.
 */
function replaceOffhandAmount(
    player: Player,
    equippable: EntityEquippableComponent | undefined,
    originalOffhand: ItemStack
): boolean {
    if (originalOffhand.amount <= 1) {
        return replaceOffhandSlot(player, equippable, undefined);
    }

    const remaining = originalOffhand.clone();
    remaining.amount -= 1;

    return replaceOffhandSlot(player, equippable, remaining);
}

/**
 * Places light block from offhand slot without triggering the client prediction stack reset bug.
 */
function placeOffhandLight(player: Player, targetLocation: Vector3, face: string): void {
    if (placementCooldown.has(player.id)) return;
    if (!DynamicLightingConfig.enabled || !DynamicLightingConfig.allowOffhandPlacement) return;
    if (!player.isSneaking) return;

    let equippable: EntityEquippableComponent | undefined;
    let offhand: ItemStack | undefined;

    try {
        equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
    } catch {
        return;
    }

    if (!equippable || !offhand) return;

    const blockId = PLACEABLE_LIGHT_BLOCKS[offhand.typeId];
    if (!blockId) return;

    let targetBlock: Block | undefined;
    let permutation: BlockPermutation | null = null;

    try {
        targetBlock = player.dimension.getBlock(targetLocation);
        if (!targetBlock) return;
        // Target block must be air or a dynamic light placeholder
        if (!targetBlock.isAir && !targetBlock.typeId.startsWith("minecraft:light_block_")) {
            return;
        }
        permutation = resolveLightPermutation(blockId, face);
        if (!permutation) return;
    } catch {
        return;
    }

    const isCreative = player.getGameMode() === GameMode.Creative;
    const originalOffhand = offhand.clone();

    try {
        if (!isCreative) {
            const itemUpdated = replaceOffhandAmount(player, equippable, originalOffhand);
            if (!itemUpdated) return;
        }

        try {
            targetBlock.setPermutation(permutation);
        } catch {
            // Restore offhand stack if block placement failed
            if (!isCreative) {
                replaceOffhandSlot(player, equippable, originalOffhand);
            }
            return;
        }

        placementCooldown.add(player.id);
        system.runTimeout(() => placementCooldown.delete(player.id), 2);
    } catch {
        if (!isCreative) {
            try {
                replaceOffhandSlot(player, equippable, originalOffhand);
            } catch {
                // Player or inventory became unavailable
            }
        }
    }
}

/**
 * Handles right-clicking with a light source looking at air to equip it to offhand.
 */
function handleItemUse(event: ItemUseAfterEvent): void {
    const source = event.source;
    if (!(source instanceof Player) || !event.itemStack) return;

    if (!DynamicLightingConfig.enabled || !DynamicLightingConfig.allowOffhandEquipOnUse) return;
    if (DynamicLightingConfig.requireSneakToEquip && !source.isSneaking) return;

    const typeId = event.itemStack.typeId;
    if (!isOffhandEquippableLight(typeId)) return;

    let blockInView;
    try {
        blockInView = source.getBlockFromViewDirection({ maxDistance: 8 });
    } catch {
        return;
    }

    // Only equip to offhand when right-clicking into air
    if (blockInView) return;

    let equippable: EntityEquippableComponent | undefined;
    let offhand: ItemStack | undefined;
    let mainhand: ItemStack | undefined;

    try {
        equippable = source.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!equippable) return;
        offhand = equippable.getEquipment(EquipmentSlot.Offhand);
        mainhand = equippable.getEquipment(EquipmentSlot.Mainhand);
    } catch {
        return;
    }

    if (offhand || !mainhand || mainhand.typeId !== typeId) {
        return;
    }

    const movedItem = mainhand.clone();

    try {
        const placedWithApi = equippable.setEquipment(EquipmentSlot.Offhand, movedItem);
        if (placedWithApi) {
            const removed = equippable.setEquipment(EquipmentSlot.Mainhand, undefined);
            if (!removed) {
                equippable.setEquipment(EquipmentSlot.Offhand, undefined);
            }
            return;
        }

        // Fallback for items that vanilla Bedrock doesn't normally allow in offhand
        const result = source.runCommand(
            `replaceitem entity @s slot.weapon.offhand 0 ${mainhand.typeId} ${mainhand.amount}`
        );
        if (!result || result.successCount < 1) {
            return;
        }

        let removed = equippable.setEquipment(EquipmentSlot.Mainhand, undefined);
        if (!removed) {
            const inventory = source.getComponent(EntityComponentTypes.Inventory)?.container;
            const selectedSlot = source.selectedSlotIndex;
            const selectedItem = inventory?.getItem(selectedSlot);
            if (inventory && selectedItem?.typeId === mainhand.typeId) {
                inventory.setItem(selectedSlot, undefined);
                removed = true;
            }
        }

        if (!removed) {
            source.runCommand("replaceitem entity @s slot.weapon.offhand 0 air");
        }
    } catch {
        try {
            source.runCommand("replaceitem entity @s slot.weapon.offhand 0 air");
        } catch {
            // Player or inventory became unavailable
        }
    }
}

/**
 * Handles crouching and punching/hitting a block to place light block from offhand.
 */
function handleHitBlock(event: EntityHitBlockAfterEvent): void {
    const player = event.damagingEntity;
    if (!(player instanceof Player)) return;

    if (!DynamicLightingConfig.enabled || !DynamicLightingConfig.allowOffhandPlacement) {
        return;
    }

    if (!player.isSneaking) return;

    let hitBlock = event.hitBlock;
    let face = String(event.blockFace);

    if (!face || face === "undefined") {
        const target = placementTargetFromView(player);
        if (target) {
            hitBlock = target.block;
            face = target.face;
        }
    }

    if (!hitBlock || !face) return;

    const targetLoc = offsetLocationFromFace(hitBlock.location, face);
    if (targetLoc) {
        placeOffhandLight(player, targetLoc, face);
    }
}

/**
 * Automatically merges partial stacks of light source items in player inventory.
 */
export function mergeSupportedLightStacks(player: Player): void {
    if (!DynamicLightingConfig.autoMergeLightStacks) return;
    try {
        const inventory = player.getComponent(EntityComponentTypes.Inventory)?.container;
        if (!inventory) return;

        for (let targetSlot = 0; targetSlot < inventory.size; targetSlot++) {
            const target = inventory.getItem(targetSlot);
            if (!target || target.maxAmount <= 1 || !(target.typeId in HELD_LIGHT_SOURCES)) {
                continue;
            }

            for (let sourceSlot = targetSlot + 1; sourceSlot < inventory.size; sourceSlot++) {
                const source = inventory.getItem(sourceSlot);
                if (!source) continue;

                let stackable = false;
                try {
                    stackable = target.isStackableWith(source);
                } catch {
                    continue;
                }

                if (!stackable) continue;

                const availableSpace = target.maxAmount - target.amount;
                if (availableSpace <= 0) break;

                const amountToMove = Math.min(availableSpace, source.amount);
                target.amount += amountToMove;
                inventory.setItem(targetSlot, target);

                if (amountToMove >= source.amount) {
                    inventory.setItem(sourceSlot, undefined);
                } else {
                    source.amount -= amountToMove;
                    inventory.setItem(sourceSlot, source);
                }
            }
        }
    } catch {
        // Inventory safety
    }
}

/**
 * Initializes the lightweight Dynamic Lighting feature.
 */
export function initDynamicLightingFeature(): void {
    if (!DynamicLightingConfig.enabled) {
        console.warn("[DynamicLight] Feature is disabled in configuration.");
        return;
    }

    // Periodic light update and stack merge loop
    const intervalTicks = DynamicLightingConfig.updateIntervalTicks ?? 4;
    let mergeTicks = 0;

    system.runInterval(() => {
        try {
            const players = world.getAllPlayers();
            mergeTicks += intervalTicks;
            const shouldMerge = mergeTicks >= 20 && DynamicLightingConfig.autoMergeLightStacks;
            if (shouldMerge) {
                mergeTicks = 0;
            }

            for (const player of players) {
                updatePlayerLight(player);
                if (shouldMerge) {
                    mergeSupportedLightStacks(player);
                }
            }
        } catch {
            // Player query safety
        }
    }, intervalTicks);

    // Event listeners for offhand equipping & placement
    world.afterEvents.itemUse.subscribe(handleItemUse);
    world.afterEvents.entityHitBlock.subscribe(handleHitBlock);

    // Clean up light blocks on player leave, dimension change, death, or respawn
    world.afterEvents.playerLeave.subscribe((event) => {
        clearPlayerLight(event.playerId);
    });

    world.afterEvents.playerDimensionChange.subscribe((event) => {
        clearPlayerLight(event.player.id);
    });

    world.afterEvents.entityDie.subscribe((event) => {
        if (event.deadEntity.typeId === "minecraft:player") {
            clearPlayerLight(event.deadEntity.id);
        }
    });

    world.afterEvents.playerSpawn.subscribe((event) => {
        clearPlayerLight(event.player.id);
    });

    console.warn("[DynamicLight] Feature initialized successfully.");
}
