import {
    world,
    system,
    Player,
    Block,
    ItemStack,
    BlockPermutation,
    ItemComponentTypes,
    EntityComponentTypes,
    EquipmentSlot,
    EntityEquippableComponent,
    EntityInventoryComponent,
    ItemDurabilityComponent,
    ItemEnchantableComponent,
    ItemDyeableComponent,
    ExplosionBeforeEvent,
    PlayerInteractWithBlockAfterEvent,
    PlayerPlaceBlockAfterEvent,
    PlayerBreakBlockAfterEvent,
} from "@minecraft/server";
import { AnvilConfig } from "../config";
import { showPlayerNotification } from "../utils/notifications";

/**
 * Interface tracking an actively used anvil in the world.
 */
interface TrackedAnvil {
    dimensionId: string;
    location: { x: number; y: number; z: number };
    direction: string;
    lastActiveTick: number;
    playerId: string;
}

/**
 * Map of actively monitored anvils: key = `${dimId}:${x},${y},${z}`
 */
const activeAnvils = new Map<string, TrackedAnvil>();

/**
 * Set of block keys intentionally mined by a player with a pickaxe.
 * Maps key to expiration tick.
 */
const playerBrokenAnvils = new Map<string, number>();

/**
 * Returns true if the block type ID is any vanilla anvil variant.
 */
export function isAnvilBlock(typeId: string): boolean {
    return (
        typeId === "minecraft:anvil" ||
        typeId === "minecraft:chipped_anvil" ||
        typeId === "minecraft:damaged_anvil"
    );
}

/**
 * Safely extracts the cardinal direction permutation state from an anvil block.
 */
export function getAnvilDirection(block: Block): string {
    try {
        const dir = block.permutation.getState("minecraft:cardinal_direction");
        if (typeof dir === "string") return dir;
    } catch {
        // Fallback
    }
    return "north";
}

/**
 * Restores a chipped or damaged anvil block back to a pristine `minecraft:anvil`,
 * preserving its existing cardinal orientation.
 */
export function restoreAnvilToPristine(block: Block): boolean {
    if (block.typeId === "minecraft:anvil") return false;
    try {
        const dir = getAnvilDirection(block);
        try {
            const perm = BlockPermutation.resolve("minecraft:anvil", {
                "minecraft:cardinal_direction": dir,
            });
            block.setPermutation(perm);
        } catch {
            block.setPermutation(BlockPermutation.resolve("minecraft:anvil"));
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks whether an item is eligible for prior work penalty reset.
 * Eligible: Items with durability, enchantments, enchanted books, or custom names/lore.
 * Common stackable building blocks and food without modifications are skipped.
 */
export function isEligibleForPenaltyReset(item: ItemStack | undefined): boolean {
    if (!item) return false;

    // Enchanted books
    if (item.typeId === "minecraft:enchanted_book") return true;

    // Items with durability (weapons, tools, armor, bows, shears, shields, elytra, etc.)
    try {
        if (item.hasComponent(ItemComponentTypes.Durability)) return true;
    } catch {
        // Ignore
    }

    // Items with enchantable component and active enchantments
    try {
        const ench = item.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent | undefined;
        if (ench && ench.getEnchantments().length > 0) return true;
    } catch {
        // Ignore
    }

    // Items with custom name tag or lore
    if (item.nameTag !== undefined && item.nameTag !== "") return true;
    try {
        const lore = item.getLore();
        if (lore && lore.length > 0) return true;
    } catch {
        // Ignore
    }

    return false;
}

/**
 * Purifies an ItemStack by recreating it with clean NBT, stripping the accumulated
 * `RepairCost` prior work penalty tag while preserving 100% of its name, lore, durability,
 * enchantments, dye colors, dynamic properties, and adventure tags.
 */
export function purifyItem(item: ItemStack): ItemStack {
    try {
        // In Minecraft Bedrock Script API, a newly created ItemStack instance has no RepairCost NBT tag (penalty = 0).
        const fresh = new ItemStack(item.typeId, item.amount);

        // 1. Custom Name
        if (item.nameTag !== undefined && item.nameTag !== "") {
            fresh.nameTag = item.nameTag;
        }

        // 2. Lore
        try {
            const lore = item.getLore();
            if (lore && lore.length > 0) {
                fresh.setLore(lore);
            }
        } catch {
            // Ignore
        }

        // 3. Durability (damage & unbreakable)
        try {
            const oldDur = item.getComponent(ItemComponentTypes.Durability) as ItemDurabilityComponent | undefined;
            const newDur = fresh.getComponent(ItemComponentTypes.Durability) as ItemDurabilityComponent | undefined;
            if (oldDur && newDur) {
                newDur.damage = oldDur.damage;
                newDur.unbreakable = oldDur.unbreakable;
            }
        } catch {
            // Ignore
        }

        // 4. Enchantments
        try {
            const oldEnch = item.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent | undefined;
            const newEnch = fresh.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent | undefined;
            if (oldEnch && newEnch) {
                const enchants = oldEnch.getEnchantments();
                if (enchants && enchants.length > 0) {
                    for (const ench of enchants) {
                        try {
                            newEnch.addEnchantment(ench);
                        } catch {
                            // Fallback if individual enchantment fails
                        }
                    }
                }
            }
        } catch {
            // Ignore
        }

        // 5. Dye color (for leather armor)
        try {
            const oldDye = item.getComponent(ItemComponentTypes.Dyeable) as ItemDyeableComponent | undefined;
            const newDye = fresh.getComponent(ItemComponentTypes.Dyeable) as ItemDyeableComponent | undefined;
            if (oldDye && newDye && oldDye.color) {
                newDye.color = oldDye.color;
            }
        } catch {
            // Ignore
        }

        // 6. Dynamic Properties
        try {
            const propIds = item.getDynamicPropertyIds();
            for (const id of propIds) {
                const val = item.getDynamicProperty(id);
                if (val !== undefined) {
                    fresh.setDynamicProperty(id, val);
                }
            }
        } catch {
            // Ignore
        }

        // 7. Adventure tags
        try {
            const canDestroy = item.getCanDestroy();
            if (canDestroy && canDestroy.length > 0) fresh.setCanDestroy(canDestroy);
        } catch {
            // Ignore
        }
        try {
            const canPlaceOn = item.getCanPlaceOn();
            if (canPlaceOn && canPlaceOn.length > 0) fresh.setCanPlaceOn(canPlaceOn);
        } catch {
            // Ignore
        }

        // 8. LockMode & KeepOnDeath
        try {
            fresh.lockMode = item.lockMode;
            fresh.keepOnDeath = item.keepOnDeath;
        } catch {
            // Ignore
        }

        return fresh;
    } catch {
        // Return original item intact if recreation fails
        return item;
    }
}

/**
 * Purifies all eligible items in the player's inventory and equipped armor.
 * Returns the number of items purified.
 */
export function purifyPlayerInventory(player: Player): number {
    let count = 0;

    // 1. Inventory Container
    try {
        const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
        if (inv && inv.container) {
            for (let i = 0; i < inv.container.size; i++) {
                try {
                    const item = inv.container.getItem(i);
                    if (item && isEligibleForPenaltyReset(item)) {
                        const purified = purifyItem(item);
                        inv.container.setItem(i, purified);
                        count++;
                    }
                } catch {
                    // Ignore slot error
                }
            }
        }
    } catch {
        // Ignore container error
    }

    // 2. Equipped Armor & Offhand
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (equippable) {
            const slots = [
                EquipmentSlot.Head,
                EquipmentSlot.Chest,
                EquipmentSlot.Legs,
                EquipmentSlot.Feet,
                EquipmentSlot.Offhand,
                EquipmentSlot.Mainhand,
            ];
            for (const slot of slots) {
                try {
                    const item = equippable.getEquipment(slot);
                    if (item && isEligibleForPenaltyReset(item)) {
                        const purified = purifyItem(item);
                        equippable.setEquipment(slot, purified);
                        count++;
                    }
                } catch {
                    // Ignore slot error
                }
            }
        }
    } catch {
        // Ignore equippable error
    }

    return count;
}

/**
 * Purifies the player's currently held mainhand item.
 */
export function purifyPlayerMainhand(player: Player): { success: boolean; itemName: string } {
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!equippable) return { success: false, itemName: "" };

        const item = equippable.getEquipment(EquipmentSlot.Mainhand);
        if (!item || !isEligibleForPenaltyReset(item)) return { success: false, itemName: "" };

        const purified = purifyItem(item);
        equippable.setEquipment(EquipmentSlot.Mainhand, purified);

        const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
        if (inv && inv.container && player.selectedSlotIndex !== undefined) {
            try {
                inv.container.setItem(player.selectedSlotIndex, purified);
            } catch {
                // Ignore
            }
        }

        const displayName =
            item.nameTag ||
            item.typeId
                .replace("minecraft:", "")
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());

        return { success: true, itemName: displayName };
    } catch {
        return { success: false, itemName: "" };
    }
}

/**
 * Initializes the Unbreakable Anvil and "Too Expensive!" Cap Removal features.
 */
export function initUnbreakableAnvilFeature(): void {
    if (!AnvilConfig.enabled) return;

    // 1. Player Interact with Block (Right-click Anvil)
    world.afterEvents.playerInteractWithBlock.subscribe((event: PlayerInteractWithBlockAfterEvent) => {
        if (!AnvilConfig.enabled) return;

        const block = event.block;
        const player = event.player;

        if (!isAnvilBlock(block.typeId)) return;

        const anvilKey = `${block.dimension.id}:${block.location.x},${block.location.y},${block.location.z}`;
        const dir = getAnvilDirection(block);

        // Auto-restore chipped or damaged anvils to pristine condition
        if (AnvilConfig.unbreakable && block.typeId !== "minecraft:anvil") {
            const restored = restoreAnvilToPristine(block);
            if (restored && AnvilConfig.playEffects) {
                block.dimension.playSound("random.anvil_use", block.location, { volume: 0.8, pitch: 1.2 });
                block.dimension.spawnParticle("minecraft:wax_particle", {
                    x: block.location.x + 0.5,
                    y: block.location.y + 0.8,
                    z: block.location.z + 0.5,
                });
            }
        }

        // Register in active monitor to shield from wear-and-tear during container usage
        activeAnvils.set(anvilKey, {
            dimensionId: block.dimension.id,
            location: { x: block.location.x, y: block.location.y, z: block.location.z },
            direction: dir,
            lastActiveTick: system.currentTick,
            playerId: player.id,
        });

        // SNEAK + INTERACT: Purify Prior Work Penalty explicitly with sound & particle feedback
        if (player.isSneaking && AnvilConfig.sneakInteractPurify) {
            const mainhandRes = purifyPlayerMainhand(player);

            if (mainhandRes.success) {
                if (AnvilConfig.playEffects) {
                    player.dimension.playSound("random.anvil_use", player.location, { volume: 0.9, pitch: 1.3 });
                    player.dimension.spawnParticle("minecraft:totem_particle", {
                        x: block.location.x + 0.5,
                        y: block.location.y + 0.9,
                        z: block.location.z + 0.5,
                    });
                }
                if (AnvilConfig.showNotifications) {
                    showPlayerNotification(
                        player,
                        `§6✦ Anvil Master §7» §aPurified §e${mainhandRes.itemName}§a! Prior work penalty reset to 0.`
                    );
                }
                return;
            }

            // If mainhand was empty or not an eligible gear piece, purify all items in inventory
            const count = purifyPlayerInventory(player);
            if (AnvilConfig.playEffects) {
                player.dimension.playSound("random.anvil_use", player.location, { volume: 0.9, pitch: 1.5 });
                player.dimension.spawnParticle("minecraft:totem_particle", {
                    x: block.location.x + 0.5,
                    y: block.location.y + 0.9,
                    z: block.location.z + 0.5,
                });
            }
            if (AnvilConfig.showNotifications) {
                if (count > 0) {
                    showPlayerNotification(
                        player,
                        `§6✦ Anvil Master §7» §aPurified §e${count}§a items in inventory! Prior work penalty reset to 0.`
                    );
                } else {
                    showPlayerNotification(
                        player,
                        `§6✦ Anvil Master §7» §aAll items already in pristine condition!`
                    );
                }
            }
            return;
        }

        // NORMAL INTERACT (Opening Anvil Screen):
        // Automatically purge Prior Work Penalty on all inventory items before anvil screen calculates costs.
        if (!player.isSneaking && AnvilConfig.removeTooExpensiveCap && AnvilConfig.autoPurgeOnAnvilInteract) {
            purifyPlayerInventory(player);
        }
    });

    // 2. Player Place Block: Convert placed chipped/damaged anvils to pristine
    world.afterEvents.playerPlaceBlock.subscribe((event: PlayerPlaceBlockAfterEvent) => {
        if (!AnvilConfig.enabled || !AnvilConfig.unbreakable) return;

        const block = event.block;
        if (block.typeId === "minecraft:chipped_anvil" || block.typeId === "minecraft:damaged_anvil") {
            restoreAnvilToPristine(block);
        }
    });

    // 3. Player Break Block: Track intentional player pickaxe mining
    world.afterEvents.playerBreakBlock.subscribe((event: PlayerBreakBlockAfterEvent) => {
        if (!AnvilConfig.enabled) return;

        const brokenType = event.brokenBlockPermutation.type.id;
        if (!isAnvilBlock(brokenType)) return;

        const loc = event.block.location;
        const dimId = event.block.dimension.id;
        const key = `${dimId}:${loc.x},${loc.y},${loc.z}`;

        // Mark as intentionally mined so wear monitor won't re-create it
        playerBrokenAnvils.set(key, system.currentTick + 60);
        activeAnvils.delete(key);
    });

    // 4. Explosion Protection: Shield all anvils from Creepers, TNT, and Ghasts
    world.beforeEvents.explosion.subscribe((event: ExplosionBeforeEvent) => {
        if (!AnvilConfig.enabled || !AnvilConfig.protectFromExplosions) return;

        try {
            const impacted = event.getImpactedBlocks();
            const safe = impacted.filter((b) => !isAnvilBlock(b.typeId));
            event.setImpactedBlocks(safe);
        } catch {
            // Ignore
        }
    });

    // 5. Periodic Monitor: Continuous wear protection and penalty cleansing while near anvils
    system.runInterval(() => {
        if (!AnvilConfig.enabled) return;

        const currentTick = system.currentTick;

        // Cleanup expired player-broken keys
        for (const [key, expireTick] of playerBrokenAnvils.entries()) {
            if (currentTick > expireTick) {
                playerBrokenAnvils.delete(key);
            }
        }

        if (activeAnvils.size === 0) return;

        for (const [key, tracked] of activeAnvils.entries()) {
            // Expire tracking after 300 ticks (15s) of inactivity
            if (currentTick - tracked.lastActiveTick > 300) {
                activeAnvils.delete(key);
                continue;
            }

            try {
                const dim = world.getDimension(tracked.dimensionId);
                if (!dim) continue;

                const block = dim.getBlock(tracked.location);
                if (!block) continue;

                // Case A: Block degraded to chipped or damaged anvil -> restore immediately
                if (
                    AnvilConfig.unbreakable &&
                    (block.typeId === "minecraft:chipped_anvil" || block.typeId === "minecraft:damaged_anvil")
                ) {
                    try {
                        const perm = BlockPermutation.resolve("minecraft:anvil", {
                            "minecraft:cardinal_direction": tracked.direction,
                        });
                        block.setPermutation(perm);
                    } catch {
                        block.setPermutation(BlockPermutation.resolve("minecraft:anvil"));
                    }

                    if (AnvilConfig.playEffects) {
                        dim.playSound("random.anvil_use", tracked.location, { volume: 0.6, pitch: 1.2 });
                        dim.spawnParticle("minecraft:wax_particle", {
                            x: tracked.location.x + 0.5,
                            y: tracked.location.y + 0.8,
                            z: tracked.location.z + 0.5,
                        });
                    }
                }

                // Case B: Block destroyed into air without intentional player mining (vanilla 12% break on use)
                if (AnvilConfig.unbreakable && block.typeId === "minecraft:air") {
                    const isIntentional = playerBrokenAnvils.has(key);
                    if (!isIntentional) {
                        try {
                            const perm = BlockPermutation.resolve("minecraft:anvil", {
                                "minecraft:cardinal_direction": tracked.direction,
                            });
                            block.setPermutation(perm);
                        } catch {
                            block.setPermutation(BlockPermutation.resolve("minecraft:anvil"));
                        }

                        if (AnvilConfig.playEffects) {
                            dim.playSound("random.anvil_land", tracked.location, { volume: 0.8, pitch: 1.0 });
                            dim.spawnParticle("minecraft:totem_particle", {
                                x: tracked.location.x + 0.5,
                                y: tracked.location.y + 0.8,
                                z: tracked.location.z + 0.5,
                            });
                        }
                    }
                }

                // Check active player near this anvil: keep anvil active and continuously cleanse crafted items
                const player = world.getEntity(tracked.playerId) as Player | undefined;
                if (player && player.isValid) {
                    const pLoc = player.location;
                    const distSq =
                        Math.pow(pLoc.x - (tracked.location.x + 0.5), 2) +
                        Math.pow(pLoc.y - (tracked.location.y + 0.5), 2) +
                        Math.pow(pLoc.z - (tracked.location.z + 0.5), 2);

                    if (distSq <= 36) {
                        // Refresh active timestamp
                        tracked.lastActiveTick = currentTick;

                        // Continuously purge Prior Work Penalty every 20 ticks (1s) so chained combining is seamless
                        if (AnvilConfig.removeTooExpensiveCap && currentTick % 20 === 0) {
                            purifyPlayerInventory(player);
                        }
                    }
                }
            } catch {
                // Ignore dimension/block access errors
            }
        }
    }, 4);
}
