import {
    Block,
    BlockPermutation,
    EntityComponentTypes,
    EntityEquippableComponent,
    EquipmentSlot,
    GameMode,
    ItemStack,
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
            if (DynamicLightingConfig.offHand) {
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
 * Initializes the lightweight Dynamic Lighting feature.
 */
export function initDynamicLightingFeature(): void {
    if (!DynamicLightingConfig.enabled) {
        console.warn("[DynamicLight] Feature is disabled in configuration.");
        return;
    }

    // Periodic light update loop
    const intervalTicks = DynamicLightingConfig.updateIntervalTicks ?? 4;

    system.runInterval(() => {
        try {
            const players = world.getAllPlayers();
            for (const player of players) {
                updatePlayerLight(player);
            }
        } catch {
            // Player query safety
        }
    }, intervalTicks);

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
