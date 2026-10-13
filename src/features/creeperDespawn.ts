import { world, system, Dimension } from "@minecraft/server";
import { CreeperMorningDespawnConfig } from "../config";

/**
 * Initializes the Morning Creeper Despawn mechanic.
 * Surface creepers exposed to morning sunlight safely despawn with smoke particles,
 * preventing base camping creepers when players step outside in the morning.
 * Underground caves, ravines, and named creepers are completely untouched.
 */
export function initCreeperMorningDespawnFeature(): void {
    if (!CreeperMorningDespawnConfig.enabled) return;

    system.runInterval(() => {
        try {
            checkAndDespawnCreepers();
        } catch {
            // Ignore transient tick errors
        }
    }, CreeperMorningDespawnConfig.checkIntervalTicks);
}

/**
 * Evaluates overworld creepers and despawns surface creepers exposed to morning daylight.
 */
function checkAndDespawnCreepers(): void {
    const timeOfDay = world.getTimeOfDay();

    // In Minecraft:
    // 0 to 12000 is daytime (sun shining).
    // 0 to 6000 is morning specifically (sunrise to noon).
    const isDay = timeOfDay >= 0 && timeOfDay < 12000;
    if (!isDay) return;

    if (CreeperMorningDespawnConfig.morningOnly && timeOfDay > 6000) {
        return;
    }

    let overworld: Dimension;
    try {
        overworld = world.getDimension("minecraft:overworld");
    } catch {
        return;
    }

    const creepers = overworld.getEntities({ type: "minecraft:creeper" });
    for (const creeper of creepers) {
        if (!creeper.isValid) continue;

        // Keep player's pet / named creepers safe
        if (CreeperMorningDespawnConfig.protectNamedCreepers && creeper.nameTag && creeper.nameTag.length > 0) {
            continue;
        }

        const loc = creeper.location;
        const blockLoc = {
            x: Math.floor(loc.x),
            y: Math.floor(loc.y + 1), // Creeper eye / head level
            z: Math.floor(loc.z),
        };

        let block;
        try {
            block = overworld.getBlock(blockLoc);
        } catch {
            continue;
        }
        if (!block) continue;

        // Verify sky light level shining on the creeper
        const skyLight = block.getSkyLightLevel();
        if (skyLight < CreeperMorningDespawnConfig.minSkyLightLevel) {
            continue;
        }

        // Verify no solid roof / cave ceiling directly overhead
        try {
            const blockAbove = overworld.getBlockAbove(blockLoc);
            if (blockAbove && !blockAbove.isAir) {
                const aboveType = blockAbove.typeId;
                if (
                    aboveType.includes("stone") ||
                    aboveType.includes("deepslate") ||
                    aboveType.includes("dirt") ||
                    aboveType.includes("wood") ||
                    aboveType.includes("planks") ||
                    aboveType.includes("cobblestone") ||
                    aboveType.includes("netherrack") ||
                    aboveType.includes("sandstone")
                ) {
                    continue; // Inside cave, dungeon, or under solid structure
                }
            }
        } catch {
            // Fall back to skyLight check if getBlockAbove fails
        }

        // Despawn surface creeper in daylight with poof particles & fizzing sound
        const particleLoc = { x: loc.x, y: loc.y + 0.8, z: loc.z };
        if (CreeperMorningDespawnConfig.showPoofParticles) {
            try {
                overworld.spawnParticle("minecraft:smoke_particle", particleLoc);
            } catch {
                // Ignore particle error
            }
        }

        if (CreeperMorningDespawnConfig.playSound) {
            try {
                overworld.playSound("random.fizz", loc, { volume: 0.6, pitch: 1.2 });
            } catch {
                // Ignore sound error
            }
        }

        try {
            creeper.remove();
        } catch {
            // Ignore removal error
        }
    }
}
