import {
    EnchantmentTypes,
    EntityComponentTypes,
    EntityEquippableComponent,
    EquipmentSlot,
    GameMode,
    ItemComponentTypes,
    ItemDurabilityComponent,
    ItemEnchantableComponent,
    ItemStack,
    Player,
} from "@minecraft/server";
import { DurabilityConfig, TreeCapitatorConfig } from "../config";

/**
 * Checks if the given item is an axe.
 */
export function isAxe(item?: ItemStack): boolean {
    if (!item) return false;
    return item.typeId.endsWith("_axe") || item.hasTag("minecraft:is_axe");
}

/**
 * Checks if the given item is a pickaxe.
 */
export function isPickaxe(item?: ItemStack): boolean {
    if (!item) return false;
    return item.typeId.endsWith("_pickaxe") || item.hasTag("minecraft:is_pickaxe");
}

/**
 * Returns the numeric tier of a pickaxe (Wood/Gold: 0, Stone: 1, Iron: 2, Diamond: 3, Netherite: 4).
 */
export function getPickaxeTier(item?: ItemStack): number {
    if (!item) return -1;
    const id = item.typeId;
    if (id.includes("netherite_pickaxe")) return 4;
    if (id.includes("diamond_pickaxe")) return 3;
    if (id.includes("iron_pickaxe")) return 2;
    if (id.includes("stone_pickaxe")) return 1;
    if (id.includes("wooden_pickaxe") || id.includes("golden_pickaxe")) return 0;
    return -1;
}

/**
 * Retrieves the ItemStack currently equipped in the player's mainhand.
 */
export function getPlayerMainhandItem(player: Player): ItemStack | undefined {
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        return equippable?.getEquipment(EquipmentSlot.Mainhand);
    } catch {
        return undefined;
    }
}

/**
 * Safely retrieves the level of an enchantment on an ItemStack.
 * Resolves via EnchantmentTypes catalog, direct string ID, and list iteration.
 */
export function getItemEnchantmentLevel(item: ItemStack | undefined, enchantmentId: string): number {
    if (!item) return 0;
    try {
        const enchantable = item.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent | undefined;
        if (!enchantable) return 0;

        // 1. Try resolving via EnchantmentTypes catalog
        try {
            const type = EnchantmentTypes.get(enchantmentId) ?? EnchantmentTypes.get(`minecraft:${enchantmentId}`);
            if (type) {
                const ench = enchantable.getEnchantment(type);
                if (ench && ench.level > 0) return ench.level;
            }
        } catch {
            // Ignore catalog lookup error
        }

        // 2. Try direct string ID
        try {
            const ench = enchantable.getEnchantment(enchantmentId) ?? enchantable.getEnchantment(`minecraft:${enchantmentId}`);
            if (ench && ench.level > 0) return ench.level;
        } catch {
            // Ignore string lookup error
        }

        // 3. Fallback: iterate over all present enchantments on the item
        try {
            const list = enchantable.getEnchantments();
            for (const ench of list) {
                const id = ench.type.id;
                if (id === enchantmentId || id === `minecraft:${enchantmentId}` || id.endsWith(enchantmentId)) {
                    return ench.level;
                }
            }
        } catch {
            // Ignore list iteration error
        }
    } catch {
        // Fallback
    }
    return 0;
}

/**
 * Applies durability damage to the tool currently held in the player's mainhand.
 * Accounts for Unbreaking enchantments and handles tool breakage.
 * Returns true if the tool survived (or player is creative), false if it broke.
 */
export function damageMainhandTool(player: Player, damageAmount: number): boolean {
    if (damageAmount <= 0) return true;
    if (DurabilityConfig.enabled || !TreeCapitatorConfig.consumeDurability) return true;

    try {
        if (player.getGameMode() === GameMode.Creative) {
            return true;
        }
    } catch {
        // Fallback if game mode cannot be retrieved
    }

    const equippable = player.getComponent(EntityComponentTypes.Equippable);
    if (!equippable) return true;

    const mainhand = equippable.getEquipment(EquipmentSlot.Mainhand);
    if (!mainhand) return true;

    const durability = mainhand.getComponent(ItemComponentTypes.Durability) as ItemDurabilityComponent | undefined;
    if (!durability || durability.unbreakable) return true;

    // Check for Unbreaking enchantment
    let unbreakingLevel = getItemEnchantmentLevel(mainhand, "unbreaking");
    if (unbreakingLevel === 0) {
        try {
            const raw = mainhand.getDynamicProperty("qol_durability_enchants");
            if (typeof raw === "string") {
                const parsed = JSON.parse(raw);
                if (typeof parsed?.unbreaking === "number") {
                    unbreakingLevel = parsed.unbreaking;
                }
            }
        } catch {
            // Fallback
        }
    }

    let damageChance = 1;
    try {
        damageChance = durability.getDamageChance(Math.min(Math.max(unbreakingLevel, 0), 3)) / 100;
    } catch {
        damageChance = 1 / (unbreakingLevel + 1);
    }

    let actualDamage = 0;
    for (let i = 0; i < damageAmount; i++) {
        if (Math.random() < damageChance) {
            actualDamage++;
        }
    }

    if (actualDamage <= 0) return true;

    durability.damage += actualDamage;

    if (durability.damage >= durability.maxDurability) {
        // Durability depleted
        equippable.setEquipment(EquipmentSlot.Mainhand, undefined);
        try {
            player.playSound("random.break", { volume: 1.0, pitch: 0.9 });
        } catch {
            // Dimension sound fallback
            player.dimension.playSound("random.break", player.location);
        }
        return false;
    } else {
        equippable.setEquipment(EquipmentSlot.Mainhand, mainhand);
        return true;
    }
}
