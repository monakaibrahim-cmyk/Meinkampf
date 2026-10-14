import { Dimension, ItemStack, Vector3 } from "@minecraft/server";
import { SilkTouchSpawnerConfig } from "../config";

export const SPAWNER_MOB_EGGS: Record<string, { eggId: string; name: string }> = {
    "minecraft:zombie": { eggId: "minecraft:zombie_spawn_egg", name: "Zombie" },
    "minecraft:skeleton": { eggId: "minecraft:skeleton_spawn_egg", name: "Skeleton" },
    "minecraft:spider": { eggId: "minecraft:spider_spawn_egg", name: "Spider" },
    "minecraft:cave_spider": { eggId: "minecraft:cave_spider_spawn_egg", name: "Cave Spider" },
    "minecraft:blaze": { eggId: "minecraft:blaze_spawn_egg", name: "Blaze" },
    "minecraft:silverfish": { eggId: "minecraft:silverfish_spawn_egg", name: "Silverfish" },
    "minecraft:magma_cube": { eggId: "minecraft:magma_cube_spawn_egg", name: "Magma Cube" },
};

/**
 * Attempts to detect the spawner's mob entity type by scanning nearby matching mobs.
 */
export function detectNearbySpawnerMob(dimension: Dimension, location: Vector3): { eggId: string; name: string } | null {
    try {
        const nearby = dimension.getEntities({
            location,
            maxDistance: 6,
        });
        for (const ent of nearby) {
            if (ent.typeId in SPAWNER_MOB_EGGS) {
                return SPAWNER_MOB_EGGS[ent.typeId];
            }
        }
    } catch {
        // Fallback
    }
    return null;
}

/**
 * Creates a harvested Mob Spawner item stack with lore and nameTag,
 * and optionally a matching spawn egg item if detected.
 */
export function createHarvestedSpawnerItem(
    dimension: Dimension,
    location: Vector3
): { spawnerItem: ItemStack; eggItem?: ItemStack; mobName?: string } {
    const mobInfo = detectNearbySpawnerMob(dimension, location);
    const spawnerItem = new ItemStack("minecraft:mob_spawner", 1);

    if (mobInfo) {
        spawnerItem.nameTag = `§eMob Spawner (${mobInfo.name})§r`;
        spawnerItem.setLore([
            "§7Harvested with Silk Touch",
            `§7Original Type: §f${mobInfo.name}`,
            "§8Right-click with spawn egg to set type",
        ]);
    } else {
        spawnerItem.nameTag = "§eMob Spawner§r";
        spawnerItem.setLore([
            "§7Harvested with Silk Touch",
            "§8Right-click with spawn egg to set type",
        ]);
    }

    let eggItem: ItemStack | undefined;
    if (mobInfo && SilkTouchSpawnerConfig.dropMatchingSpawnEgg) {
        try {
            eggItem = new ItemStack(mobInfo.eggId, 1);
        } catch {
            // Egg item creation safety
        }
    }

    return { spawnerItem, eggItem, mobName: mobInfo?.name };
}
