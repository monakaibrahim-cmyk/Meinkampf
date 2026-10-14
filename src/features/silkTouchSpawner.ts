import {
    GameMode,
    ItemComponentTypes,
    ItemEnchantableComponent,
    PlayerBreakBlockAfterEvent,
    Vector3,
} from "@minecraft/server";
import { SilkTouchSpawnerConfig } from "../config";
import { getPickaxeTier, isPickaxe } from "../utils/tools";
import { showPlayerNotification } from "../utils/notifications";
import { activeMiningPositions } from "./veinMiner";
import { posKey } from "../utils/blocks";
import { createHarvestedSpawnerItem } from "../utils/spawners";

/**
 * Handles Silk Touch mob spawner harvesting.
 */
export function handleSilkTouchSpawner(event: PlayerBreakBlockAfterEvent): void {
    if (!SilkTouchSpawnerConfig.enabled) return;

    const { block, brokenBlockPermutation, dimension, player, itemStackBeforeBreak } = event;
    const brokenTypeId = brokenBlockPermutation.type.id;

    if (brokenTypeId !== "minecraft:mob_spawner") return;

    const blockPos: Vector3 = {
        x: Math.floor(block.location.x),
        y: Math.floor(block.location.y),
        z: Math.floor(block.location.z),
    };

    // Ignore if this block was broken as part of an active VeinMiner cascade
    if (activeMiningPositions.has(posKey(blockPos))) {
        return;
    }

    // Ignore creative or spectator mode
    try {
        const gm = player.getGameMode();
        if (gm === GameMode.Creative || gm === GameMode.Spectator) return;
    } catch {
        // Fallback
    }

    // Must be a pickaxe of the required tier
    if (!isPickaxe(itemStackBeforeBreak)) return;
    if (getPickaxeTier(itemStackBeforeBreak) < SilkTouchSpawnerConfig.requiredTier) return;

    // Check Silk Touch enchantment
    let silkTouchLevel = 0;
    if (itemStackBeforeBreak) {
        try {
            const enchantable = itemStackBeforeBreak.getComponent(
                ItemComponentTypes.Enchantable
            ) as ItemEnchantableComponent | undefined;
            if (enchantable) {
                silkTouchLevel = enchantable.getEnchantment("silk_touch")?.level ?? 0;
            }
        } catch {
            // Ignore
        }
    }

    if (SilkTouchSpawnerConfig.requireSilkTouch && silkTouchLevel <= 0) {
        return;
    }

    // Harvest the spawner!
    const { spawnerItem, eggItem, mobName } = createHarvestedSpawnerItem(dimension, blockPos);

    const dropLocation = SilkTouchSpawnerConfig.directPickup
        ? player.location
        : { x: blockPos.x + 0.5, y: blockPos.y + 0.5, z: blockPos.z + 0.5 };

    dimension.spawnItem(spawnerItem, dropLocation);

    if (eggItem) {
        try {
            dimension.spawnItem(eggItem, dropLocation);
        } catch {
            // Egg item creation safety
        }
    }

    // Visual and sound feedback
    if (SilkTouchSpawnerConfig.playSounds) {
        try {
            dimension.playSound("random.orb", player.location, { volume: 0.8, pitch: 1.2 });
            dimension.playSound("dig.stone", blockPos, { volume: 1.0, pitch: 0.9 });
            dimension.spawnParticle("minecraft:crop_growth_emitter", {
                x: blockPos.x + 0.5,
                y: blockPos.y + 0.5,
                z: blockPos.z + 0.5,
            });
        } catch {
            // Audio/particle safety
        }
    }

    const label = mobName ? `${mobName} Spawner` : "Mob Spawner";
    showPlayerNotification(player, `§a📦 Harvested ${label} with Silk Touch!§r`);
}
