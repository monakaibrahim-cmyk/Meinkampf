import { world, system, GameMode } from "@minecraft/server";
import { XpMagnetConfig } from "../config";

/**
 * Initializes the XP Magnet auto-collection feature.
 * Attracts or teleports XP orbs from a distance directly to players,
 * preventing lost experience in lava, ravines, walls, or mining pits.
 */
export function initXpMagnetFeature(): void {
    if (!XpMagnetConfig.enabled) return;

    system.runInterval(() => {
        try {
            collectNearbyXp();
        } catch {
            // Ignore transient tick errors
        }
    }, XpMagnetConfig.checkIntervalTicks);
}

/**
 * Scans for nearby XP orbs around players and pulls them towards the player.
 */
function collectNearbyXp(): void {
    const players = world.getAllPlayers();
    for (const player of players) {
        if (!player.isValid) continue;

        if (XpMagnetConfig.sneakOnly && !player.isSneaking) {
            continue;
        }

        if (XpMagnetConfig.ignoreCreative) {
            try {
                const gm = player.getGameMode();
                if (gm === GameMode.Creative || gm === GameMode.Spectator) {
                    continue;
                }
            } catch {
                // Ignore game mode check failure
            }
        }

        const dim = player.dimension;
        const playerLoc = player.location;
        const targetY = playerLoc.y + 0.6; // Torso level

        let orbs;
        try {
            orbs = dim.getEntities({
                type: "minecraft:xp_orb",
                location: playerLoc,
                maxDistance: XpMagnetConfig.radius,
            });
        } catch {
            continue;
        }

        for (const orb of orbs) {
            if (!orb.isValid) continue;

            const orbLoc = orb.location;
            const dx = playerLoc.x - orbLoc.x;
            const dy = targetY - orbLoc.y;
            const dz = playerLoc.z - orbLoc.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // If already within 0.7 blocks, vanilla pickup immediately absorbs it
            if (dist < 0.7) continue;

            if (XpMagnetConfig.collectionMode === "instant") {
                // Instantly teleport directly to player torso for immediate pickup
                try {
                    orb.teleport({ x: playerLoc.x, y: targetY, z: playerLoc.z });
                } catch {
                    // Ignore
                }
            } else {
                // Vacuum / smooth magnetic acceleration towards player
                const step = Math.min(XpMagnetConfig.vacuumSpeed, dist);
                const nx = (dx / dist) * step;
                const ny = (dy / dist) * step;
                const nz = (dz / dist) * step;

                try {
                    orb.teleport({
                        x: orbLoc.x + nx,
                        y: orbLoc.y + ny,
                        z: orbLoc.z + nz,
                    });
                } catch {
                    // Ignore
                }
            }
        }
    }
}
