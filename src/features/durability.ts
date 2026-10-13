import {
    Enchantment,
    EnchantmentTypes,
    EntityComponentTypes,
    EquipmentSlot,
    ItemComponentTypes,
    ItemDurabilityComponent,
    ItemEnchantableComponent,
    ItemStack,
    Player,
    system,
    world,
} from "@minecraft/server";
import { DurabilityConfig } from "../config";

/**
 * Dynamic property key used to store temporarily disabled durability enchantments
 * (Unbreaking and Mending) so they can be restored if max durability is disabled.
 */
export const SAVED_DURABILITY_ENCHANTS_PROP = "qol_durability_enchants";

export interface SavedDurabilityEnchants {
    unbreaking?: number;
    mending?: number;
}

/**
 * Safely looks up an enchantment on an ItemEnchantableComponent by its short or full ID.
 */
export function getEnchantmentSafe(enchantable: ItemEnchantableComponent, id: string): Enchantment | undefined {
    try {
        const type = EnchantmentTypes.get(id) ?? EnchantmentTypes.get(`minecraft:${id}`);
        if (type) {
            return enchantable.getEnchantment(type);
        }
    } catch {
        // Fallback
    }

    try {
        return enchantable.getEnchantment(id) ?? enchantable.getEnchantment(`minecraft:${id}`);
    } catch {
        return undefined;
    }
}

/**
 * Safely removes an enchantment from an ItemEnchantableComponent by its short or full ID.
 */
export function removeEnchantmentSafe(enchantable: ItemEnchantableComponent, id: string): boolean {
    try {
        const type = EnchantmentTypes.get(id) ?? EnchantmentTypes.get(`minecraft:${id}`);
        if (type && enchantable.hasEnchantment(type)) {
            enchantable.removeEnchantment(type);
            return true;
        }
    } catch {
        // Fallback
    }

    try {
        if (enchantable.hasEnchantment(id)) {
            enchantable.removeEnchantment(id);
            return true;
        }
    } catch {
        // Fallback
    }

    try {
        if (enchantable.hasEnchantment(`minecraft:${id}`)) {
            enchantable.removeEnchantment(`minecraft:${id}`);
            return true;
        }
    } catch {
        // Fallback
    }

    return false;
}

/**
 * Safely adds an enchantment with a given level to an ItemEnchantableComponent.
 */
export function addEnchantmentSafe(enchantable: ItemEnchantableComponent, id: string, level: number): boolean {
    try {
        const type = EnchantmentTypes.get(id) ?? EnchantmentTypes.get(`minecraft:${id}`);
        if (type) {
            enchantable.addEnchantment({ type, level });
            return true;
        }
    } catch {
        // Fallback
    }
    return false;
}

/**
 * Removes durability loss from an ItemStack by setting unbreakable = true and damage = 0.
 * If disableDurabilityEnchantments is enabled, also temporarily disables/removes Unbreaking and Mending,
 * storing their levels in the item's dynamic property for future restoration.
 * Returns true if the item was modified and needs to be written back to the container/slot.
 */
export function removeDurabilityFromItem(item: ItemStack): boolean {
    if (!DurabilityConfig.enabled) return false;

    try {
        const durability = item.getComponent(ItemComponentTypes.Durability) as ItemDurabilityComponent | undefined;
        if (!durability) return false;

        let modified = false;

        // 1. Repair any existing durability damage
        if (DurabilityConfig.repairExistingDamage && durability.damage > 0) {
            durability.damage = 0;
            modified = true;
        }

        // 2. Freeze durability loss and remove the durability bar from the item HUD
        if (!durability.unbreakable) {
            durability.unbreakable = true;
            modified = true;
        }

        // 3. Temporarily disable/remove durability enchantments (Unbreaking, Mending) if max durability is enabled
        if (DurabilityConfig.disableDurabilityEnchantments) {
            let alreadySaved = false;
            try {
                alreadySaved = item.getDynamicProperty(SAVED_DURABILITY_ENCHANTS_PROP) !== undefined;
            } catch {
                // Ignore
            }

            if (!alreadySaved) {
                const enchantable = item.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent | undefined;
                if (enchantable) {
                    const unbreaking = getEnchantmentSafe(enchantable, "unbreaking");
                    const mending = getEnchantmentSafe(enchantable, "mending");

                    if (unbreaking || mending) {
                        let saved: SavedDurabilityEnchants = {};
                        try {
                            const raw = item.getDynamicProperty(SAVED_DURABILITY_ENCHANTS_PROP);
                            if (typeof raw === "string") {
                                saved = JSON.parse(raw);
                            }
                        } catch {
                            saved = {};
                        }

                        if (unbreaking) {
                            saved.unbreaking = Math.max(saved.unbreaking ?? 0, unbreaking.level);
                            if (removeEnchantmentSafe(enchantable, "unbreaking")) {
                                modified = true;
                            }
                        }

                        if (mending) {
                            saved.mending = Math.max(saved.mending ?? 0, mending.level);
                            if (removeEnchantmentSafe(enchantable, "mending")) {
                                modified = true;
                            }
                        }

                        try {
                            item.setDynamicProperty(SAVED_DURABILITY_ENCHANTS_PROP, JSON.stringify(saved));
                        } catch {
                            // Ignore dynamic property errors if item is stackable
                        }
                    }
                }
            }
        }

        return modified;
    } catch {
        return false;
    }
}

/**
 * Restores durability loss and any temporarily disabled durability enchantments (Unbreaking, Mending)
 * to an ItemStack when max durability is disabled.
 * Returns true if the item was modified and needs to be written back to the container/slot.
 */
export function restoreDurabilityToItem(item: ItemStack): boolean {
    try {
        const durability = item.getComponent(ItemComponentTypes.Durability) as ItemDurabilityComponent | undefined;
        if (!durability) return false;

        let modified = false;

        // 1. Restore any temporarily saved durability enchantments
        const enchantable = item.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent | undefined;
        let savedRaw: unknown;
        try {
            savedRaw = item.getDynamicProperty(SAVED_DURABILITY_ENCHANTS_PROP);
        } catch {
            savedRaw = undefined;
        }

        if (enchantable && typeof savedRaw === "string") {
            try {
                const saved = JSON.parse(savedRaw) as SavedDurabilityEnchants;
                if (typeof saved.unbreaking === "number" && saved.unbreaking > 0) {
                    if (addEnchantmentSafe(enchantable, "unbreaking", saved.unbreaking)) {
                        modified = true;
                    }
                }
                if (typeof saved.mending === "number" && saved.mending > 0) {
                    if (addEnchantmentSafe(enchantable, "mending", saved.mending)) {
                        modified = true;
                    }
                }
                item.setDynamicProperty(SAVED_DURABILITY_ENCHANTS_PROP, undefined);
                modified = true;
            } catch {
                // Ignore parse errors
            }
        }

        // 2. If max durability is disabled, revert unbreakable flag
        if (!DurabilityConfig.enabled && durability.unbreakable) {
            durability.unbreakable = false;
            modified = true;
        }

        return modified;
    } catch {
        return false;
    }
}

const EQUIPMENT_SLOTS: EquipmentSlot[] = [
    EquipmentSlot.Mainhand,
    EquipmentSlot.Offhand,
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
];

/**
 * Processes all equipment and inventory slots for a given player, ensuring all items with durability
 * are marked unbreakable and repaired to full condition, with durability enchantments temporarily removed.
 * If max durability is disabled, restores original enchantments and durability state.
 */
export function processPlayerDurability(player: Player): void {
    if (!player || !player.isValid) return;
    const isEnabling = DurabilityConfig.enabled;

    try {
        // 1. Process equipped items (armor, mainhand, offhand)
        const equippable = player.getComponent(EntityComponentTypes.Equippable);
        if (equippable) {
            for (const slot of EQUIPMENT_SLOTS) {
                try {
                    const item = equippable.getEquipment(slot);
                    if (item) {
                        const modified = isEnabling
                            ? removeDurabilityFromItem(item)
                            : restoreDurabilityToItem(item);
                        if (modified) {
                            equippable.setEquipment(slot, item);
                        }
                    }
                } catch {
                    // Ignore slot errors
                }
            }
        }

        // 2. Process player inventory slots
        const invComp = player.getComponent(EntityComponentTypes.Inventory);
        if (invComp && invComp.container) {
            const container = invComp.container;
            for (let i = 0; i < container.size; i++) {
                try {
                    const item = container.getItem(i);
                    if (item) {
                        const modified = isEnabling
                            ? removeDurabilityFromItem(item)
                            : restoreDurabilityToItem(item);
                        if (modified) {
                            container.setItem(i, item);
                        }
                    }
                } catch {
                    // Ignore slot errors
                }
            }
        }
    } catch {
        // Ignore player errors
    }
}

/**
 * Processes only the mainhand item for a player (instant, ultra-lightweight).
 * Used when breaking blocks to avoid sweeping 42 inventory slots per block broken.
 */
export function processPlayerMainhandDurability(player: Player): void {
    if (!player || !player.isValid) return;
    const isEnabling = DurabilityConfig.enabled;

    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable);
        if (equippable) {
            const item = equippable.getEquipment(EquipmentSlot.Mainhand);
            if (item) {
                const modified = isEnabling
                    ? removeDurabilityFromItem(item)
                    : restoreDurabilityToItem(item);
                if (modified) {
                    equippable.setEquipment(EquipmentSlot.Mainhand, item);
                }
            }
        }
    } catch {
        // Ignore
    }
}

/**
 * Initializes the durability feature.
 */
export function initDurabilityFeature(): void {
    // 1. Periodic sweep across all online players (every 10 ticks = 0.5s)
    system.runInterval(() => {
        const players = Array.from(world.getAllPlayers());
        for (const player of players) {
            if (!player || !player.isValid) continue;
            processPlayerDurability(player);
        }
    }, Math.max(5, DurabilityConfig.scanIntervalTicks));

    // Process held tool durability when blocks are broken
    world.afterEvents.playerBreakBlock.subscribe((event) => {
        processPlayerMainhandDurability(event.player);
    });

    // 3. Event-based instant processing when items are used (bows, tools, fishing rods, shields)
    world.afterEvents.itemUse.subscribe((event) => {
        processPlayerDurability(event.source);
    });

    world.afterEvents.itemCompleteUse.subscribe((event) => {
        processPlayerDurability(event.source);
    });

    world.afterEvents.itemStopUse.subscribe((event) => {
        processPlayerDurability(event.source);
    });

    // 4. Event-based instant processing on combat (entity hurt)
    world.afterEvents.entityHurt.subscribe((event) => {
        // If victim is a player, their armor might take damage
        if (event.hurtEntity.typeId === "minecraft:player") {
            processPlayerDurability(event.hurtEntity as Player);
        }

        // If attacker is a player, their weapon might take damage
        const attacker = event.damageSource.damagingEntity;
        if (attacker && attacker.typeId === "minecraft:player") {
            processPlayerDurability(attacker as Player);
        }
    });

    // 5. Initial join and respawn processing
    world.afterEvents.playerSpawn.subscribe((event) => {
        processPlayerDurability(event.player);
    });

    // 6. Interaction with blocks (e.g. chests, crafting tables, anvil, enchanting table, farmland)
    world.afterEvents.playerInteractWithBlock.subscribe((event) => {
        processPlayerDurability(event.player);
    });
}

