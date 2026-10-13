import {
    Block,
    BlockPermutation,
    Container,
    Direction,
    EntityComponentTypes,
    EntityEquippableComponent,
    EntityInventoryComponent,
    EquipmentSlot,
    GameMode,
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
 * Interactive blocks where right-clicking opens a UI or performs a block action
 * (unless player is sneaking, which bypasses block interaction in Minecraft).
 */
const INTERACTIVE_BLOCKS = new Set([
    "minecraft:chest",
    "minecraft:trapped_chest",
    "minecraft:barrel",
    "minecraft:crafting_table",
    "minecraft:furnace",
    "minecraft:blast_furnace",
    "minecraft:smoker",
    "minecraft:brewing_stand",
    "minecraft:enchanting_table",
    "minecraft:anvil",
    "minecraft:chipped_anvil",
    "minecraft:damaged_anvil",
    "minecraft:hopper",
    "minecraft:dispenser",
    "minecraft:dropper",
    "minecraft:lever",
    "minecraft:stone_button",
    "minecraft:beacon",
    "minecraft:ender_chest",
    "minecraft:bell",
    "minecraft:respawn_anchor",
    "minecraft:cartography_table",
    "minecraft:fletching_table",
    "minecraft:grindstone",
    "minecraft:smithing_table",
    "minecraft:stonecutter",
    "minecraft:loom",
    "minecraft:lectern",
    "minecraft:crafter",
]);

/**
 * Checks whether an item type ID is an offhand-eligible torch or lantern.
 */
export function isTorchOrLantern(typeId: string): boolean {
    return OFFHAND_LIGHT_ITEMS.has(typeId);
}

/**
 * Checks whether a block type is interactive (opening a container or UI).
 */
function isInteractiveBlock(typeId: string): boolean {
    if (INTERACTIVE_BLOCKS.has(typeId)) return true;
    if (
        typeId.includes("door") ||
        typeId.includes("trapdoor") ||
        typeId.includes("fence_gate") ||
        typeId.includes("shulker_box") ||
        typeId.includes("button")
    ) {
        return true;
    }
    return false;
}

/**
 * Checks whether a held mainhand item is a tool/weapon that does not place a block.
 * When holding these items, right-clicking a block should place the torch from offhand.
 */
function isNonPlacingToolOrWeapon(typeId: string, clickedBlockTypeId: string, isSneaking: boolean): boolean {
    if (
        typeId.endsWith("_pickaxe") ||
        typeId.endsWith("_sword")
    ) {
        return true;
    }

    // Axes: Right-clicking unstripped logs/wood strips them unless sneaking
    if (typeId.endsWith("_axe")) {
        const isLog =
            clickedBlockTypeId.includes("log") ||
            clickedBlockTypeId.includes("wood") ||
            clickedBlockTypeId.includes("stem") ||
            clickedBlockTypeId.includes("hyphae");
        if (isLog && !clickedBlockTypeId.includes("stripped_") && !isSneaking) {
            return false; // Stripping log takes priority when standing
        }
        return true;
    }

    // Shovels: Right-clicking grass block creates a dirt path unless sneaking
    if (typeId.endsWith("_shovel")) {
        if ((clickedBlockTypeId === "minecraft:grass_block" || clickedBlockTypeId === "minecraft:dirt") && !isSneaking) {
            return false; // Creating path takes priority when standing
        }
        return true;
    }

    // Hoes: Right-clicking dirt/grass tills farmland unless sneaking
    if (typeId.endsWith("_hoe")) {
        if ((clickedBlockTypeId === "minecraft:grass_block" || clickedBlockTypeId === "minecraft:dirt") && !isSneaking) {
            return false; // Tilling takes priority when standing
        }
        return true;
    }

    const nonPlacingItems = new Set([
        "minecraft:bow",
        "minecraft:crossbow",
        "minecraft:trident",
        "minecraft:mace",
        "minecraft:fishing_rod",
        "minecraft:spyglass",
        "minecraft:compass",
        "minecraft:recovery_compass",
        "minecraft:clock",
        "minecraft:map",
        "minecraft:filled_map",
        "minecraft:empty_map",
        "minecraft:shears",
        "minecraft:stick",
        "minecraft:bone",
        "minecraft:arrow",
        "minecraft:feather",
        "minecraft:string",
        "minecraft:leather",
        "minecraft:book",
        "minecraft:enchanted_book",
        "minecraft:totem_of_undying",
        "minecraft:nautilus_shell",
    ]);

    return nonPlacingItems.has(typeId);
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
                const countBadge = equipped.amount > 1 ? ` (${equipped.amount}×)` : "";
                const action = mainIsLight ? "Equipped to Offhand (Shield Slot)" : "Swapped to Main Hand";
                showPlayerNotification(player, `§6✦ ${name}${countBadge} ${action}! ✦§r`);
            }
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Automatically refills the offhand slot with more torches/lanterns from backpack inventory
 * when the offhand stack is fully depleted.
 */
function tryRefillOffhandLight(player: Player, equippable: EntityEquippableComponent): boolean {
    if (!DynamicLightingConfig.autoRefillOffhand) return false;

    const container = getPlayerContainer(player);
    if (!container) return false;

    for (let i = 0; i < container.size; i++) {
        const slotItem = container.getItem(i);
        if (slotItem && isTorchOrLantern(slotItem.typeId)) {
            container.setItem(i, undefined);
            equippable.setEquipment(EquipmentSlot.Offhand, slotItem);

            if (DynamicLightingConfig.playOffhandSound) {
                try {
                    player.dimension.playSound("armor.equip_generic", player.location, { volume: 0.8, pitch: 1.1 });
                } catch {}
            }

            if (DynamicLightingConfig.showEquipNotification) {
                const name = formatItemName(slotItem.typeId);
                const countBadge = slotItem.amount > 1 ? ` (${slotItem.amount}×)` : "";
                showPlayerNotification(player, `§6✦ Refilled Offhand with ${name}${countBadge}! ✦§r`);
            }
            return true;
        }
    }

    return false;
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
                    const countBadge = slotItem.amount > 1 ? ` (${slotItem.amount}×)` : "";
                    showPlayerNotification(player, `§6✦ ${name}${countBadge} Equipped to Offhand from Backpack! ✦§r`);
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

/**
 * Checks if a target block position is replaceable by a torch or lantern.
 */
function isBlockReplaceableForTorch(targetBlock: Block, isUnderwaterTorch: boolean): boolean {
    if (targetBlock.isAir) return true;
    const typeId = targetBlock.typeId;
    if (typeId.startsWith("minecraft:light_block_")) return true;
    if (
        typeId === "minecraft:tallgrass" ||
        typeId === "minecraft:short_grass" ||
        typeId === "minecraft:grass" ||
        typeId === "minecraft:fern" ||
        typeId === "minecraft:large_fern" ||
        typeId === "minecraft:deadbush" ||
        typeId === "minecraft:seagrass" ||
        typeId === "minecraft:structure_void"
    ) {
        return true;
    }
    if (isUnderwaterTorch && targetBlock.isLiquid && typeId === "minecraft:water") {
        return true;
    }
    return false;
}

/**
 * Attempts to place a torch or lantern from the offhand slot onto a target block face.
 * Decrements the offhand stack by 1 in survival/adventure mode without truncating or losing stacks.
 */
function tryPlaceOffhandTorch(
    player: Player,
    equippable: EntityEquippableComponent,
    offItem: ItemStack,
    clickedBlock: Block,
    blockFace: Direction
): boolean {
    if (clickedBlock.isAir || clickedBlock.isLiquid) return false;

    // Determine target placement block position based on face clicked
    let targetBlock: Block | undefined;
    switch (blockFace) {
        case Direction.Up:
            targetBlock = clickedBlock.above();
            break;
        case Direction.Down:
            targetBlock = clickedBlock.below();
            break;
        case Direction.North:
            targetBlock = clickedBlock.north();
            break;
        case Direction.South:
            targetBlock = clickedBlock.south();
            break;
        case Direction.East:
            targetBlock = clickedBlock.east();
            break;
        case Direction.West:
            targetBlock = clickedBlock.west();
            break;
    }

    if (!targetBlock || !targetBlock.isValid) return false;

    const isUnderwaterTorch = offItem.typeId === "minecraft:underwater_torch";
    if (!isBlockReplaceableForTorch(targetBlock, isUnderwaterTorch)) {
        return false;
    }

    // Resolve correct block permutation and attachment
    let perm: BlockPermutation | undefined;
    const itemType = offItem.typeId;

    if (itemType.includes("lantern")) {
        const lanternId = itemType === "minecraft:soul_lantern" ? "minecraft:soul_lantern" : "minecraft:lantern";
        if (blockFace === Direction.Down) {
            perm = BlockPermutation.resolve(lanternId, { hanging: true });
        } else {
            perm = BlockPermutation.resolve(lanternId, { hanging: false });
        }
    } else {
        // Torches
        let torchId = "minecraft:torch";
        if (itemType === "minecraft:soul_torch") torchId = "minecraft:soul_torch";
        else if (itemType === "minecraft:redstone_torch") torchId = "minecraft:redstone_torch";
        else if (itemType === "minecraft:underwater_torch") torchId = "minecraft:underwater_torch";
        else if (itemType.startsWith("minecraft:colored_torch_")) torchId = itemType;

        if (blockFace === Direction.Up) {
            perm = BlockPermutation.resolve(torchId, { torch_facing_direction: "top" });
        } else if (blockFace === Direction.North) {
            perm = BlockPermutation.resolve(torchId, { torch_facing_direction: "south" });
        } else if (blockFace === Direction.South) {
            perm = BlockPermutation.resolve(torchId, { torch_facing_direction: "north" });
        } else if (blockFace === Direction.West) {
            perm = BlockPermutation.resolve(torchId, { torch_facing_direction: "east" });
        } else if (blockFace === Direction.East) {
            perm = BlockPermutation.resolve(torchId, { torch_facing_direction: "west" });
        } else {
            // Torches cannot be placed on ceilings
            return false;
        }
    }

    if (!perm) return false;

    // Place the block
    try {
        targetBlock.setPermutation(perm);
    } catch {
        return false;
    }

    // Play placement sound
    try {
        player.dimension.playSound("dig.wood", targetBlock.location, { volume: 0.8, pitch: 0.9 });
    } catch {
        // Sound safety
    }

    // Decrement offhand item stack safely in survival/adventure mode
    if (player.getGameMode() !== GameMode.Creative) {
        try {
            if (offItem.amount > 1) {
                offItem.amount -= 1;
                equippable.setEquipment(EquipmentSlot.Offhand, offItem);
            } else {
                const refilled = tryRefillOffhandLight(player, equippable);
                if (!refilled) {
                    equippable.setEquipment(EquipmentSlot.Offhand, undefined);
                    if (DynamicLightingConfig.showEquipNotification) {
                        showPlayerNotification(player, "§7✦ Out of torches in offhand! ✦§r");
                    }
                }
            }
        } catch {
            // Inventory safety
        }
    }

    // Immediately refresh dynamic light position for the player
    try {
        updatePlayerLight(player);
    } catch {
        // Light safety
    }

    return true;
}

interface PlayerLightState {
    dimId: string;
    pos: Vector3;
    lightLevel: number;
}

const playerLightMap = new Map<string, PlayerLightState>();
const playerLastInteractBlockTick = new Map<string, number>();
const playerWasJumping = new Map<string, boolean>();
const playerJumpCooldown = new Map<string, number>();

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
 * Checks if a player performed a Crouch + Jump gesture to quick-swap torches into offhand.
 */
function checkCrouchJumpEquip(player: Player, currentTick: number): void {
    if (!DynamicLightingConfig.allowCrouchJumpEquip) return;
    if (!player || !player.isValid) return;

    const isJumping = player.isJumping;
    const wasJumping = playerWasJumping.get(player.id) ?? false;
    playerWasJumping.set(player.id, isJumping);

    if (isJumping && !wasJumping && player.isSneaking) {
        const lastTick = playerJumpCooldown.get(player.id) ?? 0;
        if (currentTick - lastTick < 10) return; // 0.5s cooldown
        playerJumpCooldown.set(player.id, currentTick);

        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!equippable) return;

        const mainItem = equippable.getEquipment(EquipmentSlot.Mainhand);
        const offItem = equippable.getEquipment(EquipmentSlot.Offhand);

        if ((mainItem && isTorchOrLantern(mainItem.typeId)) || (offItem && isTorchOrLantern(offItem.typeId))) {
            equipToOffhand(player, DynamicLightingConfig.showEquipNotification);
        }
    }
}

/**
 * Initializes the lightweight Dynamic Lighting, Offhand Torch/Lantern, and Placement features.
 */
export function initDynamicLightingFeature(): void {
    if (!DynamicLightingConfig.enabled) {
        console.warn("[DynamicLight] Feature is disabled in configuration.");
        return;
    }

    // Periodic light update and jump detection loop
    const intervalTicks = DynamicLightingConfig.updateIntervalTicks ?? 4;

    system.runInterval(() => {
        try {
            const players = world.getAllPlayers();
            const currentTick = system.currentTick;
            for (const player of players) {
                updatePlayerLight(player);
                checkCrouchJumpEquip(player, currentTick);
            }
        } catch {
            // Player query safety
        }
    }, intervalTicks);

    // Clean up light blocks on player leave, dimension change, death, or respawn
    world.afterEvents.playerLeave.subscribe((event) => {
        clearPlayerLight(event.playerId);
        playerLastInteractBlockTick.delete(event.playerId);
        playerWasJumping.delete(event.playerId);
        playerJumpCooldown.delete(event.playerId);
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

    // 1. Offhand Torch Placement (Java Edition parity)
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const player = event.player;
        if (!player || !player.isValid) return;

        // Record interaction tick to prevent itemUse from misinterpreting block placement as air clicks
        playerLastInteractBlockTick.set(player.id, system.currentTick);

        if (!DynamicLightingConfig.allowOffhandPlacement) return;

        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!equippable) return;

        const offItem = equippable.getEquipment(EquipmentSlot.Offhand);
        if (!offItem || !isTorchOrLantern(offItem.typeId)) return;

        const mainItem = equippable.getEquipment(EquipmentSlot.Mainhand);

        // If mainhand has a placeable block or item, allow mainhand placement to take precedence
        if (mainItem && !isNonPlacingToolOrWeapon(mainItem.typeId, event.block.typeId, player.isSneaking)) {
            return;
        }

        // If standing and clicking an interactive container, allow interacting with container
        if (!player.isSneaking && isInteractiveBlock(event.block.typeId)) {
            return;
        }

        // Attempt to place the offhand torch
        const success = tryPlaceOffhandTorch(player, equippable, offItem, event.block, event.blockFace);
        if (success) {
            event.cancel = true; // Cancel default block interact so mainhand weapon/tool does not swing
        }
    });

    // 2. Right-click item use in air (equipped when sneaking)
    if (DynamicLightingConfig.allowOffhandEquipOnUse) {
        world.afterEvents.itemUse.subscribe((event) => {
            try {
                const player = event.source;
                if (!player || !player.isValid) return;

                // Check if the player clicked/placed on a block on this same tick
                const lastBlockTick = playerLastInteractBlockTick.get(player.id);
                if (lastBlockTick !== undefined && lastBlockTick === system.currentTick) {
                    // Player placed or interacted with a block! Do NOT swap or equip!
                    return;
                }

                // When requireSneakToEquip is enabled, only swap when crouching (prevents accidental swaps)
                if (DynamicLightingConfig.requireSneakToEquip && !player.isSneaking) {
                    return;
                }

                if (isTorchOrLantern(event.itemStack.typeId)) {
                    equipToOffhand(player, DynamicLightingConfig.showEquipNotification);
                }
            } catch {
                // Ignore
            }
        });
    }

    // 3. ScriptEvent listener for quick torch offhand toggling (/scriptevent qol:torch or /scriptevent qol:offhand)
    system.afterEvents.scriptEventReceive.subscribe((event) => {
        if (event.id === "qol:offhand" || event.id === "qol:torch" || event.id === "qol:light") {
            const player = event.sourceEntity as Player | undefined;
            if (player && player.isValid && player.typeId === "minecraft:player") {
                equipToOffhandFromAnywhere(player);
            }
        }
    });

    console.warn("[DynamicLight] Feature initialized successfully with offhand torch placement and stack safety.");
}
