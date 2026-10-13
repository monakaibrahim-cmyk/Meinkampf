import {
    BlockPermutation,
    Dimension,
    Entity,
    EntityComponentTypes,
    EntityItemComponent,
    Player,
    PlayerBreakBlockAfterEvent,
    system,
    Vector3,
} from "@minecraft/server";
import { TreeCapitatorConfig } from "../config";
import { getWoodSpecies, isLeaves, isLog, isMatchingLeafForLog, posKey } from "../utils/blocks";
import { damageMainhandTool, isAxe } from "../utils/tools";
import { triggerFastLeafDecay } from "./leafDecay";

// Track blocks currently being broken to prevent event re-entrancy
const activeFellingPositions = new Set<string>();

/**
 * Maps wood/log block type to its matching sapling block ID.
 */
export function getSaplingForWood(logTypeId: string): string | undefined {
    if (logTypeId.includes("spruce")) return "minecraft:spruce_sapling";
    if (logTypeId.includes("birch")) return "minecraft:birch_sapling";
    if (logTypeId.includes("jungle")) return "minecraft:jungle_sapling";
    if (logTypeId.includes("acacia")) return "minecraft:acacia_sapling";
    if (logTypeId.includes("dark_oak")) return "minecraft:dark_oak_sapling";
    if (logTypeId.includes("cherry")) return "minecraft:cherry_sapling";
    if (logTypeId.includes("pale_oak")) return "minecraft:pale_oak_sapling";
    if (logTypeId.includes("mangrove")) return "minecraft:mangrove_propagule";
    if (logTypeId.includes("crimson")) return "minecraft:crimson_fungus";
    if (logTypeId.includes("warped")) return "minecraft:warped_fungus";
    if (logTypeId.includes("oak")) return "minecraft:oak_sapling";
    return undefined;
}

/**
 * Validates whether a ground block can support a growing sapling.
 */
export function isValidSaplingSoil(typeId: string): boolean {
    return (
        typeId === "minecraft:dirt" ||
        typeId === "minecraft:grass_block" ||
        typeId === "minecraft:podzol" ||
        typeId === "minecraft:coarse_dirt" ||
        typeId === "minecraft:rooted_dirt" ||
        typeId === "minecraft:moss_block" ||
        typeId === "minecraft:mud" ||
        typeId === "minecraft:muddy_mangrove_roots" ||
        typeId === "minecraft:farmland" ||
        typeId === "minecraft:crimson_nylium" ||
        typeId === "minecraft:warped_nylium" ||
        typeId === "minecraft:netherrack"
    );
}

/**
 * Finds an optimal location near the base of the cut tree where a sapling can successfully grow.
 * Ensures valid soil underneath, air at the spot, and adequate upward clearance.
 */
export function findGoodSaplingLocation(dimension: Dimension, basePos: Vector3): Vector3 | undefined {
    // Search candidate positions starting at trunk base and expanding outward
    const candidateSpots: Vector3[] = [
        basePos,
        { x: basePos.x + 1, y: basePos.y, z: basePos.z },
        { x: basePos.x - 1, y: basePos.y, z: basePos.z },
        { x: basePos.x, y: basePos.y, z: basePos.z + 1 },
        { x: basePos.x, y: basePos.y, z: basePos.z - 1 },
        { x: basePos.x + 1, y: basePos.y, z: basePos.z + 1 },
        { x: basePos.x - 1, y: basePos.y, z: basePos.z - 1 },
        { x: basePos.x + 1, y: basePos.y, z: basePos.z - 1 },
        { x: basePos.x - 1, y: basePos.y, z: basePos.z + 1 },
    ];

    for (const spot of candidateSpots) {
        // Search downward up to 3 blocks for solid ground
        for (let dy = 0; dy >= -3; dy--) {
            const plantY = spot.y + dy;
            const plantPos: Vector3 = { x: spot.x, y: plantY, z: spot.z };
            const soilPos: Vector3 = { x: spot.x, y: plantY - 1, z: spot.z };

            try {
                const plantBlock = dimension.getBlock(plantPos);
                const soilBlock = dimension.getBlock(soilPos);
                if (!plantBlock || !soilBlock) continue;

                // Planting spot must be air or decaying leaves
                if (!plantBlock.isAir && !plantBlock.typeId.includes("leaves")) continue;

                // Ground must be valid soil
                if (!isValidSaplingSoil(soilBlock.typeId)) continue;

                // Verify upward headroom (at least 4 blocks above to ensure room to grow)
                let hasHeadroom = true;
                for (let h = 1; h <= 4; h++) {
                    const checkBlock = dimension.getBlock({ x: plantPos.x, y: plantPos.y + h, z: plantPos.z });
                    if (checkBlock && !checkBlock.isAir && !checkBlock.typeId.includes("leaves")) {
                        hasHeadroom = false;
                        break;
                    }
                }

                if (hasHeadroom) {
                    return plantPos;
                }
            } catch {
                // Ignore
            }
        }
    }

    return undefined;
}

/**
 * Finds an optimal location for additional dropped saplings.
 * Enforces minimum spacing from other planted saplings to give each tree adequate room to grow,
 * and ensures valid soil underneath, air at the spot, and upward clearance.
 */
export function findGoodAdditionalSaplingLocation(
    dimension: Dimension,
    basePos: Vector3,
    existingSpots: Vector3[],
    minSpacing: number = 3,
    maxRadius: number = 8
): Vector3 | undefined {
    for (let r = minSpacing; r <= maxRadius; r++) {
        const offsets: { dx: number; dz: number }[] = [];
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const dist = Math.hypot(dx, dz);
                if (dist >= r - 0.5 && dist <= r + 0.5) {
                    offsets.push({ dx, dz });
                }
            }
        }

        offsets.sort(() => Math.random() - 0.5);

        for (const { dx, dz } of offsets) {
            const checkX = basePos.x + dx;
            const checkZ = basePos.z + dz;

            // Enforce minimum distance from all existing sapling spots
            const tooClose = existingSpots.some(
                (spot) => Math.hypot(checkX - spot.x, checkZ - spot.z) < minSpacing
            );
            if (tooClose) continue;

            // Search vertical ground level around basePos.y (+2 down to -4)
            for (let dy = 2; dy >= -4; dy--) {
                const plantY = basePos.y + dy;
                const plantPos: Vector3 = { x: checkX, y: plantY, z: checkZ };
                const soilPos: Vector3 = { x: checkX, y: plantY - 1, z: checkZ };

                try {
                    const plantBlock = dimension.getBlock(plantPos);
                    const soilBlock = dimension.getBlock(soilPos);
                    if (!plantBlock || !soilBlock) continue;

                    // Planting spot must be air or decaying leaves
                    if (!plantBlock.isAir && !plantBlock.typeId.includes("leaves")) continue;

                    // Soil beneath must support saplings
                    if (!isValidSaplingSoil(soilBlock.typeId)) continue;

                    // Upward headroom: at least 5 blocks above must be air or leaves
                    let hasHeadroom = true;
                    for (let h = 1; h <= 5; h++) {
                        const above = dimension.getBlock({ x: checkX, y: plantY + h, z: checkZ });
                        if (above && !above.isAir && !above.typeId.includes("leaves")) {
                            hasHeadroom = false;
                            break;
                        }
                    }

                    if (hasHeadroom) {
                        return plantPos;
                    }
                } catch {
                    // Ignore unloaded block errors
                }
            }
        }
    }
    return undefined;
}

/**
 * Scans around the felled tree base for dropped sapling item entities (from decaying leaves)
 * and automatically plants them in good, spaced-out spots.
 */
export function plantDroppedSaplingsNearby(
    dimension: Dimension,
    logTypeId: string,
    basePos: Vector3,
    plantedSpots: Vector3[],
    alreadyPlantedExtra: number = 0
): number {
    if (!TreeCapitatorConfig.autoPlantSapling.enabled) return alreadyPlantedExtra;
    if (!TreeCapitatorConfig.autoPlantSapling.plantDroppedSaplings) return alreadyPlantedExtra;

    const saplingId = getSaplingForWood(logTypeId);
    if (!saplingId) return alreadyPlantedExtra;

    const maxExtra = TreeCapitatorConfig.autoPlantSapling.maxExtraSaplingsToPlant ?? 4;
    const minSpacing = TreeCapitatorConfig.autoPlantSapling.minSaplingSpacing ?? 3;
    const searchRadius = TreeCapitatorConfig.autoPlantSapling.droppedSaplingSearchRadius ?? 8;

    if (alreadyPlantedExtra >= maxExtra) return alreadyPlantedExtra;

    let droppedEntities: Entity[] = [];
    try {
        droppedEntities = dimension.getEntities({
            location: basePos,
            maxDistance: searchRadius + 4,
            type: "minecraft:item",
        });
    } catch {
        return alreadyPlantedExtra;
    }

    let extraPlanted = alreadyPlantedExtra;

    for (const ent of droppedEntities) {
        if (!ent.isValid) continue;
        if (extraPlanted >= maxExtra) break;

        let itemComp: EntityItemComponent | undefined;
        try {
            itemComp = ent.getComponent(EntityComponentTypes.Item) as EntityItemComponent | undefined;
        } catch {
            continue;
        }

        const stack = itemComp?.itemStack;
        if (!stack || stack.typeId !== saplingId) continue;

        let available = stack.amount;
        let used = 0;

        while (available > 0 && extraPlanted < maxExtra) {
            const spot = findGoodAdditionalSaplingLocation(
                dimension,
                basePos,
                plantedSpots,
                minSpacing,
                searchRadius
            );
            if (!spot) break;

            try {
                const block = dimension.getBlock(spot);
                if (block && (block.isAir || block.typeId.includes("leaves"))) {
                    block.setPermutation(BlockPermutation.resolve(saplingId));
                    plantedSpots.push(spot);
                    extraPlanted++;
                    used++;
                    available--;

                    dimension.playSound("block.grass.place", spot, { volume: 0.8, pitch: 1.1 });
                    dimension.spawnParticle("minecraft:crop_growth_emitter", {
                        x: spot.x + 0.5,
                        y: spot.y + 0.5,
                        z: spot.z + 0.5,
                    });
                } else {
                    break;
                }
            } catch {
                break;
            }
        }

        if (used > 0) {
            const loc = ent.location;
            try {
                ent.remove();
            } catch {
                // Ignore
            }
            if (available > 0) {
                try {
                    const remaining = stack.clone();
                    remaining.amount = available;
                    dimension.spawnItem(remaining, loc);
                } catch {
                    // Ignore
                }
            }
        }
    }

    return extraPlanted;
}

/**
 * Plants saplings in optimal growing locations. Supports 2x2 planting for Dark Oak and mega trees,
 * and automatically plants other dropped saplings in good spots around the tree.
 */
export function autoPlantSaplings(
    dimension: Dimension,
    logTypeId: string,
    basePos: Vector3,
    is2x2Tree: boolean
): void {
    if (!TreeCapitatorConfig.autoPlantSapling.enabled) return;

    const saplingId = getSaplingForWood(logTypeId);
    if (!saplingId) return;

    const plantedSpots: Vector3[] = [];

    // Small delay (5 ticks) so trunk blocks are fully removed before planting
    system.runTimeout(() => {
        const isDarkOak = logTypeId.includes("dark_oak");
        const shouldPlant2x2 = (isDarkOak || is2x2Tree) && TreeCapitatorConfig.autoPlantSapling.plant2x2WhenApplicable;

        if (shouldPlant2x2) {
            // Find base spot
            const primarySpot = findGoodSaplingLocation(dimension, basePos);
            if (!primarySpot) return;

            // Test 4 possible 2x2 quadrants to find the one with the best valid soil & clearance
            const quadrants = [
                [{ dx: 0, dz: 0 }, { dx: 1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 1, dz: 1 }],
                [{ dx: 0, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: -1, dz: 1 }],
                [{ dx: 0, dz: 0 }, { dx: 1, dz: 0 }, { dx: 0, dz: -1 }, { dx: 1, dz: -1 }],
                [{ dx: 0, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: -1 }, { dx: -1, dz: -1 }],
            ];

            let bestQuadrant = quadrants[0];
            let maxValid = -1;

            for (const quad of quadrants) {
                let validCount = 0;
                for (const offset of quad) {
                    const plantPos: Vector3 = {
                        x: primarySpot.x + offset.dx,
                        y: primarySpot.y,
                        z: primarySpot.z + offset.dz,
                    };
                    try {
                        const block = dimension.getBlock(plantPos);
                        const soil = dimension.getBlock({ x: plantPos.x, y: plantPos.y - 1, z: plantPos.z });
                        if (block && soil && (block.isAir || block.typeId.includes("leaves")) && isValidSaplingSoil(soil.typeId)) {
                            validCount++;
                        }
                    } catch {
                        // Ignore
                    }
                }
                if (validCount > maxValid) {
                    maxValid = validCount;
                    bestQuadrant = quad;
                    if (validCount === 4) break;
                }
            }

            for (const offset of bestQuadrant) {
                const plantPos: Vector3 = {
                    x: primarySpot.x + offset.dx,
                    y: primarySpot.y,
                    z: primarySpot.z + offset.dz,
                };

                try {
                    const block = dimension.getBlock(plantPos);
                    const soil = dimension.getBlock({ x: plantPos.x, y: plantPos.y - 1, z: plantPos.z });

                    if (block && soil && (block.isAir || block.typeId.includes("leaves")) && isValidSaplingSoil(soil.typeId)) {
                        block.setPermutation(BlockPermutation.resolve(saplingId));
                        plantedSpots.push(plantPos);
                    }
                } catch {
                    // Ignore
                }
            }

            try {
                dimension.playSound("block.grass.place", primarySpot, { volume: 0.8, pitch: 1.1 });
                dimension.spawnParticle("minecraft:crop_growth_emitter", {
                    x: primarySpot.x + 0.5,
                    y: primarySpot.y + 0.5,
                    z: primarySpot.z + 0.5,
                });
            } catch {
                // Ignore
            }
        } else {
            // Single sapling planting
            const plantSpot = findGoodSaplingLocation(dimension, basePos);
            if (!plantSpot) return;

            try {
                const block = dimension.getBlock(plantSpot);
                if (block && (block.isAir || block.typeId.includes("leaves"))) {
                    block.setPermutation(BlockPermutation.resolve(saplingId));
                    plantedSpots.push(plantSpot);
                    dimension.playSound("block.grass.place", plantSpot, { volume: 0.8, pitch: 1.1 });
                    dimension.spawnParticle("minecraft:crop_growth_emitter", {
                        x: plantSpot.x + 0.5,
                        y: plantSpot.y + 0.5,
                        z: plantSpot.z + 0.5,
                    });
                }
            } catch {
                // Ignore
            }
        }
    }, 5);

    // Schedule delayed passes to find and plant saplings dropped by decaying leaves
    if (TreeCapitatorConfig.autoPlantSapling.plantDroppedSaplings) {
        let extraPlanted = 0;
        const delays = [25, 50, 75];

        for (const delay of delays) {
            system.runTimeout(() => {
                extraPlanted = plantDroppedSaplingsNearby(
                    dimension,
                    logTypeId,
                    basePos,
                    plantedSpots,
                    extraPlanted
                );
            }, delay);
        }
    }
}

/**
 * Checks whether a cluster of logs without leaves represents a naturally generated fallen tree
 * or downed log lying on the ground, distinguishing it from player-built structures (cabins, houses, walls).
 */
export function isFallenLogCluster(
    dimension: Dimension,
    logs: Vector3[],
    startPos: Vector3
): boolean {
    if (!TreeCapitatorConfig.fellFallenLogs) return false;

    const allPositions = [startPos, ...logs];
    const maxFallen = TreeCapitatorConfig.maxFallenLogs ?? 32;

    // 1. Size constraint: Natural fallen trees in Minecraft have 2 to 16 logs (at most 32).
    if (allPositions.length > maxFallen) {
        return false; // Too large, likely a player-built log structure
    }

    // 2. Shape constraint: Fallen trees lie along the ground (height variation is small).
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pos of allPositions) {
        if (pos.y < minY) minY = pos.y;
        if (pos.y > maxY) maxY = pos.y;
    }
    if (maxY - minY > 4) {
        return false; // Spans too many vertical levels to be a fallen ground trunk
    }

    // 3. Player structure check: Ensure logs are not touching artificial building blocks
    // (planks, glass, doors, furniture, stone bricks, slabs, stairs, crafting tables, etc.)
    let hasNaturalGroundBelow = false;

    for (const pos of allPositions) {
        // Check 6 direct faces for artificial player building materials
        const adjacentOffsets: Vector3[] = [
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            { x: 0, y: -1, z: 0 },
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 0, z: -1 },
        ];

        for (const off of adjacentOffsets) {
            try {
                const adjBlock = dimension.getBlock({ x: pos.x + off.x, y: pos.y + off.y, z: pos.z + off.z });
                if (!adjBlock || adjBlock.isAir) continue;

                const tId = adjBlock.typeId;
                if (
                    tId.endsWith("_planks") ||
                    tId.includes("glass") ||
                    tId.includes("door") ||
                    tId.includes("trapdoor") ||
                    tId.includes("slab") ||
                    tId.includes("stairs") ||
                    tId.includes("fence") ||
                    tId.includes("crafting_table") ||
                    tId.includes("furnace") ||
                    tId.includes("chest") ||
                    tId.includes("bed") ||
                    tId.includes("bookshelf") ||
                    tId.includes("wall") ||
                    tId.includes("concrete") ||
                    tId.includes("terracotta") ||
                    tId.includes("brick")
                ) {
                    return false; // Skip logs adjacent to building materials
                }
            } catch {
                // Ignore
            }
        }

        // Check if resting on natural ground underneath
        try {
            const blockBelow = dimension.getBlock({ x: pos.x, y: pos.y - 1, z: pos.z });
            if (blockBelow) {
                const bId = blockBelow.typeId;
                if (
                    isValidSaplingSoil(bId) ||
                    bId === "minecraft:stone" ||
                    bId === "minecraft:deepslate" ||
                    bId === "minecraft:sand" ||
                    bId === "minecraft:gravel" ||
                    bId === "minecraft:snow" ||
                    bId === "minecraft:snow_block"
                ) {
                    hasNaturalGroundBelow = true;
                }
            }
        } catch {
            // Ignore
        }
    }

    // Must be resting on natural terrain
    return hasNaturalGroundBelow;
}

/**
 * Main handler triggered whenever a player breaks a block.
 */
export function handleTreeBreak(event: PlayerBreakBlockAfterEvent): void {
    const { block, brokenBlockPermutation, dimension, player, itemStackBeforeBreak } = event;

    // 1. Verify that the broken block was a log
    if (!isLog(brokenBlockPermutation)) {
        return;
    }

    const logTypeId = brokenBlockPermutation.type.id;
    const woodFamily = getWoodSpecies(logTypeId);

    const startPos: Vector3 = {
        x: Math.floor(block.location.x),
        y: Math.floor(block.location.y),
        z: Math.floor(block.location.z),
    };
    const startKey = posKey(startPos);

    // Ignore if this position was broken by an active TreeCapitator cascade
    if (activeFellingPositions.has(startKey)) {
        activeFellingPositions.delete(startKey);
        return;
    }

    // 2. Check player conditions (axe and sneaking requirements)
    if (TreeCapitatorConfig.requireAxe && !isAxe(itemStackBeforeBreak)) {
        return;
    }

    if (TreeCapitatorConfig.sneakToActivate && !player.isSneaking) {
        return;
    }

    // 3. BFS search to find connected logs and touching leaves
    const visitedLogs = new Set<string>([startKey]);
    const queue: Vector3[] = [startPos];
    const logsToBreak: Vector3[] = [];
    const connectedLeaves = new Set<string>();

    const { maxLogs, maxHorizontalRadius } = TreeCapitatorConfig;

    while (queue.length > 0 && logsToBreak.length < maxLogs) {
        const current = queue.shift()!;

        // Check 26 adjacent neighbors
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;

                    const neighbor: Vector3 = {
                        x: current.x + dx,
                        y: current.y + dy,
                        z: current.z + dz,
                    };

                    // Allow downward search to include all connected trunk/stump logs below the cut
                    const maxDown = TreeCapitatorConfig.maxVerticalDown ?? 32;
                    if (neighbor.y < startPos.y - maxDown) continue;

                    // Limit horizontal spread from original stump
                    if (
                        Math.abs(neighbor.x - startPos.x) > maxHorizontalRadius ||
                        Math.abs(neighbor.z - startPos.z) > maxHorizontalRadius
                    ) {
                        continue;
                    }

                    const key = posKey(neighbor);
                    if (visitedLogs.has(key)) continue;

                    try {
                        const targetBlock = dimension.getBlock(neighbor);
                        if (!targetBlock) continue;

                        if (isLog(targetBlock)) {
                            // Smart wood species matching: only fell logs of the same wood family
                            if (woodFamily) {
                                const targetSpecies = getWoodSpecies(targetBlock.typeId);
                                if (targetSpecies && targetSpecies !== woodFamily) {
                                    continue; // Skip adjacent tree of a different wood species
                                }
                            }
                            visitedLogs.add(key);
                            queue.push(neighbor);
                            logsToBreak.push(neighbor);
                        } else if (isLeaves(targetBlock)) {
                            // Only collect leaves matching the cut tree species
                            if (!woodFamily || isMatchingLeafForLog(targetBlock, logTypeId)) {
                                connectedLeaves.add(key);
                            }
                        }
                    } catch {
                        // Chunk might not be loaded
                    }
                }
            }
        }
    }

    // 4. Natural Tree & Fallen Log Validation
    const hasLeaves = connectedLeaves.size > 0;
    const isFallenLog = !hasLeaves && isFallenLogCluster(dimension, logsToBreak, startPos);

    if (!hasLeaves && !isFallenLog) {
        // Abort if cluster is neither a standing tree with leaves nor a valid fallen log
        return;
    }

    // 5. Sort logs bottom-to-top for a natural felling direction
    logsToBreak.sort((a, b) => a.y - b.y);

    // Detect if this was a 2x2 trunk (e.g. mega Spruce/Jungle or Dark Oak) at the lowest stump level
    const minY = logsToBreak.length > 0 ? Math.min(startPos.y, logsToBreak[0].y) : startPos.y;
    const baseLogs = logsToBreak.filter((p) => p.y === minY || p.y === minY + 1);
    const is2x2 = baseLogs.length >= 3 || logTypeId.includes("dark_oak");

    if (logsToBreak.length === 0) {
        // Only one log existed (already broken by player)
        if (hasLeaves) {
            triggerFastLeafDecay(dimension, connectedLeaves, visitedLogs, logTypeId);
            autoPlantSaplings(dimension, logTypeId, startPos, false);
        } else if (isFallenLog && TreeCapitatorConfig.autoPlantSapling.enabled) {
            autoPlantSaplings(dimension, logTypeId, startPos, false);
        }
        return;
    }

    // Compute the true base of the tree (lowest stump block on ground)
    const lowestLog = logsToBreak[0];
    const treeBasePos: Vector3 = {
        x: lowestLog.y < startPos.y ? lowestLog.x : startPos.x,
        y: Math.min(startPos.y, lowestLog.y),
        z: lowestLog.y < startPos.y ? lowestLog.z : startPos.z,
    };

    // 6. Handle tool durability
    if (TreeCapitatorConfig.consumeDurability) {
        const toolSurvived = damageMainhandTool(player, logsToBreak.length);
        if (!toolSurvived) {
            logsToBreak.splice(Math.max(1, Math.floor(logsToBreak.length / 2)));
        }
    }

    // 7. Break remaining logs
    const { logsPerTick } = TreeCapitatorConfig;

    if (logsPerTick <= 0) {
        // Instant breaking
        for (const logPos of logsToBreak) {
            activeFellingPositions.add(posKey(logPos));
            try {
                dimension.runCommand(
                    `setblock ${logPos.x} ${logPos.y} ${logPos.z} air destroy`
                );
            } catch {
                // Ignore
            }
        }
        if (hasLeaves) {
            triggerFastLeafDecay(dimension, connectedLeaves, visitedLogs, logTypeId);
        }
        autoPlantSaplings(dimension, logTypeId, treeBasePos, is2x2);
    } else {
        // Smooth animated felling over multiple ticks
        let index = 0;
        const intervalId = system.runInterval(() => {
            const batchLimit = Math.min(index + logsPerTick, logsToBreak.length);

            for (; index < batchLimit; index++) {
                const logPos = logsToBreak[index];
                activeFellingPositions.add(posKey(logPos));
                try {
                    dimension.runCommand(
                        `setblock ${logPos.x} ${logPos.y} ${logPos.z} air destroy`
                    );
                } catch {
                    // Ignore
                }
            }

            if (index >= logsToBreak.length) {
                system.clearRun(intervalId);
                // Trigger fast leaf decay and sapling auto-planting once trunk is felled
                if (hasLeaves) {
                    triggerFastLeafDecay(dimension, connectedLeaves, visitedLogs, logTypeId);
                }
                autoPlantSaplings(dimension, logTypeId, treeBasePos, is2x2);
            }
        }, 1);
    }
}
