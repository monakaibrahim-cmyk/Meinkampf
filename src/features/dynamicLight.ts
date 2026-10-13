import {
    BlockPermutation,
    Container,
    EntityComponentTypes,
    EntityEquippableComponent,
    EntityInventoryComponent,
    EquipmentSlot,
    ItemStack,
    Player,
    system,
    Vector3,
    world,
} from "@minecraft/server";
import { DynamicLightingConfig } from "../config";
import { showPlayerNotification } from "../utils/notifications";

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
    "minecraft:cave_vines_body_with_berries": 14,
    "minecraft:cave_vines_head_with_berries": 14,
    "minecraft:glow_lichen": 7,
    "minecraft:sea_pickle": 6,

    // Copper Bulbs (all oxidation states & waxed variants from 1.21 Tricky Trials)
    "minecraft:copper_bulb": 15,
    "minecraft:waxed_copper_bulb": 15,
    "minecraft:exposed_copper_bulb": 12,
    "minecraft:waxed_exposed_copper_bulb": 12,
    "minecraft:weathered_copper_bulb": 8,
    "minecraft:waxed_weathered_copper_bulb": 8,
    "minecraft:oxidized_copper_bulb": 4,
    "minecraft:waxed_oxidized_copper_bulb": 4,

    // Amethyst Crystals
    "minecraft:amethyst_cluster": 5,
    "minecraft:large_amethyst_bud": 4,
    "minecraft:medium_amethyst_bud": 2,
    "minecraft:small_amethyst_bud": 1,

    // Nether, End & Mystical Blocks
    "minecraft:beacon": 15,
    "minecraft:conduit": 15,
    "minecraft:respawn_anchor": 15,
    "minecraft:crying_obsidian": 10,
    "minecraft:magma": 3,
    "minecraft:magma_block": 3,
    "minecraft:ender_chest": 7,
    "minecraft:enchanting_table": 7,
    "minecraft:end_rod": 14,
    "minecraft:end_crystal": 14,
    "minecraft:dragon_egg": 1,
    "minecraft:brewing_stand": 1,
    "minecraft:sculk_catalyst": 6,
    "minecraft:sculk_sensor": 1,
    "minecraft:calibrated_sculk_sensor": 1,
    "minecraft:torchflower": 4,

    // Hot, Glowing Items & Ingredients
    "minecraft:lava_bucket": 15,
    "minecraft:fire_charge": 10,
    "minecraft:blaze_rod": 6,
    "minecraft:blaze_powder": 4,
    "minecraft:glowstone_dust": 8,
    "minecraft:glow_ink_sac": 8,
    "minecraft:glow_frame": 8,
    "minecraft:glow_item_frame": 8,
    "minecraft:nether_star": 12,
    "minecraft:totem_of_undying": 10,
};

/**
 * All torch and lantern item identifiers that can be equipped directly into the offhand slot.
 */
export const OFFHAND_LIGHT_ITEMS: Set<string> = new Set([
    // Torches
    "minecraft:torch",
    "minecraft:soul_torch",
    "minecraft:redstone_torch",
    "minecraft:underwater_torch",
    "minecraft:colored_torch_blue",
    "minecraft:colored_torch_red",
    "minecraft:colored_torch_green",
    "minecraft:colored_torch_purple",

    // Lanterns
    "minecraft:lantern",
    "minecraft:soul_lantern",
    "minecraft:sea_lantern",
    "minecraft:jack_o_lantern",
    "minecraft:lit_pumpkin",
]);

/**
 * Checks whether an item type ID is an offhand-eligible torch or lantern.
 */
export function isTorchOrLantern(typeId: string): boolean {
    return OFFHAND_LIGHT_ITEMS.has(typeId);
}

/**
 * Formats a raw Minecraft typeId into clean Title Case (e.g. "Soul Lantern").
 */
function formatItemName(typeId: string): string {
    const raw = typeId.replace(/^minecraft:/, "");
    return raw
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/**
 * Retrieves the inventory container of a player safely.
 */
function getPlayerContainer(player: Player): Container | undefined {
    const inv =
        (player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined) ??
        (player.getComponent("inventory") as EntityInventoryComponent | undefined) ??
        (player.getComponent("minecraft:inventory") as EntityInventoryComponent | undefined);
    return inv?.container;
}

/**
 * Checks if the player is currently holding a torch or lantern in their offhand.
 */
export function isPlayerOffhandHoldingLight(player: Player): boolean {
    if (!player || !player.isValid) return false;
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!equippable) return false;
        const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
        return offhand ? isTorchOrLantern(offhand.typeId) : false;
    } catch {
        return false;
    }
}

/**
 * Equips or swaps a torch/lantern between mainhand and offhand.
 */
export function equipToOffhand(player: Player, notify = true): boolean {
    if (!player || !player.isValid) return false;

    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!equippable) return false;

        const mainItem = equippable.getEquipment(EquipmentSlot.Mainhand);
        const offItem = equippable.getEquipment(EquipmentSlot.Offhand);

        const mainIsLight = mainItem ? isTorchOrLantern(mainItem.typeId) : false;
        const offIsLight = offItem ? isTorchOrLantern(offItem.typeId) : false;

        if (!mainIsLight && !offIsLight) {
            return false;
        }

        // Swap mainhand and offhand equipment slots
        equippable.setEquipment(EquipmentSlot.Offhand, mainItem);
        equippable.setEquipment(EquipmentSlot.Mainhand, offItem);

        if (DynamicLightingConfig.playOffhandSound) {
            try {
                player.dimension.playSound("armor.equip_generic", player.location, { volume: 0.8, pitch: 1.1 });
            } catch {
                // Sound safety
            }
        }

        if (notify && DynamicLightingConfig.showEquipNotification) {
            const equipped = mainIsLight ? mainItem : offItem;
            if (equipped) {
                const name = formatItemName(equipped.typeId);
                const action = mainIsLight ? "Equipped to Offhand (Shield Slot)" : "Swapped to Main Hand";
                showPlayerNotification(player, `§6✦ ${name} ${action}! ✦§r`);
            }
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Equips a torch or lantern from anywhere (mainhand, offhand, or backpack inventory).
 * If a torch/lantern is already in the offhand, it unequips it back into mainhand or inventory.
 */
export function equipToOffhandFromAnywhere(player: Player): boolean {
    if (!player || !player.isValid) return false;

    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!equippable) return false;

        const mainItem = equippable.getEquipment(EquipmentSlot.Mainhand);
        const offItem = equippable.getEquipment(EquipmentSlot.Offhand);

        // 1. If holding torch or lantern in main hand, swap directly into offhand
        if (mainItem && isTorchOrLantern(mainItem.typeId)) {
            return equipToOffhand(player, true);
        }

        // 2. If offhand already has a torch/lantern, unequip it
        if (offItem && isTorchOrLantern(offItem.typeId)) {
            if (!mainItem) {
                return equipToOffhand(player, true);
            }
            const container = getPlayerContainer(player);
            if (container) {
                const leftover = container.addItem(offItem);
                equippable.setEquipment(EquipmentSlot.Offhand, leftover);
                if (DynamicLightingConfig.playOffhandSound) {
                    try {
                        player.dimension.playSound("armor.equip_generic", player.location, { volume: 0.8, pitch: 0.9 });
                    } catch {}
                }
                const name = formatItemName(offItem.typeId);
                showPlayerNotification(player, `§7✦ ${name} Unequipped to Inventory ✦§r`);
                return true;
            } else {
                return equipToOffhand(player, true);
            }
        }

        // 3. Scan inventory container for any torch or lantern
        const container = getPlayerContainer(player);
        if (container) {
            for (let i = 0; i < container.size; i++) {
                const slotItem = container.getItem(i);
                if (slotItem && isTorchOrLantern(slotItem.typeId)) {
                    // Move torch/lantern to offhand and put previous offhand item into container slot
                    container.setItem(i, offItem);
                    equippable.setEquipment(EquipmentSlot.Offhand, slotItem);

                    if (DynamicLightingConfig.playOffhandSound) {
                        try {
                            player.dimension.playSound("armor.equip_generic", player.location, { volume: 0.8, pitch: 1.1 });
                        } catch {}
                    }
                    const name = formatItemName(slotItem.typeId);
                    showPlayerNotification(player, `§6✦ ${name} Equipped to Offhand from Backpack! ✦§r`);
                    return true;
                }
            }
        }

        showPlayerNotification(player, "§cNo torch or lantern found in inventory!§r");
        return false;
    } catch {
        return false;
    }
}

interface PlayerLightState {
    dimId: string;
    pos: Vector3;
    lightLevel: number;
}

const playerLightMap = new Map<string, PlayerLightState>();

/**
 * Returns the light level emitted by a held item (0 if non-luminous).
 */
function getItemLightLevel(item?: ItemStack): number {
    if (!item) return 0;
    return HELD_LIGHT_SOURCES[item.typeId] ?? 0;
}

/**
 * Clears the active dynamic light block for a player.
 */
function clearPlayerLight(playerId: string): void {
    const state = playerLightMap.get(playerId);
    if (!state) return;

    playerLightMap.delete(playerId);

    try {
        const dim = world.getDimension(state.dimId);
        if (!dim) return;

        const block = dim.getBlock(state.pos);
        if (block && block.typeId.startsWith("minecraft:light_block_")) {
            block.setPermutation(BlockPermutation.resolve("minecraft:air"));
        }
    } catch {
        // Unloaded chunk safety
    }
}

/**
 * Updates dynamic lighting for a single player.
 * Only modifies blocks when the player actually crosses into a new block coordinate
 * or switches to a different light source to prevent chunk rebuild stutter and light flickering.
 */
function updatePlayerLight(player: Player): void {
    if (!player.isValid) return;

    // Check mainhand and offhand items
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
        // Equipment component safety
    }

    const currentLight = Math.max(mainhandLight, offhandLight);

    if (currentLight <= 0) {
        clearPlayerLight(player.id);
        return;
    }

    const loc = player.location;
    let targetPos: Vector3 = {
        x: Math.floor(loc.x),
        y: Math.floor(loc.y + 1), // Torso height (natural ambient light source)
        z: Math.floor(loc.z),
    };

    let block: ReturnType<typeof player.dimension.getBlock> = undefined;
    try {
        block = player.dimension.getBlock(targetPos);
    } catch {
        // Dimension query safety
    }

    // If torso position is blocked by ceiling or solid block, fall back to feet position
    if (!block || (!block.isAir && !block.typeId.startsWith("minecraft:light_block_"))) {
        const feetPos: Vector3 = {
            x: Math.floor(loc.x),
            y: Math.floor(loc.y),
            z: Math.floor(loc.z),
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
 * Initializes the lightweight Dynamic Lighting and Offhand Torch/Lantern features.
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

    // Right-click item use (Bedrock itemUse event)
    if (DynamicLightingConfig.allowOffhandEquipOnUse) {
        world.afterEvents.itemUse.subscribe((event) => {
            try {
                if (isTorchOrLantern(event.itemStack.typeId)) {
                    equipToOffhand(event.source, DynamicLightingConfig.showEquipNotification);
                }
            } catch {
                // Ignore
            }
        });
    }

    console.warn("[DynamicLight] Feature initialized successfully.");
}
