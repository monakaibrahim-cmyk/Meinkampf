import { Dimension, system, Vector3 } from "@minecraft/server";
import { TreeCapitatorConfig } from "../config";
import { isLeaves, isLog, isMatchingLeafForLog, isPlayerPlacedLeaves, parsePos, posKey } from "../utils/blocks";

/**
 * Checks if a position is within maxDistance blocks of any felled tree log.
 * Enforces strict canopy bounds so BFS never traverses deep into neighboring trees.
 */
function isNearFelledLogs(pos: Vector3, felledLogs: Vector3[], maxDist: number = 5): boolean {
    for (const log of felledLogs) {
        if (
            Math.abs(pos.x - log.x) <= maxDist &&
            Math.abs(pos.y - log.y) <= maxDist &&
            Math.abs(pos.z - log.z) <= maxDist
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Checks if a given leaf block has any surviving log block within support distance (4 blocks).
 * If a log is found that was NOT part of the felled tree, the leaf is considered supported.
 * Uses blockLogCache across all leaves in the canopy to eliminate redundant getBlock queries.
 */
function hasSurvivingLogSupport(
    dimension: Dimension,
    leafPos: Vector3,
    felledLogKeys: Set<string>,
    blockLogCache: Map<string, boolean>,
    supportRadius: number = 4
): boolean {
    for (let dx = -supportRadius; dx <= supportRadius; dx++) {
        for (let dy = -supportRadius; dy <= supportRadius; dy++) {
            for (let dz = -supportRadius; dz <= supportRadius; dz++) {
                // Vanilla leaf support uses taxicab distance (Manhattan) <= 4
                if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > supportRadius) continue;

                const checkPos: Vector3 = {
                    x: leafPos.x + dx,
                    y: leafPos.y + dy,
                    z: leafPos.z + dz,
                };

                const checkKey = posKey(checkPos);
                if (felledLogKeys.has(checkKey)) {
                    // This log was part of the felled tree, so it cannot support the leaf
                    continue;
                }

                // Check cache first to avoid redundant getBlock queries
                const cachedIsLog = blockLogCache.get(checkKey);
                if (cachedIsLog !== undefined) {
                    if (cachedIsLog) return true;
                    continue;
                }

                try {
                    const block = dimension.getBlock(checkPos);
                    const isLogBlock = !!(block && isLog(block));
                    blockLogCache.set(checkKey, isLogBlock);
                    if (isLogBlock) {
                        return true;
                    }
                } catch {
                    // Chunk may be unloaded, skip
                }
            }
        }
    }
    return false;
}

/**
 * Finds all orphan leaves connected to the felled tree and schedules them for fast decay.
 * Features smart filtering:
 * 1. Species Matching: Only decays leaves that match the species/type of the cut tree (e.g. cutting an Oak
 *    tree will never decay neighboring Birch or Spruce leaves).
 * 2. Canopy Distance Gating: Enforces maximum distance from the felled logs so BFS never infects surrounding trees.
 * 3. Surviving Support Check: Leaves with living log support from nearby standing trees are preserved.
 */
export function triggerFastLeafDecay(
    dimension: Dimension,
    initialLeafKeys: Set<string>,
    felledLogKeys: Set<string>,
    logTypeId?: string
): void {
    if (!TreeCapitatorConfig.leafDecay.enabled || initialLeafKeys.size === 0) {
        return;
    }

    const { minDelayTicks, protectPlayerLeaves, searchRadius, matchTreeSpecies } =
        TreeCapitatorConfig.leafDecay;

    const maxLeafDist = searchRadius ?? 5;
    const felledLogPositions = Array.from(felledLogKeys).map(parsePos);
    const visitedLeaves = new Set<string>(initialLeafKeys);
    const queue: Vector3[] = Array.from(initialLeafKeys).map(parsePos);
    const leavesToDecay: Vector3[] = [];
    const blockLogCache = new Map<string, boolean>();

    // Breadth-first traversal of connected leaf blocks within bounding radius
    while (queue.length > 0) {
        const current = queue.shift()!;

        // Check 6 adjacent neighbors
        const neighbors: Vector3[] = [
            { x: current.x + 1, y: current.y, z: current.z },
            { x: current.x - 1, y: current.y, z: current.z },
            { x: current.x, y: current.y + 1, z: current.z },
            { x: current.x, y: current.y - 1, z: current.z },
            { x: current.x, y: current.y, z: current.z + 1 },
            { x: current.x, y: current.y, z: current.z - 1 },
        ];

        for (const neighbor of neighbors) {
            const key = posKey(neighbor);
            if (visitedLeaves.has(key)) continue;

            // Constrain search within max distance from felled trunk
            if (!isNearFelledLogs(neighbor, felledLogPositions, maxLeafDist)) {
                continue;
            }

            try {
                const block = dimension.getBlock(neighbor);
                if (block && isLeaves(block)) {
                    // Only include leaves matching the cut tree species
                    if (logTypeId && matchTreeSpecies && !isMatchingLeafForLog(block, logTypeId)) {
                        continue;
                    }

                    visitedLeaves.add(key);
                    queue.push(neighbor);
                }
            } catch {
                // Ignore unloaded chunks
            }
        }
    }

    // Filter candidate leaves against persistence, species, and log support
    for (const key of visitedLeaves) {
        const pos = parsePos(key);

        try {
            const block = dimension.getBlock(pos);
            if (!block || !isLeaves(block)) continue;

            if (protectPlayerLeaves && isPlayerPlacedLeaves(block)) {
                continue; // Preserve player-placed leaves
            }

            if (logTypeId && matchTreeSpecies && !isMatchingLeafForLog(block, logTypeId)) {
                continue;
            }

            if (!hasSurvivingLogSupport(dimension, pos, felledLogKeys, blockLogCache)) {
                leavesToDecay.push(pos);
            }
        } catch {
            // Ignore errors
        }
    }

    // Decay leaves incrementally per tick to prevent command queue backlog
    if (leavesToDecay.length === 0) return;

    // Shuffle slightly for organic decay pattern
    leavesToDecay.sort(() => Math.random() - 0.5);

    let decayIndex = 0;
    const leavesPerTick = 6;

    system.runTimeout(() => {
        const intervalId = system.runInterval(() => {
            const limit = Math.min(decayIndex + leavesPerTick, leavesToDecay.length);
            for (; decayIndex < limit; decayIndex++) {
                const pos = leavesToDecay[decayIndex];
                try {
                    const block = dimension.getBlock(pos);
                    if (block && isLeaves(block)) {
                        dimension.runCommand(
                            `setblock ${pos.x} ${pos.y} ${pos.z} air destroy`
                        );
                    }
                } catch {
                    // Block could be unloaded or already destroyed
                }
            }

            if (decayIndex >= leavesToDecay.length) {
                system.clearRun(intervalId);
            }
        }, 1);
    }, minDelayTicks);
}

