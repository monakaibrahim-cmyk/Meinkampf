import { world, system, Dimension } from "@minecraft/server";
import { CreeperMorningDespawnConfig } from "../config";
import { isPlayerNamedEntity } from "./mobHealthBar";

/**
 * Initializes the Morning Creeper Despawn & Daylight Burning mechanic.
 * Surface creepers exposed to morning sunlight burn like zombies and/or safely despawn,
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
 * Evaluates overworld creepers and burns/despawns surface creepers exposed to daylight.
 */
function checkAndDespawnCreepers(): void {
    const timeOfDay = world.getTimeOfDay();

    // In Minecraft:
    // A 24,000-tick day cycle:
    // - 23000 to 24000 (0): Dawn / early morning (sun rising)
    // - 0 to 6000: Morning (sunrise to midday / noon)
    // - 6000 to 12000: Afternoon (noon to sunset)
    // - 12000 to 13000: Dusk
    // - 13000 to 23000: Night
    const isDaytime = timeOfDay >= 23000 || timeOfDay < 12000;
    if (!isDaytime) return;

    if (CreeperMorningDespawnConfig.morningOnly) {
        const isMorning = timeOfDay >= 23000 || timeOfDay < 6000;
        if (!isMorning) return;
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

        // Keep player's pet / named creepers safe and extinguish any daylight fire
        if (CreeperMorningDespawnConfig.protectNamedCreepers && isPlayerNamedEntity(creeper)) {
            try {
                creeper.extinguishFire(true);
            } catch {}
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

        // Verify sky light level shining on the creeper (vanilla daylight burn uses light >= 8)
        const skyLight = block.getSkyLightLevel();
        if (skyLight < CreeperMorningDespawnConfig.minSkyLightLevel) {
            continue;
        }

        // Verify no solid roof / cave ceiling directly overhead (within 12 blocks)
        try {
            const blockAbove = overworld.getBlockAbove(blockLoc);
            if (blockAbove && !blockAbove.isAir) {
                const heightDiff = blockAbove.location.y - blockLoc.y;
                if (heightDiff <= 12) {
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
            }
        } catch {
            // Fall back to skyLight check if getBlockAbove fails
        }

        const action = CreeperMorningDespawnConfig.action;

        // 1. Burn like a zombie in daylight
        if (action === "burn" || action === "both") {
            try {
                creeper.setOnFire(CreeperMorningDespawnConfig.burnDurationSeconds, true);
            } catch {}
        }

        // 2. Smoke poof particles and fizz sound
        const particleLoc = { x: loc.x, y: loc.y + 0.8, z: loc.z };
        if (CreeperMorningDespawnConfig.showPoofParticles) {
            try {
                overworld.spawnParticle("minecraft:smoke_particle", particleLoc);
            } catch {}
        }

        if (CreeperMorningDespawnConfig.playSound) {
            try {
                overworld.playSound("random.fizz", loc, { volume: 0.6, pitch: 1.2 });
            } catch {}
        }

        // 3. Despawn removal (if action is "despawn" or "both")
        if (action === "despawn" || action === "both") {
            try {
                creeper.remove();
            } catch {}
        }
    }
}
