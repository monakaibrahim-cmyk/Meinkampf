import {
    world,
    system,
    Player,
    Block,
    Container,
    ItemStack,
    ItemLockMode,
    ItemEnchantableComponent,
    BlockComponentTypes,
    EntityComponentTypes,
    EntityItemComponent,
    BlockInventoryComponent,
    EntityInventoryComponent,
    EntityEquippableComponent,
    EquipmentSlot,
} from "@minecraft/server";
import { ActionFormData, ActionFormResponse, FormCancelationReason } from "@minecraft/server-ui";
import { InventorySortingConfig } from "../config";
import { showPlayerNotification } from "../utils/notifications";
import {
    isPlayerOffhandHoldingLight,
    equipToOffhandFromAnywhere,
} from "./dynamicLight";

export type SortType = "category" | "quality" | "alphabetical" | "quantity" | "compact";

interface SlotRef {
    container: Container;
    slot: number;
}

// Track per-player hotbar protection setting in memory
const playerHotbarProtected = new Map<string, boolean>();

const SORTER_ITEM_NAME = "§l§6⚡ Quick Sorter§r";

/**
 * Creates the official Sorter tool item with custom name, lore, keepOnDeath, and inventory lock.
 */
export function createSorterItem(): ItemStack {
    let item: ItemStack;
    try {
        item = new ItemStack("qol:quick_sorter", 1);
    } catch {
        item = new ItemStack("minecraft:compass", 1);
    }
    item.nameTag = SORTER_ITEM_NAME;
    item.setLore([
        "§7» Right-Click: Sort Backpack",
        "§7» Use on Chest: Sort Container",
        "§aBedrock QoL Suite",
    ]);
    try {
        item.keepOnDeath = true;
        item.lockMode = ItemLockMode.inventory;
    } catch {
        // Fallback
    }
    return item;
}

/**
 * Checks if an item is the Quick Sorter tool.
 */
export function isSorterItem(item?: ItemStack): boolean {
    if (!item) return false;
    if (item.typeId === "qol:quick_sorter") return true;
    return item.nameTag === SORTER_ITEM_NAME || (item.typeId === "minecraft:compass" && item.nameTag?.includes("Quick Sorter") === true);
}

/**
 * Checks if a block is a container (chest, barrel, shulker, dispenser, etc.).
 */
export function isContainerBlock(block: Block): boolean {
    const typeId = block.typeId;
    if (
        typeId.includes("chest") ||
        typeId.includes("barrel") ||
        typeId.includes("shulker_box") ||
        typeId.includes("dispenser") ||
        typeId.includes("dropper") ||
        typeId.includes("hopper")
    ) {
        return true;
    }

    const inv =
        (block.getComponent(BlockComponentTypes.Inventory) as BlockInventoryComponent | undefined) ??
        (block.getComponent("inventory") as BlockInventoryComponent | undefined) ??
        (block.getComponent("minecraft:inventory") as BlockInventoryComponent | undefined);
    return !!(inv && inv.container);
}

/**
 * Retrieves the container of a block safely across all Bedrock versions.
 */
export function getBlockContainer(block: Block): Container | undefined {
    const inv =
        (block.getComponent(BlockComponentTypes.Inventory) as BlockInventoryComponent | undefined) ??
        (block.getComponent("inventory") as BlockInventoryComponent | undefined) ??
        (block.getComponent("minecraft:inventory") as BlockInventoryComponent | undefined);
    return inv?.container;
}

/**
 * Retrieves the inventory container of a player safely.
 */
export function getPlayerContainer(player: Player): Container | undefined {
    const inv =
        (player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined) ??
        (player.getComponent("inventory") as EntityInventoryComponent | undefined) ??
        (player.getComponent("minecraft:inventory") as EntityInventoryComponent | undefined);
    return inv?.container;
}

/**
 * Gives a Quick Sorter item to the player if they don't already have one.
 */
export function giveSorterItemToPlayer(player: Player, notify = true): void {
    const container = getPlayerContainer(player);
    if (!container) return;

    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (isSorterItem(item)) {
            if (notify) {
                showPlayerNotification(player, "§e⚡ You already have a Quick Sorter in your inventory!");
            }
            return;
        }
    }

    const sorter = createSorterItem();
    const leftover = container.addItem(sorter);
    if (leftover && leftover.amount > 0) {
        player.dimension.spawnItem(sorter, player.location);
    }
    if (notify) {
        showPlayerNotification(player, "§a✔ Added §6⚡ Quick Sorter§a to your inventory!");
    }
}

/**
 * Initializes the Inventory and Container Sorting feature.
 */
export function initInventorySortingFeature(): void {
    if (!InventorySortingConfig.enabled) return;

    // 1. Maintain Quick Sorter on player spawn/join (keepOnDeath, inventory lock, anti-duplication)
    world.afterEvents.playerSpawn.subscribe((event) => {
        try {
            const player = event.player;
            if (!player || !player.isValid) return;

            const container = getPlayerContainer(player);
            let hasSorter = false;

            if (container) {
                for (let i = 0; i < container.size; i++) {
                    const item = container.getItem(i);
                    if (item && isSorterItem(item)) {
                        hasSorter = true;
                        let updated = false;
                        if (!item.keepOnDeath) {
                            item.keepOnDeath = true;
                            updated = true;
                        }
                        if (item.lockMode !== ItemLockMode.inventory) {
                            item.lockMode = ItemLockMode.inventory;
                            updated = true;
                        }
                        // Upgrade legacy compass to custom item
                        if (item.typeId === "minecraft:compass") {
                            try {
                                const upgraded = createSorterItem();
                                container.setItem(i, upgraded);
                                updated = false;
                            } catch {
                                // Keep compass
                            }
                        }
                        if (updated) {
                            container.setItem(i, item);
                        }
                    }
                }
            }

            if (!hasSorter && InventorySortingConfig.giveSorterOnSpawn) {
                giveSorterItemToPlayer(player, false);
            }
        } catch {
            // Ignore
        }
    });

    // 2. Anti-duplication: intercept dropped Quick Sorter item entities and remove them
    world.afterEvents.entitySpawn.subscribe((event) => {
        try {
            if (event.entity && event.entity.typeId === "minecraft:item") {
                const itemComp = event.entity.getComponent(EntityComponentTypes.Item) as EntityItemComponent | undefined;
                if (itemComp && isSorterItem(itemComp.itemStack)) {
                    event.entity.remove();
                }
            }
        } catch {
            // Ignore
        }
    });

    // 2. Right-clicking with Sorter item in air (ItemUse)
    world.afterEvents.itemUse.subscribe((event) => {
        try {
            if (!InventorySortingConfig.useSorterItem) return;
            if (isSorterItem(event.itemStack)) {
                const player = event.source;
                // Check if aiming at a container within reach
                const hit = player.getBlockFromViewDirection({ maxDistance: 5 });
                if (hit && hit.block && isContainerBlock(hit.block)) {
                    const connected = InventorySortingConfig.sortDoubleChestsTogether
                        ? getConnectedChests(hit.block)
                        : [hit.block];
                    openContainerSorterForm(player, connected);
                } else {
                    openBackpackSorterForm(player);
                }
            }
        } catch {
            // Ignore
        }
    });

    // Automatically sort containers when closed
    world.afterEvents.blockContainerClosed.subscribe((event) => {
        try {
            if (!InventorySortingConfig.autoSortOnClose) return;
            const block = event.block;
            if (!block || !isContainerBlock(block)) return;

            const connected = InventorySortingConfig.sortDoubleChestsTogether
                ? getConnectedChests(block)
                : [block];
            const refs = getBlockSlotRefs(connected);
            if (refs.length > 0) {
                const count = performSort(refs, InventorySortingConfig.defaultSortType);
                const player = event.closeSource?.entity as Player | undefined;
                if (player && player.isValid && count > 0 && InventorySortingConfig.showNotification) {
                    showPlayerNotification(player, `§a✔ Container auto-sorted by §l${InventorySortingConfig.defaultSortType}§r§a!`);
                }
            }
        } catch {
            // Ignore
        }
    });

    // Handle block interaction (sorter item or empty hand)
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        try {
            const player = event.player;
            const block = event.block;

            const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
            const mainhandItem = equippable?.getEquipment(EquipmentSlot.Mainhand);
            const offhandItem = equippable?.getEquipment(EquipmentSlot.Offhand);
            const holdingSorter = isSorterItem(event.itemStack) || isSorterItem(mainhandItem) || isSorterItem(offhandItem);

            // Holding the sorter item opens container/backpack sorter interface
            if (InventorySortingConfig.useSorterItem && holdingSorter) {
                event.cancel = true;
                system.run(() => {
                    if (isContainerBlock(block)) {
                        const connected = InventorySortingConfig.sortDoubleChestsTogether
                            ? getConnectedChests(block)
                            : [block];
                        openContainerSorterForm(player, connected);
                    } else {
                        openBackpackSorterForm(player);
                    }
                });
                return;
            }

            // Empty hand interact on ground (open backpack sorter)
            if (InventorySortingConfig.emptyHandInteractBackpack && !isContainerBlock(block)) {
                const eq = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
                const mainhand = eq?.getEquipment(EquipmentSlot.Mainhand);
                if (!mainhand && player.isSneaking) {
                    event.cancel = true;
                    system.run(() => {
                        openBackpackSorterForm(player);
                    });
                }
            }
        } catch {
            // Ignore interaction errors
        }
    });

    // 6. Listen to /scriptevent commands for quick hotkeys or macros
    system.afterEvents.scriptEventReceive.subscribe((event) => {
        try {
            if (event.id === "qol:sort" || event.id === "qol:sort_backpack") {
                const player = event.sourceEntity;
                if (player && player.typeId === "minecraft:player") {
                    openBackpackSorterForm(player as Player);
                }
            } else if (event.id === "qol:sorter" || event.id === "qol:get") {
                const player = event.sourceEntity;
                if (player && player.typeId === "minecraft:player") {
                    giveSorterItemToPlayer(player as Player, true);
                }
            } else if (event.id === "qol:sort_chest") {
                const player = event.sourceEntity;
                if (player && player.typeId === "minecraft:player") {
                    const p = player as Player;
                    const hit = p.getBlockFromViewDirection();
                    if (hit && hit.block && isContainerBlock(hit.block)) {
                        const connected = InventorySortingConfig.sortDoubleChestsTogether
                            ? getConnectedChests(hit.block)
                            : [hit.block];
                        openContainerSorterForm(p, connected);
                    }
                }
            }
        } catch {
            // Ignore script event errors
        }
    });

    // 7. Contextual HUD Tips when aiming at chests or holding Sorter
    system.runInterval(() => {
        try {
            for (const player of world.getAllPlayers()) {
                if (!player.isValid) continue;

                const eq = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
                const mainhand = eq?.getEquipment(EquipmentSlot.Mainhand);

                if (isSorterItem(mainhand)) {
                    showPlayerNotification(player, "§6⚡ Quick Sorter §8| §fRight-Click to Sort");
                    continue;
                }

                // If looking directly at a container within 4 blocks
                const hit = player.getBlockFromViewDirection({ maxDistance: 4 });
                if (hit && hit.block && isContainerBlock(hit.block)) {
                    showPlayerNotification(player, "§6[QoL] §eUse Quick Sorter §fto Sort §8| §aAuto-sorts on close!");
                }
            }
        } catch {
            // Ignore
        }
    }, 30);
}

/**
 * Detects connected chest pairs (Double Chests) to handle combined inventory.
 */
function getConnectedChests(block: Block): Block[] {
    const typeId = block.typeId;
    if (typeId !== "minecraft:chest" && typeId !== "minecraft:trapped_chest") {
        return [block];
    }
    const dim = block.dimension;
    const { x, y, z } = block.location;
    const candidates = [
        dim.getBlock({ x: x + 1, y, z }),
        dim.getBlock({ x: x - 1, y, z }),
        dim.getBlock({ x, y, z: z + 1 }),
        dim.getBlock({ x, y, z: z - 1 }),
    ];

    for (const neighbor of candidates) {
        if (neighbor && neighbor.typeId === typeId) {
            try {
                const dir1 = block.permutation.getState("minecraft:cardinal_direction");
                const dir2 = neighbor.permutation.getState("minecraft:cardinal_direction");
                if (dir1 !== undefined && dir1 === dir2) {
                    return [block, neighbor];
                }
            } catch {
                return [block, neighbor];
            }
        }
    }
    return [block];
}

/**
 * Returns slot references for container blocks.
 */
function getBlockSlotRefs(blocks: Block[]): SlotRef[] {
    const refs: SlotRef[] = [];
    for (const b of blocks) {
        const container = getBlockContainer(b);
        if (container) {
            for (let i = 0; i < container.size; i++) {
                refs.push({ container, slot: i });
            }
        }
    }
    return refs;
}

/**
 * Returns slot references for the player's inventory/backpack.
 */
function getPlayerSlotRefs(player: Player, includeHotbar: boolean): SlotRef[] {
    const refs: SlotRef[] = [];
    const container = getPlayerContainer(player);
    if (container) {
        const startSlot = includeHotbar ? 0 : 9;
        const endSlot = container.size;
        for (let i = startSlot; i < endSlot; i++) {
            refs.push({ container, slot: i });
        }
    }
    return refs;
}

/**
 * Displays the Container Sorter menu with icon buttons and sort choices.
 */
export function openContainerSorterForm(player: Player, containerBlocks: Block[]): void {
    const refs = getBlockSlotRefs(containerBlocks);
    if (refs.length === 0) return;

    const isDouble = containerBlocks.length > 1;
    const title = isDouble ? "§l§2Double Chest Sorter" : "§l§2Container Sorter";
    const form = new ActionFormData()
        .title(title)
        .body(`§7Choose a sorting method for this container:\n§8Total Capacity: §a${refs.length} slots`)
        .button("§l§1Category / Type§r\n§8Tools, Armor, Ores, Blocks...", "textures/items/iron_pickaxe")
        .button("§l§5Quality / Tier§r\n§8Netherite, Diamond, Enchanted...", "textures/items/netherite_sword")
        .button("§l§6Alphabetical (A-Z)§r\n§8Sort names alphabetically", "textures/items/book_normal")
        .button("§l§gQuantity / Count§r\n§8Largest stacks first", "textures/items/gold_ingot")
        .button("§l§eCompact & Merge§r\n§8Consolidate partial stacks", "textures/ui/anvil_icon")
        .button("§l§bSort Backpack§r\n§8Clean your player inventory", "textures/ui/inventory_icon");

    showActionFormSafe(player, form, (selection) => {
        if (selection === 0) {
            sortAndNotify(player, refs, "category", "Category");
        } else if (selection === 1) {
            sortAndNotify(player, refs, "quality", "Quality & Tier");
        } else if (selection === 2) {
            sortAndNotify(player, refs, "alphabetical", "Alphabetical (A-Z)");
        } else if (selection === 3) {
            sortAndNotify(player, refs, "quantity", "Quantity");
        } else if (selection === 4) {
            sortAndNotify(player, refs, "compact", "Compact & Merge");
        } else if (selection === 5) {
            system.run(() => {
                openBackpackSorterForm(player);
            });
        }
    });
}

/**
 * Displays the Backpack Sorter menu with icon buttons, hotbar lock/unlock, and sort choices.
 */
export function openBackpackSorterForm(player: Player): void {
    const isHotbarProtected = playerHotbarProtected.get(player.id) ?? InventorySortingConfig.protectHotbarByDefault;
    const refs = getPlayerSlotRefs(player, !isHotbarProtected);
    const hasOffhandLight = isPlayerOffhandHoldingLight(player);

    const form = new ActionFormData()
        .title("§l§2Backpack Sorter")
        .body(
            "§7Choose a sorting method for your inventory:\n" +
            (isHotbarProtected
                ? "§a✔ Hotbar Protected §8(Slots 0-8 kept safe)"
                : "§e⚠ Full Inventory §8(Hotbar slots 0-8 included)")
        )
        .button("§l§1Category / Type§r\n§8Tools, Armor, Ores, Blocks...", "textures/items/iron_pickaxe")
        .button("§l§5Quality / Tier§r\n§8Netherite, Diamond, Enchanted...", "textures/items/netherite_sword")
        .button("§l§6Alphabetical (A-Z)§r\n§8Sort names alphabetically", "textures/items/book_normal")
        .button("§l§gQuantity / Count§r\n§8Largest stacks first", "textures/items/gold_ingot")
        .button("§l§eCompact & Merge§r\n§8Consolidate partial stacks", "textures/ui/anvil_icon")
        .button(
            isHotbarProtected
                ? "§l§cInclude Hotbar§r\n§8Allow sorting slots 0-8"
                : "§l§aProtect Hotbar§r\n§8Keep slots 0-8 untouched",
            isHotbarProtected ? "textures/items/diamond_sword" : "textures/items/iron_sword"
        )
        .button(
            hasOffhandLight
                ? "§l§cUnequip Offhand Light§r\n§8Move torch/lantern back"
                : "§l§6Torch / Lantern Offhand§r\n§8Equip light source to offhand",
            "textures/items/torch_on"
        );

    showActionFormSafe(player, form, (selection) => {
        if (selection === 0) {
            sortAndNotify(player, refs, "category", "Category");
        } else if (selection === 1) {
            sortAndNotify(player, refs, "quality", "Quality & Tier");
        } else if (selection === 2) {
            sortAndNotify(player, refs, "alphabetical", "Alphabetical (A-Z)");
        } else if (selection === 3) {
            sortAndNotify(player, refs, "quantity", "Quantity");
        } else if (selection === 4) {
            sortAndNotify(player, refs, "compact", "Compact & Merge");
        } else if (selection === 5) {
            playerHotbarProtected.set(player.id, !isHotbarProtected);
            system.run(() => {
                openBackpackSorterForm(player);
            });
        } else if (selection === 6) {
            equipToOffhandFromAnywhere(player);
        }
    });
}

/**
 * Reliably displays an ActionFormData even if the player was temporarily busy.
 */
function showActionFormSafe(
    player: Player,
    form: ActionFormData,
    onSelect: (selection: number) => void,
    retries = 4
): void {
    form.show(player).then((res: ActionFormResponse) => {
        if (res.canceled) {
            if (res.cancelationReason === FormCancelationReason.UserBusy && retries > 0) {
                system.runTimeout(() => {
                    showActionFormSafe(player, form, onSelect, retries - 1);
                }, 3);
            }
            return;
        }
        if (res.selection !== undefined) {
            onSelect(res.selection);
        }
    }).catch(() => {
        // Ignore form errors
    });
}

/**
 * Sorts items in the provided slot references and notifies the player.
 */
function sortAndNotify(player: Player, refs: SlotRef[], sortType: SortType, label: string): void {
    const count = performSort(refs, sortType);
    if (InventorySortingConfig.playSound) {
        try {
            player.playSound(InventorySortingConfig.soundEffect, { volume: 0.8, pitch: 1.0 });
        } catch {
            // Ignore sound error
        }
    }
    if (InventorySortingConfig.showNotification) {
        showPlayerNotification(player, `§a✔ Sorted ${count} items by §l${label}§r§a!`);
    }
}

/**
 * Executes stack merging, sorting algorithms, and write-back to slots.
 */
function performSort(refs: SlotRef[], sortType: SortType): number {
    if (refs.length === 0) return 0;

    // 1. Gather all items
    const rawItems: ItemStack[] = [];
    for (const ref of refs) {
        const item = ref.container.getItem(ref.slot);
        if (item && item.amount > 0) {
            rawItems.push(item.clone());
        }
    }

    if (rawItems.length === 0) return 0;

    // 2. Merge identical stackable items
    for (let i = 0; i < rawItems.length; i++) {
        const a = rawItems[i];
        if (!a || !a.isStackable || a.amount >= a.maxAmount) continue;

        for (let j = i + 1; j < rawItems.length; j++) {
            const b = rawItems[j];
            if (!b || !b.isStackable) continue;

            if (a.isStackableWith(b)) {
                const space = a.maxAmount - a.amount;
                const transfer = Math.min(space, b.amount);
                a.amount += transfer;
                b.amount -= transfer;
                if (b.amount <= 0) {
                    rawItems.splice(j, 1);
                    j--;
                }
                if (a.amount >= a.maxAmount) break;
            }
        }
    }

    // 3. Sort non-empty items
    if (sortType === "category") {
        rawItems.sort((a, b) => {
            const catA = getCategoryPriority(a.typeId);
            const catB = getCategoryPriority(b.typeId);
            if (catA !== catB) return catA - catB;

            const nameA = getCleanName(a);
            const nameB = getCleanName(b);
            if (nameA !== nameB) return nameA.localeCompare(nameB);

            return b.amount - a.amount;
        });
    } else if (sortType === "quality") {
        rawItems.sort((a, b) => {
            const qA = getItemQualityScore(a);
            const qB = getItemQualityScore(b);
            if (qA !== qB) return qB - qA;

            const catA = getCategoryPriority(a.typeId);
            const catB = getCategoryPriority(b.typeId);
            if (catA !== catB) return catA - catB;

            const nameA = getCleanName(a);
            const nameB = getCleanName(b);
            if (nameA !== nameB) return nameA.localeCompare(nameB);

            return b.amount - a.amount;
        });
    } else if (sortType === "alphabetical") {
        rawItems.sort((a, b) => {
            const nameA = getCleanName(a);
            const nameB = getCleanName(b);
            if (nameA !== nameB) return nameA.localeCompare(nameB);

            return b.amount - a.amount;
        });
    } else if (sortType === "quantity") {
        rawItems.sort((a, b) => {
            if (b.amount !== a.amount) return b.amount - a.amount;
            const nameA = getCleanName(a);
            const nameB = getCleanName(b);
            return nameA.localeCompare(nameB);
        });
    }
    // "compact" keeps existing relative order, just stacks merged

    // 4. Write back to container slots
    for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        const newItem = rawItems[i];
        ref.container.setItem(ref.slot, newItem);
    }

    return rawItems.length;
}

/**
 * Computes a quality / tier score for an item.
 * Higher score = higher quality (Netherite > Diamond > Iron > Gold > Copper > Stone > Wood, enchanted gear prioritized).
 */
export function getItemQualityScore(item: ItemStack): number {
    const id = item.typeId.replace("minecraft:", "").toLowerCase();
    let score = 0;

    // Quick Sorter tool always stays at the very top of inventory
    if (isSorterItem(item)) {
        return 50000;
    }

    // 1. Relics, Ultimate Treasures & Boss Drops
    if (
        id === "elytra" ||
        id === "nether_star" ||
        id === "dragon_egg" ||
        id === "dragon_breath" ||
        id === "heavy_core" ||
        id === "mace" ||
        id === "enchanted_golden_apple"
    ) {
        score += 15000;
    } else if (
        id === "totem_of_undying" ||
        id === "golden_apple" ||
        id === "beacon" ||
        id === "conduit" ||
        id === "heart_of_the_sea" ||
        id === "trident" ||
        id === "lodestone" ||
        id === "recovery_compass"
    ) {
        score += 12000;
    } else if (
        id === "shulker_box" ||
        id.endsWith("_shulker_box") ||
        id === "ender_chest" ||
        id === "ender_pearl" ||
        id === "eye_of_ender" ||
        id === "netherite_upgrade_smithing_template"
    ) {
        score += 9000;
    }

    // 2. Material Tiers (Armor, Weapons, Tools, Ingots, Blocks)
    if (id.includes("netherite")) {
        score += 10000;
    } else if (id.includes("diamond")) {
        score += 8000;
    } else if (id.includes("emerald")) {
        score += 7000;
    } else if (id.includes("iron") || id.includes("chainmail")) {
        score += 5000;
    } else if (id.includes("gold")) {
        score += 4000;
    } else if (id.includes("copper")) {
        score += 3000;
    } else if (id.includes("stone")) {
        score += 2000;
    } else if (id.includes("wood") || id.includes("wooden") || id.includes("leather")) {
        score += 1000;
    }

    // 3. Equipment & Valuable Utility Category Bonuses
    if (
        id.endsWith("_sword") ||
        id.endsWith("_pickaxe") ||
        id.endsWith("_axe") ||
        id.endsWith("_shovel") ||
        id.endsWith("_hoe") ||
        id.endsWith("_helmet") ||
        id.endsWith("_chestplate") ||
        id.endsWith("_leggings") ||
        id.endsWith("_boots") ||
        id === "bow" ||
        id === "crossbow" ||
        id === "shield"
    ) {
        score += 600;
    } else if (id.endsWith("_block")) {
        score += 400;
    } else if (id.endsWith("_ingot") || id.endsWith("_raw") || id.startsWith("raw_")) {
        score += 300;
    }

    // 4. Enchantments (Enchanted gear and books receive extra quality score)
    if (id === "enchanted_book") {
        score += 6000;
    }
    try {
        const ench = item.getComponent("minecraft:enchantable") as ItemEnchantableComponent | undefined;
        if (ench) {
            const enchantments = ench.getEnchantments();
            if (enchantments && enchantments.length > 0) {
                for (const e of enchantments) {
                    score += 400 + (e.level ?? 1) * 200;
                }
            }
        }
    } catch {
        // Ignore enchantment read errors
    }

    // 5. Potions & Consumables
    if (id.includes("potion")) {
        score += 2500;
    }

    return score;
}

/**
 * Returns a human-friendly lower-case clean name for alphabetical sorting.
 */
function getCleanName(item: ItemStack): string {
    if (item.nameTag && item.nameTag.length > 0) {
        return item.nameTag.toLowerCase();
    }
    return item.typeId.replace("minecraft:", "").replace(/_/g, " ").toLowerCase();
}

/**
 * Assigns an item type ID into an intuitive Minecraft category priority.
 */
export function getCategoryPriority(typeId: string): number {
    const id = typeId.replace("minecraft:", "").toLowerCase();

    // 1. Weapons & Combat
    if (
        id.endsWith("_sword") ||
        id === "bow" ||
        id === "crossbow" ||
        id === "trident" ||
        id === "mace" ||
        id === "shield" ||
        id === "wind_charge" ||
        id.includes("arrow")
    ) {
        return 1;
    }

    // 2. Tools & Utility
    if (
        id.endsWith("_pickaxe") ||
        id.endsWith("_axe") ||
        id.endsWith("_shovel") ||
        id.endsWith("_hoe") ||
        id === "shears" ||
        id === "fishing_rod" ||
        id === "flint_and_steel" ||
        id === "spyglass" ||
        id === "compass" ||
        id === "recovery_compass" ||
        id === "clock" ||
        id === "brush" ||
        id === "lead" ||
        id === "name_tag" ||
        id === "saddle"
    ) {
        return 2;
    }

    // 3. Armor & Wearables
    if (
        id.endsWith("_helmet") ||
        id.endsWith("_chestplate") ||
        id.endsWith("_leggings") ||
        id.endsWith("_boots") ||
        id === "elytra" ||
        id === "turtle_helmet" ||
        id.includes("horse_armor") ||
        id.includes("wolf_armor")
    ) {
        return 3;
    }

    // 4. Valuables & Minerals
    if (
        id.includes("netherite") ||
        id.includes("diamond") ||
        id.includes("emerald") ||
        id.includes("gold") ||
        id.includes("iron") ||
        id.includes("copper") ||
        id.includes("lapis") ||
        id.includes("amethyst") ||
        id.includes("echo_shard") ||
        id === "redstone" ||
        id === "coal" ||
        id === "charcoal" ||
        id === "quartz"
    ) {
        return 4;
    }

    // 5. Potions & Magic
    if (
        id.includes("potion") ||
        id === "enchanted_book" ||
        id === "totem_of_undying" ||
        id === "nether_star" ||
        id === "experience_bottle" ||
        id === "beacon" ||
        id === "conduit" ||
        id === "heart_of_the_sea" ||
        id === "nautilus_shell" ||
        id === "end_crystal"
    ) {
        return 5;
    }

    // 6. Food & Consumables
    if (
        id.includes("cooked") ||
        id.includes("beef") ||
        id.includes("porkchop") ||
        id.includes("mutton") ||
        id.includes("chicken") ||
        id.includes("salmon") ||
        id.includes("cod") ||
        id.includes("bread") ||
        id.includes("apple") ||
        id.includes("carrot") ||
        id.includes("potato") ||
        id.includes("beetroot") ||
        id.includes("stew") ||
        id.includes("soup") ||
        id.includes("pie") ||
        id.includes("cookie") ||
        id.includes("melon") ||
        id.includes("honey") ||
        id.includes("milk")
    ) {
        return 6;
    }

    // 7. Redstone & Automation
    if (
        id.includes("piston") ||
        id.includes("observer") ||
        id.includes("dispenser") ||
        id.includes("dropper") ||
        id.includes("hopper") ||
        id.includes("repeater") ||
        id.includes("comparator") ||
        id.includes("rail") ||
        id.includes("minecart") ||
        id.includes("lever") ||
        id.includes("button") ||
        id.includes("pressure_plate") ||
        id.includes("target") ||
        id.includes("tripwire")
    ) {
        return 7;
    }

    // 8. Farming & Plants
    if (
        id.includes("seed") ||
        id.includes("sapling") ||
        id.includes("crop") ||
        id.includes("flower") ||
        id.includes("fungus") ||
        id.includes("mushroom") ||
        id.includes("wart") ||
        id.includes("cane") ||
        id.includes("bamboo") ||
        id.includes("cactus") ||
        id.includes("kelp") ||
        id.includes("berries") ||
        id.includes("propagule")
    ) {
        return 8;
    }

    // 9. Building Blocks & Construction
    if (
        id.includes("stone") ||
        id.includes("cobble") ||
        id.includes("deepslate") ||
        id.includes("granite") ||
        id.includes("diorite") ||
        id.includes("andesite") ||
        id.includes("tuff") ||
        id.includes("sandstone") ||
        id.includes("brick") ||
        id.includes("prismarine") ||
        id.includes("wood") ||
        id.includes("log") ||
        id.includes("planks") ||
        id.includes("slab") ||
        id.includes("stairs") ||
        id.includes("wall") ||
        id.includes("fence") ||
        id.includes("glass") ||
        id.includes("concrete") ||
        id.includes("terracotta") ||
        id.includes("wool") ||
        id.includes("dirt") ||
        id.includes("sand") ||
        id.includes("gravel") ||
        id.includes("mud") ||
        id.includes("clay") ||
        id.includes("purpur") ||
        id.includes("end_stone") ||
        id.includes("obsidian")
    ) {
        return 9;
    }

    // 10. Mob Drops & Crafting
    if (
        id.includes("pearl") ||
        id.includes("blaze") ||
        id.includes("ghast") ||
        id.includes("slime") ||
        id.includes("string") ||
        id.includes("eye") ||
        id.includes("gunpowder") ||
        id.includes("bone") ||
        id.includes("feather") ||
        id.includes("leather") ||
        id.includes("hide") ||
        id.includes("sac") ||
        id.includes("shell") ||
        id.includes("scute") ||
        id.includes("breeze") ||
        id.includes("stick") ||
        id.includes("flint") ||
        id.includes("dye")
    ) {
        return 10;
    }

    // 11. Miscellaneous
    return 11;
}
