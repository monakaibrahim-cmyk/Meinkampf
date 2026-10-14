import {
    BlockPermutation,
    Dimension,
    EntityComponentTypes,
    EquipmentSlot,
    ItemComponentTypes,
    ItemEnchantableComponent,
    ItemStack,
    Player,
    PlayerBreakBlockAfterEvent,
    system,
    Vector3,
} from "@minecraft/server";
import { SilkTouchSpawnerConfig, VeinMinerConfig } from "../config";
import { posKey } from "../utils/blocks";
import { damageMainhandTool, getPickaxeTier, isPickaxe } from "../utils/tools";
import { showPlayerNotification } from "../utils/notifications";
import { createHarvestedSpawnerItem } from "../utils/spawners";

// Set of coordinates currently being broken by VeinMiner cascade to prevent re-entrancy
export const activeMiningPositions = new Set<string>();

export interface OreDropInfo {
    items: { typeId: string; count: number }[];
    xp: number;
}

/**
 * Returns the ore family name if the block is a supported ore or spawner.
 */
export function getOreFamily(typeId: string): string | undefined {
    if (typeId.includes("coal_ore")) return "coal";
    if (typeId.includes("iron_ore")) return "iron";
    if (typeId.includes("copper_ore")) return "copper";
    if (typeId.includes("gold_ore")) return "gold";
    if (typeId.includes("redstone_ore") || typeId.includes("lit_redstone_ore")) return "redstone";
    if (typeId.includes("lapis_ore")) return "lapis";
    if (typeId.includes("diamond_ore")) return "diamond";
    if (typeId.includes("emerald_ore")) return "emerald";
    if (typeId.includes("nether_quartz_ore")) return "quartz";
    if (typeId.includes("ancient_debris")) return "ancient_debris";
    if (typeId === "minecraft:glowstone") return "glowstone";
    if (typeId === "minecraft:amethyst_cluster") return "amethyst";
    if (typeId === "minecraft:raw_iron_block") return "raw_iron_block";
    if (typeId === "minecraft:raw_copper_block") return "raw_copper_block";
    if (typeId === "minecraft:raw_gold_block") return "raw_gold_block";
    if (typeId === "minecraft:mob_spawner") return "spawner";
    return undefined;
}

/**
 * Returns the minimum required pickaxe tier to harvest an ore family.
 * (0 = Wood/Gold, 1 = Stone, 2 = Iron, 3 = Diamond, 4 = Netherite)
 */
export function getRequiredTier(family: string): number {
    switch (family) {
        case "ancient_debris":
            return 3; // Diamond or Netherite
        case "diamond":
        case "emerald":
        case "gold":
        case "redstone":
        case "raw_gold_block":
        case "spawner":
            return 2; // Iron or above
        case "iron":
        case "copper":
        case "lapis":
        case "raw_iron_block":
        case "raw_copper_block":
            return 1; // Stone or above
        case "coal":
        case "quartz":
        case "glowstone":
        case "amethyst":
        default:
            return 0; // Wood or above
    }
}

/**
 * Calculates drop multiplier using standard vanilla Minecraft Fortune formula.
 */
function getFortuneMultiplier(fortuneLevel: number): number {
    if (fortuneLevel <= 0) return 1;
    // Vanilla rolls 0 to (fortuneLevel + 1). If 0 or 1, gives 1x.
    const roll = Math.floor(Math.random() * (fortuneLevel + 2));
    return Math.max(1, roll);
}

/**
 * Calculates item drops and XP for a given ore block based on Fortune and Silk Touch.
 */
export function getOreDrops(
    blockTypeId: string,
    family: string,
    fortuneLevel: number,
    silkTouchLevel: number
): OreDropInfo {
    // 1. Silk Touch: Always drops the block itself with 0 XP
    if (silkTouchLevel > 0) {
        if (family === "spawner" && !SilkTouchSpawnerConfig.enabled) {
            return {
                items: [],
                xp: Math.floor(Math.random() * 29) + 15, // 15-43 XP
            };
        }
        let dropId = blockTypeId;
        if (dropId === "minecraft:lit_redstone_ore") dropId = "minecraft:redstone_ore";
        if (dropId === "minecraft:lit_deepslate_redstone_ore") dropId = "minecraft:deepslate_redstone_ore";
        return {
            items: [{ typeId: dropId, count: 1 }],
            xp: 0,
        };
    }

    const fortuneMult = getFortuneMultiplier(fortuneLevel);

    // 2. Family-specific drops with Fortune & XP
    switch (family) {
        case "coal":
            return {
                items: [{ typeId: "minecraft:coal", count: fortuneMult }],
                xp: Math.floor(Math.random() * 3), // 0-2 XP
            };
        case "iron":
            return {
                items: [{ typeId: "minecraft:raw_iron", count: fortuneMult }],
                xp: 1,
            };
        case "copper": {
            const baseCount = Math.floor(Math.random() * 4) + 2; // 2-5 raw copper
            return {
                items: [{ typeId: "minecraft:raw_copper", count: baseCount * fortuneMult }],
                xp: 1,
            };
        }
        case "gold": {
            if (blockTypeId.includes("nether_gold")) {
                const nuggets = (Math.floor(Math.random() * 5) + 2) * fortuneMult; // 2-6 nuggets * fortune
                return {
                    items: [{ typeId: "minecraft:gold_nugget", count: nuggets }],
                    xp: 1,
                };
            }
            return {
                items: [{ typeId: "minecraft:raw_gold", count: fortuneMult }],
                xp: 1,
            };
        }
        case "redstone": {
            const count = Math.floor(Math.random() * 2) + 4 + (fortuneLevel > 0 ? Math.floor(Math.random() * (fortuneLevel + 1)) : 0); // 4-5 + bonus
            return {
                items: [{ typeId: "minecraft:redstone", count }],
                xp: Math.floor(Math.random() * 5) + 1, // 1-5 XP
            };
        }
        case "lapis": {
            const baseCount = Math.floor(Math.random() * 6) + 4; // 4-9 lapis
            return {
                items: [{ typeId: "minecraft:lapis_lazuli", count: baseCount * fortuneMult }],
                xp: Math.floor(Math.random() * 4) + 2, // 2-5 XP
            };
        }
        case "diamond":
            return {
                items: [{ typeId: "minecraft:diamond", count: fortuneMult }],
                xp: Math.floor(Math.random() * 5) + 3, // 3-7 XP
            };
        case "emerald":
            return {
                items: [{ typeId: "minecraft:emerald", count: fortuneMult }],
                xp: Math.floor(Math.random() * 5) + 3, // 3-7 XP
            };
        case "quartz":
            return {
                items: [{ typeId: "minecraft:quartz", count: fortuneMult }],
                xp: Math.floor(Math.random() * 4) + 2, // 2-5 XP
            };
        case "ancient_debris":
            return {
                items: [{ typeId: "minecraft:ancient_debris", count: 1 }],
                xp: 2,
            };
        case "glowstone": {
            const count = Math.min(4, Math.floor(Math.random() * 3) + 2 + fortuneLevel); // 2-4 dust
            return {
                items: [{ typeId: "minecraft:glowstone_dust", count }],
                xp: 0,
            };
        }
        case "amethyst": {
            const count = 4 * fortuneMult;
            return {
                items: [{ typeId: "minecraft:amethyst_shard", count }],
                xp: 0,
            };
        }
        case "raw_iron_block":
        case "raw_copper_block":
        case "raw_gold_block":
            return {
                items: [{ typeId: blockTypeId, count: 1 }],
                xp: 0,
            };
        case "spawner":
            if (SilkTouchSpawnerConfig.enabled && !SilkTouchSpawnerConfig.requireSilkTouch) {
                return {
                    items: [{ typeId: "minecraft:mob_spawner", count: 1 }],
                    xp: 0,
                };
            }
            return {
                items: [],
                xp: Math.floor(Math.random() * 29) + 15, // 15-43 XP
            };
        default:
            return {
                items: [{ typeId: blockTypeId, count: 1 }],
                xp: 0,
            };
    }
}

/**
 * Main handler triggered whenever a player breaks a block.
 */
export function handleVeinMine(event: PlayerBreakBlockAfterEvent): void {
    if (!VeinMinerConfig.enabled) return;

    const { block, brokenBlockPermutation, dimension, player, itemStackBeforeBreak } = event;
    const brokenTypeId = brokenBlockPermutation.type.id;

    // 1. Verify that the broken block is an ore
    const family = getOreFamily(brokenTypeId);
    if (!family) return;

    const startPos: Vector3 = {
        x: Math.floor(block.location.x),
        y: Math.floor(block.location.y),
        z: Math.floor(block.location.z),
    };
    const startKey = posKey(startPos);

    // Ignore if this block was broken by an active cascade
    if (activeMiningPositions.has(startKey)) {
        activeMiningPositions.delete(startKey);
        return;
    }

    // 2. Validate pickaxe requirements
    if (VeinMinerConfig.requirePickaxe && !isPickaxe(itemStackBeforeBreak)) {
        return;
    }

    // 3. Validate pickaxe harvest tier
    const pickaxeTier = getPickaxeTier(itemStackBeforeBreak);
    const requiredTier = getRequiredTier(family);
    if (pickaxeTier < requiredTier) {
        return;
    }

    // 4. Validate sneaking requirement
    if (VeinMinerConfig.sneakToActivate && !player.isSneaking) {
        return;
    }

    // 5. Read player's pickaxe enchantments
    let fortuneLevel = 0;
    let silkTouchLevel = 0;

    if (VeinMinerConfig.supportEnchantments && itemStackBeforeBreak) {
        try {
            const enchantable = itemStackBeforeBreak.getComponent(
                ItemComponentTypes.Enchantable
            ) as ItemEnchantableComponent | undefined;
            if (enchantable) {
                fortuneLevel = enchantable.getEnchantment("fortune")?.level ?? 0;
                silkTouchLevel = enchantable.getEnchantment("silk_touch")?.level ?? 0;
            }
        } catch {
            // Ignore
        }
    }

    // 6. BFS Search for all connected ores of the same family
    const visited = new Set<string>([startKey]);
    const queue: Vector3[] = [startPos];
    const oresToMine: { pos: Vector3; typeId: string }[] = [];

    const { maxBlocks, maxRadius } = VeinMinerConfig;

    while (queue.length > 0 && oresToMine.length < maxBlocks) {
        const current = queue.shift()!;

        // Search 26 adjacent directions
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;

                    const neighbor: Vector3 = {
                        x: current.x + dx,
                        y: current.y + dy,
                        z: current.z + dz,
                    };

                    // Check radius bounds
                    if (
                        Math.abs(neighbor.x - startPos.x) > maxRadius ||
                        Math.abs(neighbor.y - startPos.y) > maxRadius ||
                        Math.abs(neighbor.z - startPos.z) > maxRadius
                    ) {
                        continue;
                    }

                    const key = posKey(neighbor);
                    if (visited.has(key)) continue;

                    try {
                        const targetBlock = dimension.getBlock(neighbor);
                        if (!targetBlock) continue;

                        const targetFamily = getOreFamily(targetBlock.typeId);
                        if (targetFamily === family) {
                            visited.add(key);
                            queue.push(neighbor);
                            oresToMine.push({ pos: neighbor, typeId: targetBlock.typeId });
                        }
                    } catch {
                        // Unloaded chunk
                    }
                }
            }
        }
    }

    if (oresToMine.length === 0) {
        return; // Only 1 block existed (already broken by player)
    }

    // Sort closest to farthest
    oresToMine.sort((a, b) => {
        const distA = (a.pos.x - startPos.x) ** 2 + (a.pos.y - startPos.y) ** 2 + (a.pos.z - startPos.z) ** 2;
        const distB = (b.pos.x - startPos.x) ** 2 + (b.pos.y - startPos.y) ** 2 + (b.pos.z - startPos.z) ** 2;
        return distA - distB;
    });

    const { blocksPerTick, directPickup } = VeinMinerConfig;

    // Break an ore node and award drops and experience
    const mineNode = (node: { pos: Vector3; typeId: string }) => {
        const key = posKey(node.pos);
        activeMiningPositions.add(key);

        try {
            const targetBlock = dimension.getBlock(node.pos);
            if (targetBlock) {
                targetBlock.setPermutation(BlockPermutation.resolve("minecraft:air"));
            }

            // Calculate drops & xp
            const dropInfo = getOreDrops(node.typeId, family, fortuneLevel, silkTouchLevel);
            const dropLocation = directPickup ? player.location : { x: node.pos.x + 0.5, y: node.pos.y + 0.5, z: node.pos.z + 0.5 };

            // Spawn items
            if (node.typeId === "minecraft:mob_spawner" && dropInfo.items.length > 0) {
                const { spawnerItem, eggItem } = createHarvestedSpawnerItem(dimension, node.pos);
                dimension.spawnItem(spawnerItem, dropLocation);
                if (eggItem) {
                    try {
                        dimension.spawnItem(eggItem, dropLocation);
                    } catch {
                        // Egg item creation safety
                    }
                }
            } else {
                for (const item of dropInfo.items) {
                    dimension.spawnItem(new ItemStack(item.typeId, item.count), dropLocation);
                }
            }

            // Spawn XP
            if (dropInfo.xp > 0) {
                dimension.spawnEntity("minecraft:xp_orb", player.location);
            }

            // Audio & visual feedback
            dimension.playSound("dig.stone", node.pos, { volume: 0.7, pitch: 1.0 });
            dimension.spawnParticle("minecraft:crop_growth_emitter", {
                x: node.pos.x + 0.5,
                y: node.pos.y + 0.5,
                z: node.pos.z + 0.5,
            });
        } catch {
            // Ignore
        } finally {
            system.runTimeout(() => {
                activeMiningPositions.delete(key);
            }, 5);
        }
    };

    const onComplete = () => {
        if (!player || !player.isValid) return;

        const totalCount = oresToMine.length + 1;
        const isRare = family === "diamond" || family === "ancient_debris" || family === "emerald";

        if (isRare) {
            try {
                dimension.playSound("chime.amethyst_block", player.location, { volume: 0.8, pitch: 1.2 });
            } catch {
                // Ignore
            }
        }

        const familyDisplay = family.replace("_", " ").toUpperCase();
        showPlayerNotification(player, `§a⛏ Vein Mined ${totalCount} ${familyDisplay} Ores!§r`);
    };

    // 7. Break ores: instant or animated over ticks
    if (blocksPerTick <= 0) {
        for (const node of oresToMine) {
            mineNode(node);
        }
        onComplete();
    } else {
        let index = 0;
        const intervalId = system.runInterval(() => {
            const batchLimit = Math.min(index + blocksPerTick, oresToMine.length);

            for (; index < batchLimit; index++) {
                mineNode(oresToMine[index]);
            }

            if (index >= oresToMine.length) {
                system.clearRun(intervalId);
                onComplete();
            }
        }, 1);
    }
}

