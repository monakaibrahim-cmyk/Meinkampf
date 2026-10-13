import {
    Block,
    BlockComponentTypes,
    BlockInventoryComponent,
    BlockPermutation,
    BlockSignComponent,
    Container,
    Dimension,
    EntityComponentTypes,
    EntityItemComponent,
    EntitySpawnAfterEvent,
    ExplosionBeforeEvent,
    ItemStack,
    Player,
    PlayerBreakBlockAfterEvent,
    PlayerInteractWithBlockAfterEvent,
    PlayerPlaceBlockAfterEvent,
    SignSide,
    system,
    Vector3,
    world,
} from "@minecraft/server";
import { FarmingConfig } from "../config";
import { posKey } from "../utils/blocks";

export interface CropDefinition {
    typeId: string;
    maxGrowth: number;
    growthStateName: "growth" | "age";
    signKeywords: string[];
    getDrops: () => { typeId: string; count: number }[];
    replantGrowth: number;
}

export const SUPPORTED_CROPS: Record<string, CropDefinition> = {
    "minecraft:wheat": {
        typeId: "minecraft:wheat",
        maxGrowth: 7,
        growthStateName: "growth",
        signKeywords: ["wheat", "seed", "seeds", "trigo"],
        getDrops: () => [
            { typeId: "minecraft:wheat", count: 1 },
            { typeId: "minecraft:wheat_seeds", count: Math.floor(Math.random() * 3) + 1 },
        ],
        replantGrowth: 0,
    },
    "minecraft:carrots": {
        typeId: "minecraft:carrots",
        maxGrowth: 7,
        growthStateName: "growth",
        signKeywords: ["carrot", "carrots", "cenoura"],
        getDrops: () => [
            { typeId: "minecraft:carrot", count: Math.floor(Math.random() * 4) + 2 },
        ],
        replantGrowth: 0,
    },
    "minecraft:potatoes": {
        typeId: "minecraft:potatoes",
        maxGrowth: 7,
        growthStateName: "growth",
        signKeywords: ["potato", "potatoes", "batata"],
        getDrops: () => {
            const drops = [{ typeId: "minecraft:potato", count: Math.floor(Math.random() * 4) + 2 }];
            if (Math.random() < 0.02) {
                drops.push({ typeId: "minecraft:poisonous_potato", count: 1 });
            }
            return drops;
        },
        replantGrowth: 0,
    },
    "minecraft:beetroot": {
        typeId: "minecraft:beetroot",
        maxGrowth: 7,
        growthStateName: "growth",
        signKeywords: ["beetroot", "beetroots", "beet", "beets", "beterraba"],
        getDrops: () => [
            { typeId: "minecraft:beetroot", count: 1 },
            { typeId: "minecraft:beetroot_seeds", count: Math.floor(Math.random() * 3) + 1 },
        ],
        replantGrowth: 0,
    },
    "minecraft:nether_wart": {
        typeId: "minecraft:nether_wart",
        maxGrowth: 3,
        growthStateName: "age",
        signKeywords: ["nether wart", "nether_wart", "wart"],
        getDrops: () => [
            { typeId: "minecraft:nether_wart", count: Math.floor(Math.random() * 3) + 2 },
        ],
        replantGrowth: 0,
    },
    "minecraft:sweet_berry_bush": {
        typeId: "minecraft:sweet_berry_bush",
        maxGrowth: 3,
        growthStateName: "growth",
        signKeywords: ["sweet berry", "sweet berries", "berry", "berries"],
        getDrops: () => [
            { typeId: "minecraft:sweet_berries", count: Math.floor(Math.random() * 2) + 2 },
        ],
        replantGrowth: 1, // Resets to stage 1 after picking berries
    },
    "minecraft:cocoa": {
        typeId: "minecraft:cocoa",
        maxGrowth: 2,
        growthStateName: "age",
        signKeywords: ["cocoa", "cocoa beans", "cocoa bean", "cacau"],
        getDrops: () => [
            { typeId: "minecraft:cocoa_beans", count: 3 },
        ],
        replantGrowth: 0,
    },
    "minecraft:torchflower_crop": {
        typeId: "minecraft:torchflower_crop",
        maxGrowth: 2,
        growthStateName: "growth",
        signKeywords: ["torchflower", "torch flower", "torchflower seed", "torchflower seeds"],
        getDrops: () => [
            { typeId: "minecraft:torchflower", count: 1 },
            { typeId: "minecraft:torchflower_seeds", count: 1 },
        ],
        replantGrowth: 0,
    },
    "minecraft:pitcher_crop": {
        typeId: "minecraft:pitcher_crop",
        maxGrowth: 4,
        growthStateName: "growth",
        signKeywords: ["pitcher", "pitcher plant", "pitcher pod", "pitcher pods"],
        getDrops: () => [
            { typeId: "minecraft:pitcher_plant", count: 1 },
            { typeId: "minecraft:pitcher_pod", count: 1 },
        ],
        replantGrowth: 0,
    },
};

// Stalk crops that grow vertically upwards
export interface StalkCropDefinition {
    typeId: string;
    maxHeight: number;
    harvestHeight: number;
    signKeywords: string[];
    dropItemId: string;
}

export const STALK_CROPS: Record<string, StalkCropDefinition> = {
    "minecraft:sugar_cane": {
        typeId: "minecraft:sugar_cane",
        maxHeight: 3,
        harvestHeight: 2,
        signKeywords: ["sugar cane", "sugarcane", "cane", "sugar", "cana"],
        dropItemId: "minecraft:sugar_cane",
    },
    "minecraft:cactus": {
        typeId: "minecraft:cactus",
        maxHeight: 3,
        harvestHeight: 2,
        signKeywords: ["cactus", "cacti", "cacto"],
        dropItemId: "minecraft:cactus",
    },
    "minecraft:bamboo": {
        typeId: "minecraft:bamboo",
        maxHeight: 12,
        harvestHeight: 3,
        signKeywords: ["bamboo", "bambu"],
        dropItemId: "minecraft:bamboo",
    },
    "minecraft:kelp": {
        typeId: "minecraft:kelp",
        maxHeight: 16,
        harvestHeight: 3,
        signKeywords: ["kelp", "dried kelp", "alga"],
        dropItemId: "minecraft:kelp",
    },
};

// Items recognized as seeds for compost routing
export const SEED_ITEMS = new Set([
    "minecraft:wheat_seeds",
    "minecraft:beetroot_seeds",
    "minecraft:melon_seeds",
    "minecraft:pumpkin_seeds",
    "minecraft:torchflower_seeds",
    "minecraft:pitcher_pod",
    "minecraft:poisonous_potato",
]);

// Keywords for chests labeled for specific seeds / compost setups
export const SEED_KEYWORDS: Record<string, string[]> = {
    "minecraft:wheat_seeds": ["wheat seeds", "wheat seed", "seeds", "seed", "compost", "composter"],
    "minecraft:beetroot_seeds": ["beetroot seeds", "beetroot seed", "seeds", "seed", "compost", "composter"],
    "minecraft:melon_seeds": ["melon seeds", "melon seed", "seeds", "seed", "compost", "composter"],
    "minecraft:pumpkin_seeds": ["pumpkin seeds", "pumpkin seed", "seeds", "seed", "compost", "composter"],
    "minecraft:torchflower_seeds": ["torchflower seeds", "torchflower seed", "seeds", "seed", "compost", "composter"],
    "minecraft:pitcher_pod": ["pitcher pod", "pitcher pods", "seeds", "seed", "compost", "composter"],
    "minecraft:poisonous_potato": ["poisonous potato", "poison potato", "compost", "composter"],
};

// Fruit blocks associated with stems
export const STEM_CROPS = {
    melon: {
        stemTypeId: "minecraft:melon_stem",
        fruitTypeId: "minecraft:melon_block",
        signKeywords: ["melon", "melons", "melancia"],
        getDrops: () => [
            { typeId: "minecraft:melon_slice", count: Math.floor(Math.random() * 5) + 3 },
            { typeId: "minecraft:melon_seeds", count: Math.floor(Math.random() * 2) },
        ],
    },
    pumpkin: {
        stemTypeId: "minecraft:pumpkin_stem",
        fruitTypeId: "minecraft:pumpkin",
        signKeywords: ["pumpkin", "pumpkins", "abobora", "abóbora"],
        getDrops: () => [
            { typeId: "minecraft:pumpkin", count: 1 },
        ],
    },
};

/**
 * Returns total ticks required for a crop to grow from planting to full maturity.
 * Standard crops: default 24,000 ticks (1 Minecraft day) with 1.25x rate = 19,200 ticks (16 minutes).
 * Sweet Berry Bush and Glow Berries: exempt from default, using rapid 100 ticks (5 seconds).
 */
export function getCropFullGrowthTicks(cropTypeId?: string): number {
    const isBerry =
        cropTypeId === "minecraft:sweet_berry_bush" ||
        cropTypeId === "minecraft:cave_vines" ||
        cropTypeId === "minecraft:cave_vines_body_with_berries" ||
        cropTypeId === "minecraft:cave_vines_head_with_berries";

    if (isBerry && FarmingConfig.growth.berriesFastGrowth) {
        return FarmingConfig.growth.berriesFullGrowthTicks ?? 100;
    }

    const base = FarmingConfig.growth.defaultFullGrowthTicks ?? 24000;
    const mult = FarmingConfig.growth.growthRateMultiplier ?? 1.25;
    return Math.round(base / mult);
}

/**
 * Calculates ticks required per growth step based on crop type and max growth stages.
 */
export function calculateTicksPerGrowthStep(maxGrowth: number = 7, cropTypeId?: string): number {
    const totalDayTicks = getCropFullGrowthTicks(cropTypeId);
    const steps = Math.max(1, maxGrowth);
    return Math.max(1, Math.round(totalDayTicks / steps));
}

export interface TrackedFarmland {
    x: number;
    y: number;
    z: number;
    dimensionId: string;
    plotType?: "farmland" | "sugar_cane" | "cactus" | "bamboo" | "kelp" | "cocoa" | "cave_vines";
    cropTypeId?: string;
    cropGrowthStateName?: "growth" | "age";
    cropGrowth?: number;
    elapsedTicks?: number;
    ticksPerGrowthStep?: number;
}

// In-memory registry of active farmlands and farm crops with their planted crop states
const trackedFarmlands = new Map<string, TrackedFarmland>();

/**
 * Registers a farmland position for protection, hydration, and growth tracking.
 */
export function registerFarmland(
    dimensionId: string,
    pos: Vector3,
    cropTypeId?: string,
    growthStateName?: "growth" | "age",
    growth?: number
): void {
    const key = `${dimensionId}:${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    const existing = trackedFarmlands.get(key);

    const cropDef = cropTypeId ? SUPPORTED_CROPS[cropTypeId] : undefined;
    const maxGrowth = cropDef?.maxGrowth ?? 7;

    trackedFarmlands.set(key, {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z),
        dimensionId,
        plotType: cropTypeId === "minecraft:cocoa" ? "cocoa" : (existing?.plotType ?? "farmland"),
        cropTypeId: cropTypeId ?? existing?.cropTypeId,
        cropGrowthStateName: growthStateName ?? existing?.cropGrowthStateName,
        cropGrowth: growth ?? existing?.cropGrowth,
        elapsedTicks: existing?.elapsedTicks ?? 0,
        ticksPerGrowthStep: calculateTicksPerGrowthStep(maxGrowth, cropTypeId),
    });
}

/**
 * Registers a stalk crop (Sugar Cane, Cactus, Bamboo, Kelp) base position.
 */
export function registerStalkCrop(
    dimensionId: string,
    pos: Vector3,
    cropTypeId: string
): void {
    const key = `${dimensionId}:${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    const existing = trackedFarmlands.get(key);
    if (existing && existing.cropTypeId === cropTypeId) return;

    const stalkDef = STALK_CROPS[cropTypeId];
    const steps = stalkDef ? stalkDef.maxHeight - 1 : 2;

    trackedFarmlands.set(key, {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z),
        dimensionId,
        plotType: cropTypeId.replace("minecraft:", "") as any,
        cropTypeId,
        elapsedTicks: existing?.elapsedTicks ?? 0,
        ticksPerGrowthStep: calculateTicksPerGrowthStep(steps, cropTypeId),
    });
}

/**
 * Registers a Cave Vines (Glow Berries) position for growth tracking.
 */
export function registerCaveVines(
    dimensionId: string,
    pos: Vector3,
    cropTypeId: string = "minecraft:cave_vines"
): void {
    const key = `${dimensionId}:${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    const existing = trackedFarmlands.get(key);
    if (existing && existing.cropTypeId === cropTypeId) return;

    trackedFarmlands.set(key, {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z),
        dimensionId,
        plotType: "cave_vines",
        cropTypeId,
        elapsedTicks: existing?.elapsedTicks ?? 0,
        ticksPerGrowthStep: calculateTicksPerGrowthStep(2, cropTypeId),
    });
}

/**
 * Removes a farmland position from protection (e.g. when broken by player).
 */
export function unregisterFarmland(dimensionId: string, pos: Vector3): void {
    const key = `${dimensionId}:${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    trackedFarmlands.delete(key);
}

/**
 * Strips Minecraft formatting codes (color, bold, etc.) from text.
 */
function cleanText(text?: string): string {
    if (!text) return "";
    return text.replace(/§[0-9a-fk-or]/gi, "").trim().toLowerCase();
}

export interface KnownChestRecord {
    pos: Vector3;
    dimensionId: string;
    keywords: string[];
    hasComposter: boolean;
    setupScore: number;
}

// In-memory registry of known containers and chests
export const knownChests = new Map<string, KnownChestRecord>();

interface CropChestCacheEntry {
    chestKey: string | null;
    expiresTick: number;
}

// High-speed crop-to-chest association cache (avoids searching blocks repeatedly)
export const cropChestCache = new Map<string, CropChestCacheEntry>();

/**
 * Calculates a score for whether a chest is placed above a composter and hopper setup:
 * Score 3: Directly above a hopper and composter combo (e.g. Chest -> Hopper -> Composter or Chest -> Composter -> Hopper)
 * Score 2: Directly above a hopper or composter (1-2 blocks below)
 * Score 0: Normal chest
 */
export function getComposterSetupScore(dimension: Dimension, chestPos: Vector3): number {
    try {
        const below1 = dimension.getBlock({ x: chestPos.x, y: chestPos.y - 1, z: chestPos.z });
        const below2 = dimension.getBlock({ x: chestPos.x, y: chestPos.y - 2, z: chestPos.z });
        const below3 = dimension.getBlock({ x: chestPos.x, y: chestPos.y - 3, z: chestPos.z });
        const b1Id = below1?.typeId;
        const b2Id = below2?.typeId;
        const b3Id = below3?.typeId;

        const hasComposter = b1Id === "minecraft:composter" || b2Id === "minecraft:composter" || b3Id === "minecraft:composter";
        const hasHopper = b1Id === "minecraft:hopper" || b2Id === "minecraft:hopper";

        let hopperTouchesComposter = false;
        if (hasHopper) {
            const checkYs: number[] = [];
            if (b1Id === "minecraft:hopper") checkYs.push(chestPos.y - 1);
            if (b2Id === "minecraft:hopper") checkYs.push(chestPos.y - 2);

            const offsets = [
                { x: 1, z: 0 },
                { x: -1, z: 0 },
                { x: 0, z: 1 },
                { x: 0, z: -1 },
            ];
            for (const hY of checkYs) {
                for (const off of offsets) {
                    const adj = dimension.getBlock({ x: chestPos.x + off.x, y: hY, z: chestPos.z + off.z });
                    if (adj && adj.typeId === "minecraft:composter") {
                        hopperTouchesComposter = true;
                        break;
                    }
                }
                if (hopperTouchesComposter) break;
            }
        }

        if ((hasComposter && hasHopper) || hopperTouchesComposter) {
            return 3;
        }
        if (hasComposter || hasHopper) {
            return 2;
        }
    } catch {
        // Ignore unloaded chunk
    }
    return 0;
}

/**
 * Checks if a chest block is situated directly above a hopper or composter.
 */
export function isChestAboveComposterOrHopper(dimension: Dimension, chestPos: Vector3): boolean {
    return getComposterSetupScore(dimension, chestPos) > 0;
}

/**
 * Scans adjacent blocks of a chest for attached signs and registers it into knownChests.
 */
export function registerChest(dimension: Dimension, chestPos: Vector3): KnownChestRecord | undefined {
    try {
        const block = dimension.getBlock(chestPos);
        if (!block) return undefined;

        if (
            block.typeId !== "minecraft:chest" &&
            block.typeId !== "minecraft:trapped_chest" &&
            block.typeId !== "minecraft:barrel"
        ) {
            return undefined;
        }

        const offsets: Vector3[] = [
            { x: 0, y: 1, z: 0 },  // Standing sign on top
            { x: 0, y: -1, z: 0 }, // Hanging sign below
            { x: 1, y: 0, z: 0 },  // Wall sign east
            { x: -1, y: 0, z: 0 }, // Wall sign west
            { x: 0, y: 0, z: 1 },  // Wall sign south
            { x: 0, y: 0, z: -1 }, // Wall sign north
            { x: 1, y: 1, z: 0 },
            { x: -1, y: 1, z: 0 },
            { x: 0, y: 1, z: 1 },
            { x: 0, y: 1, z: -1 },
        ];

        const keywords: string[] = [];

        for (const offset of offsets) {
            const checkPos: Vector3 = {
                x: chestPos.x + offset.x,
                y: chestPos.y + offset.y,
                z: chestPos.z + offset.z,
            };

            const sBlock = dimension.getBlock(checkPos);
            if (!sBlock) continue;

            const signComp = sBlock.getComponent(BlockComponentTypes.Sign) as BlockSignComponent | undefined;
            if (!signComp) continue;

            const frontText = cleanText(signComp.getText(SignSide.Front));
            const backText = cleanText(signComp.getText(SignSide.Back));
            if (frontText) keywords.push(frontText);
            if (backText) keywords.push(backText);
        }

        const score = getComposterSetupScore(dimension, chestPos);
        const record: KnownChestRecord = {
            pos: { x: Math.floor(chestPos.x), y: Math.floor(chestPos.y), z: Math.floor(chestPos.z) },
            dimensionId: dimension.id,
            keywords,
            hasComposter: score > 0,
            setupScore: score,
        };

        const key = `${dimension.id}:${record.pos.x},${record.pos.y},${record.pos.z}`;
        knownChests.set(key, record);
        return record;
    } catch {
        return undefined;
    }
}

/**
 * Searches within radius for a chest to collect harvested crops.
 * Priority:
 * 1. Chest with an attached sign explicitly matching the crop name.
 * 2. Any general chest / barrel within radius (preferring standard storage over composter setups).
 * 3. Fallback: Any available chest within radius.
 */
function findMatchingChest(
    dimension: Dimension,
    centerPos: Vector3,
    keywords: string[],
    radius: number
): { chestBlock: Block; container: Container } | undefined {
    const cropKey = `${dimension.id}:${Math.floor(centerPos.x)},${Math.floor(centerPos.y)},${Math.floor(centerPos.z)}:${keywords[0] ?? ""}`;
    const cached = cropChestCache.get(cropKey);
    const now = system.currentTick;

    // Cache lookup
    if (cached && now < cached.expiresTick) {
        if (cached.chestKey === null) {
            return undefined; // Cached negative lookup
        }
        const record = knownChests.get(cached.chestKey);
        if (record && record.dimensionId === dimension.id) {
            try {
                const block = dimension.getBlock(record.pos);
                if (block && (block.typeId === "minecraft:chest" || block.typeId === "minecraft:trapped_chest" || block.typeId === "minecraft:barrel")) {
                    const inv = block.getComponent(BlockComponentTypes.Inventory) as BlockInventoryComponent | undefined;
                    if (inv && inv.container) {
                        return { chestBlock: block, container: inv.container };
                    }
                }
            } catch {
                // Ignore
            }
        }
    }

    const radiusSq = radius * radius;

    interface Candidate {
        key: string;
        pos: Vector3;
        rank: number; // 1 = sign match, 2 = normal chest (no composter), 3 = composter chest fallback
        distSq: number;
    }

    let bestCandidate: Candidate | undefined;

    function evaluateChestRecord(key: string, record: KnownChestRecord): void {
        if (record.dimensionId !== dimension.id) return;
        const dx = record.pos.x - centerPos.x;
        const dy = record.pos.y - centerPos.y;
        const dz = record.pos.z - centerPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > radiusSq) return;

        const hasSignMatch = keywords.some((k) =>
            record.keywords.some((ck) => ck.includes(k.toLowerCase()))
        );

        let rank: number;
        if (hasSignMatch) {
            rank = 1;
        } else {
            if (record.setupScore === 0) {
                const dynamicScore = getComposterSetupScore(dimension, record.pos);
                if (dynamicScore > 0) {
                    record.setupScore = dynamicScore;
                    record.hasComposter = true;
                }
            }
            rank = record.setupScore === 0 ? 2 : 3;
        }

        if (!bestCandidate) {
            bestCandidate = { key, pos: record.pos, rank, distSq };
        } else if (rank < bestCandidate.rank) {
            bestCandidate = { key, pos: record.pos, rank, distSq };
        } else if (rank === bestCandidate.rank && distSq < bestCandidate.distSq) {
            bestCandidate = { key, pos: record.pos, rank, distSq };
        }
    }

    // 1. Check known chests first
    for (const [key, record] of knownChests.entries()) {
        evaluateChestRecord(key, record);
    }

    // 2. Local search around centerPos if knownChests didn't have a Rank 1 match
    if (!bestCandidate || bestCandidate.rank > 1) {
        const minX = Math.floor(centerPos.x) - radius;
        const maxX = Math.floor(centerPos.x) + radius;
        const minY = Math.max(-64, Math.floor(centerPos.y) - 2);
        const maxY = Math.min(320, Math.floor(centerPos.y) + 3);
        const minZ = Math.floor(centerPos.z) - radius;
        const maxZ = Math.floor(centerPos.z) + radius;

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const distSq = (x - centerPos.x) ** 2 + (y - centerPos.y) ** 2 + (z - centerPos.z) ** 2;
                    if (distSq > radiusSq) continue;

                    const key = `${dimension.id}:${x},${y},${z}`;
                    if (knownChests.has(key)) continue;

                    const pos: Vector3 = { x, y, z };
                    try {
                        const block = dimension.getBlock(pos);
                        if (!block) continue;

                        if (
                            block.typeId === "minecraft:chest" ||
                            block.typeId === "minecraft:trapped_chest" ||
                            block.typeId === "minecraft:barrel"
                        ) {
                            const record = registerChest(dimension, pos);
                            if (record) {
                                evaluateChestRecord(key, record);
                                if (bestCandidate && bestCandidate.rank === 1 && bestCandidate.distSq <= 1) {
                                    break;
                                }
                            }
                        }
                    } catch {
                        // Ignore unloaded block errors
                    }
                }
            }
        }
    }

    if (bestCandidate) {
        try {
            const block = dimension.getBlock(bestCandidate.pos);
            if (block && (block.typeId === "minecraft:chest" || block.typeId === "minecraft:trapped_chest" || block.typeId === "minecraft:barrel")) {
                const inv = block.getComponent(BlockComponentTypes.Inventory) as BlockInventoryComponent | undefined;
                if (inv && inv.container) {
                    cropChestCache.set(cropKey, { chestKey: bestCandidate.key, expiresTick: now + 300 });
                    return { chestBlock: block, container: inv.container };
                }
            }
        } catch {
            // Ignore
        }
    }

    // Negative cache: remember for 200 ticks (10s) that no chest exists near this crop
    cropChestCache.set(cropKey, { chestKey: null, expiresTick: now + 200 });
    return undefined;
}

/**
 * Searches within radius for a chest dedicated to seeds and compostable items.
 * Priority:
 * 1. Chest placed above a hopper and composter assembly.
 * 2. Chest with an attached sign matching seed keywords.
 */
export function findSeedChest(
    dimension: Dimension,
    centerPos: Vector3,
    seedKeywords: string[],
    radius: number
): { chestBlock: Block; container: Container } | undefined {
    const radiusSq = radius * radius;

    interface SeedCandidate {
        key: string;
        pos: Vector3;
        score: number;
        distSq: number;
    }

    let bestCandidate: SeedCandidate | undefined;

    function evaluateSeedRecord(key: string, record: KnownChestRecord): void {
        if (record.dimensionId !== dimension.id) return;
        const dx = record.pos.x - centerPos.x;
        const dy = record.pos.y - centerPos.y;
        const dz = record.pos.z - centerPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > radiusSq) return;

        let setupScore = record.setupScore;
        if (setupScore === 0) {
            setupScore = getComposterSetupScore(dimension, record.pos);
            if (setupScore > 0) {
                record.setupScore = setupScore;
                record.hasComposter = true;
            }
        }

        const matchesSign = seedKeywords.some((k) =>
            record.keywords.some((ck) => ck.includes(k.toLowerCase()))
        );

        let finalScore = 0;
        if (setupScore >= 2) {
            // Composter setup
            finalScore = setupScore;
        } else if (matchesSign) {
            // Matching sign on chest
            finalScore = 1;
        }

        if (finalScore > 0) {
            if (!bestCandidate) {
                bestCandidate = { key, pos: record.pos, score: finalScore, distSq };
            } else if (finalScore > bestCandidate.score) {
                bestCandidate = { key, pos: record.pos, score: finalScore, distSq };
            } else if (finalScore === bestCandidate.score && distSq < bestCandidate.distSq) {
                bestCandidate = { key, pos: record.pos, score: finalScore, distSq };
            }
        }
    }

    // 1. Check known chests in memory first
    for (const [key, record] of knownChests.entries()) {
        evaluateSeedRecord(key, record);
    }

    // 2. Scan local blocks in radius if no score-3 combo found
    if (!bestCandidate || bestCandidate.score < 3) {
        const minX = Math.floor(centerPos.x) - radius;
        const maxX = Math.floor(centerPos.x) + radius;
        const minY = Math.max(-64, Math.floor(centerPos.y) - 2);
        const maxY = Math.min(320, Math.floor(centerPos.y) + 3);
        const minZ = Math.floor(centerPos.z) - radius;
        const maxZ = Math.floor(centerPos.z) + radius;

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const distSq = (x - centerPos.x) ** 2 + (y - centerPos.y) ** 2 + (z - centerPos.z) ** 2;
                    if (distSq > radiusSq) continue;

                    const key = `${dimension.id}:${x},${y},${z}`;
                    if (knownChests.has(key)) continue;

                    const pos: Vector3 = { x, y, z };
                    try {
                        const block = dimension.getBlock(pos);
                        if (!block) continue;

                        if (
                            block.typeId === "minecraft:chest" ||
                            block.typeId === "minecraft:trapped_chest" ||
                            block.typeId === "minecraft:barrel"
                        ) {
                            const record = registerChest(dimension, pos);
                            if (record) {
                                evaluateSeedRecord(key, record);
                                if (bestCandidate && bestCandidate.score === 3 && bestCandidate.distSq <= 1) {
                                    break;
                                }
                            }
                        }
                    } catch {
                        // Ignore
                    }
                }
            }
        }
    }

    if (bestCandidate) {
        try {
            const block = dimension.getBlock(bestCandidate.pos);
            if (block && (block.typeId === "minecraft:chest" || block.typeId === "minecraft:trapped_chest" || block.typeId === "minecraft:barrel")) {
                const inv = block.getComponent(BlockComponentTypes.Inventory) as BlockInventoryComponent | undefined;
                if (inv && inv.container) {
                    return { chestBlock: block, container: inv.container };
                }
            }
        } catch {
            // Ignore
        }
    }

    return undefined;
}

/**
 * Checks whether a crop at cropPos is automated by a nearby matching labeled chest.
 */
export function isCropAutomated(
    dimension: Dimension,
    cropPos: Vector3,
    keywords: string[]
): boolean {
    if (!FarmingConfig.autoHarvest.enabled) return false;
    const target = findMatchingChest(
        dimension,
        cropPos,
        keywords,
        FarmingConfig.autoHarvest.chestSearchRadius
    );
    return target !== undefined;
}

/**
 * Spawns a visual stage indicator directly above a crop block.
 */
export function spawnPunctuationIndicator(
    dimension: Dimension,
    blockPos: Vector3,
    particleType: string = "qol:crop_indicator_green"
): void {
    const cx = blockPos.x + 0.5;
    const cz = blockPos.z + 0.5;
    const baseY = blockPos.y;

    try {
        if (particleType.startsWith("qol:")) {
            dimension.spawnParticle(particleType, { x: cx, y: baseY + 1.45, z: cz });
        } else {
            dimension.spawnParticle(particleType, { x: cx, y: baseY + 1.70, z: cz });
            dimension.spawnParticle(particleType, { x: cx, y: baseY + 1.58, z: cz });
            dimension.spawnParticle(particleType, { x: cx, y: baseY + 1.46, z: cz });
            dimension.spawnParticle(particleType, { x: cx, y: baseY + 1.25, z: cz });
        }
    } catch {
        // Silently skip if chunk is unloaded or particles disabled
    }
}

/**
 * Maps a growth ratio (0.0 to 1.0) to the corresponding particle type:
 * - Green: Mature (ratio >= 1.0)
 * - Yellow: Mid stage (0.4 <= ratio < 1.0)
 * - Red: Early stage (ratio < 0.4)
 */
export function getGrowthParticle(growthRatio: number): string {
    const reminderCfg = FarmingConfig.harvestReminder;
    if (growthRatio >= 1.0) {
        return reminderCfg?.greenParticle ?? "qol:crop_indicator_green";
    }
    if (growthRatio >= 0.4) {
        return reminderCfg?.yellowParticle ?? "qol:crop_indicator_yellow";
    }
    return reminderCfg?.redParticle ?? "qol:crop_indicator_red";
}

/**
 * Displays growth stage reminder particles above unautomated crops:
 * - Red: Early stage (0-40% growth)
 * - Yellow: Mid stage (40-99% growth)
 * - Green: Ready for harvest (100% growth)
 */
export function processHarvestReminders(players: Player[]): void {
    if (!FarmingConfig.harvestReminder?.enabled) return;

    const maxDist = FarmingConfig.harvestReminder.maxPlayerDistance ?? 24;
    const maxDistSq = maxDist * maxDist;

    for (const data of trackedFarmlands.values()) {
        const isSelfPos = data.plotType === "cocoa" || data.plotType === "sugar_cane" || data.plotType === "cactus" || data.plotType === "bamboo" || data.plotType === "kelp";
        const cropPos: Vector3 = isSelfPos
            ? { x: data.x, y: data.y, z: data.z }
            : { x: data.x, y: data.y + 1, z: data.z };

        // Check if any player in the same dimension is close enough to see the indicator
        let isNearby = false;
        let dim: Dimension | undefined;

        for (const player of players) {
            if (!player || !player.isValid) continue;
            if (player.dimension.id !== data.dimensionId) continue;
            const distSq =
                (player.location.x - cropPos.x) ** 2 +
                (player.location.y - cropPos.y) ** 2 +
                (player.location.z - cropPos.z) ** 2;
            if (distSq <= maxDistSq) {
                isNearby = true;
                dim = player.dimension;
                break;
            }
        }

        if (!isNearby || !dim) continue;

        try {
            // 1. Cocoa beans on jungle log
            if (data.plotType === "cocoa" || data.cropTypeId === "minecraft:cocoa") {
                const cocoaBlock = dim.getBlock(cropPos);
                if (cocoaBlock && cocoaBlock.typeId === "minecraft:cocoa") {
                    const cocoaDef = SUPPORTED_CROPS["minecraft:cocoa"];
                    if (!isCropAutomated(dim, cropPos, cocoaDef.signKeywords)) {
                        const currentAge = cocoaBlock.permutation.getState("age") as number ?? 0;
                        const ratio = currentAge / 2;
                        spawnPunctuationIndicator(dim, cropPos, getGrowthParticle(ratio));
                    }
                }
                continue;
            }

            // 2. Stalk crops (Sugar Cane, Cactus, Bamboo, Kelp)
            if (
                data.plotType === "sugar_cane" ||
                data.plotType === "cactus" ||
                data.plotType === "bamboo" ||
                data.plotType === "kelp"
            ) {
                const stalkDef = STALK_CROPS[data.cropTypeId ?? "minecraft:sugar_cane"];
                if (stalkDef) {
                    const basePos: Vector3 = { x: data.x, y: data.y, z: data.z };
                    if (!isCropAutomated(dim, basePos, stalkDef.signKeywords)) {
                        let height = 0;
                        while (height < stalkDef.maxHeight) {
                            const b = dim.getBlock({ x: data.x, y: data.y + height, z: data.z });
                            if (b && (b.typeId === stalkDef.typeId || (stalkDef.typeId === "minecraft:kelp" && b.typeId === "minecraft:kelp_plant"))) {
                                height++;
                            } else {
                                break;
                            }
                        }
                        if (height > 0) {
                            const ratio = height >= stalkDef.maxHeight ? 1.0 : (height >= stalkDef.harvestHeight ? 0.66 : 0.33);
                            const topPos: Vector3 = { x: data.x, y: data.y + height - 1, z: data.z };
                            spawnPunctuationIndicator(dim, topPos, getGrowthParticle(ratio));
                        }
                    }
                }
                continue;
            }

            const cropBlock = dim.getBlock(cropPos);
            if (!cropBlock) continue;

            // 3. Standard crops (Wheat, Carrots, Potatoes, Beetroot, Nether Wart, Sweet Berries, Pitcher, Torchflower)
            const cropDef = SUPPORTED_CROPS[cropBlock.typeId];
            if (cropDef) {
                if (!isCropAutomated(dim, cropPos, cropDef.signKeywords)) {
                    const currentGrowth = cropBlock.permutation.getState(cropDef.growthStateName) as number ?? 0;
                    const ratio = cropDef.maxGrowth > 0 ? currentGrowth / cropDef.maxGrowth : 1.0;
                    spawnPunctuationIndicator(dim, cropPos, getGrowthParticle(ratio));
                }
                continue;
            }

            // 4. Melon and Pumpkin fruit blocks or stems
            const isMelonStem = cropBlock.typeId === STEM_CROPS.melon.stemTypeId;
            const isPumpkinStem = cropBlock.typeId === STEM_CROPS.pumpkin.stemTypeId;

            if (isMelonStem || isPumpkinStem) {
                const stemData = isMelonStem ? STEM_CROPS.melon : STEM_CROPS.pumpkin;
                if (!isCropAutomated(dim, cropPos, stemData.signKeywords)) {
                    // Check if mature fruit already exists adjacent to stem
                    const directions: Vector3[] = [
                        { x: 1, y: 0, z: 0 },
                        { x: -1, y: 0, z: 0 },
                        { x: 0, y: 0, z: 1 },
                        { x: 0, y: 0, z: -1 },
                    ];

                    let foundFruit = false;
                    for (const dir of directions) {
                        const fruitPos: Vector3 = {
                            x: cropPos.x + dir.x,
                            y: cropPos.y + dir.y,
                            z: cropPos.z + dir.z,
                        };
                        const fruitBlock = dim.getBlock(fruitPos);
                        if (fruitBlock && fruitBlock.typeId === stemData.fruitTypeId) {
                            spawnPunctuationIndicator(dim, fruitPos, getGrowthParticle(1.0));
                            foundFruit = true;
                            break;
                        }
                    }

                    if (!foundFruit) {
                        const currentGrowth = cropBlock.permutation.getState("growth") as number ?? 0;
                        const ratio = Math.min(0.85, currentGrowth / 7);
                        spawnPunctuationIndicator(dim, cropPos, getGrowthParticle(ratio));
                    }
                }
            }
        } catch {
            // Unloaded block
        }
    }
}

/**
 * Checks whether a block is part of a protected farm (farmland, crop, stem, fruit, or farm chest/sign).
 * Used to shield farmland and crops from Creeper and other mob explosions.
 */
export function isFarmProtected(block: Block): boolean {
    const typeId = block.typeId;

    // 1. Farmland
    if (typeId === "minecraft:farmland") return true;

    // 2. Standard crops, stalk crops & cave vines
    if (
        SUPPORTED_CROPS[typeId] ||
        STALK_CROPS[typeId] ||
        typeId === "minecraft:cave_vines" ||
        typeId === "minecraft:cave_vines_head_with_berries" ||
        typeId === "minecraft:cave_vines_body_with_berries"
    ) {
        return true;
    }

    // 3. Stems and fruits
    if (
        typeId === STEM_CROPS.melon.stemTypeId ||
        typeId === STEM_CROPS.pumpkin.stemTypeId ||
        typeId === STEM_CROPS.melon.fruitTypeId ||
        typeId === STEM_CROPS.pumpkin.fruitTypeId
    ) {
        return true;
    }

    // 4. Farm storage chests, hoppers, composters and signs
    if (
        typeId === "minecraft:chest" ||
        typeId === "minecraft:trapped_chest" ||
        typeId === "minecraft:barrel" ||
        typeId === "minecraft:hopper" ||
        typeId === "minecraft:composter" ||
        typeId.includes("sign")
    ) {
        return true;
    }

    // 5. Any block on or directly above a tracked farmland
    const dimId = block.dimension.id;
    const groundKey = `${dimId}:${Math.floor(block.location.x)},${Math.floor(block.location.y - 1)},${Math.floor(block.location.z)}`;
    const selfKey = `${dimId}:${Math.floor(block.location.x)},${Math.floor(block.location.y)},${Math.floor(block.location.z)}`;
    if (trackedFarmlands.has(groundKey) || trackedFarmlands.has(selfKey)) {
        return true;
    }

    return false;
}

/**
 * Restores farmland and replants crops when trampled or dehydrated.
 */
function restoreFarmlandAndCrop(dimension: Dimension, data: TrackedFarmland): void {
    const farmlandPos: Vector3 = { x: data.x, y: data.y, z: data.z };
    const cropPos: Vector3 = { x: data.x, y: data.y + 1, z: data.z };

    try {
        const farmlandBlock = dimension.getBlock(farmlandPos);
        if (farmlandBlock) {
            // Revert trampled dirt/grass or unhydrated farmland back to fully moisturized farmland
            if (
                farmlandBlock.typeId === "minecraft:dirt" ||
                farmlandBlock.typeId === "minecraft:grass_block" ||
                (farmlandBlock.typeId === "minecraft:farmland" &&
                    (farmlandBlock.permutation.getState("moisturized_amount") as number ?? 0) < 7)
            ) {
                farmlandBlock.setPermutation(
                    BlockPermutation.resolve("minecraft:farmland", { moisturized_amount: 7 })
                );
            }
        }

        // Check if crop was popped off by trample
        if (data.cropTypeId && data.cropGrowthStateName) {
            const cropBlock = dimension.getBlock(cropPos);
            if (cropBlock && cropBlock.isAir) {
                // Replant crop at previous growth stage
                cropBlock.setPermutation(
                    BlockPermutation.resolve(data.cropTypeId, {
                        [data.cropGrowthStateName]: data.cropGrowth ?? 0,
                    })
                );

                // Delete any floating item drop that vanilla spawned when the crop popped off
                try {
                    const droppedItems = dimension.getEntities({
                        location: { x: cropPos.x + 0.5, y: cropPos.y + 0.5, z: cropPos.z + 0.5 },
                        maxDistance: 1.5,
                        type: "minecraft:item",
                    });
                    for (const itemEntity of droppedItems) {
                        itemEntity.kill();
                    }
                } catch {
                    // Ignore
                }
            }
        }
    } catch {
        // Unloaded chunk
    }
}

/**
 * Continuous check around online players' feet to guarantee that jumping on
 * crops or farmland will NEVER destroy either the crop or the soil.
 * Runs on an optimized interval and checks only the ground blocks beneath player feet.
 */
function processTickProtection(players: Player[]): void {
    if (!FarmingConfig.farmland.antiTrample && !FarmingConfig.farmland.autoHydrate) {
        return;
    }

    for (const player of players) {
        if (!player || !player.isValid) continue;
        const pX = Math.floor(player.location.x);
        const pY = Math.floor(player.location.y);
        const pZ = Math.floor(player.location.z);
        const dimension = player.dimension;

        // Check feet level and 1 block directly beneath player feet
        for (const dy of [-1, 0]) {
            const checkPos: Vector3 = { x: pX, y: pY + dy, z: pZ };
            const key = `${dimension.id}:${checkPos.x},${checkPos.y},${checkPos.z}`;
            const tracked = trackedFarmlands.get(key);

            if (tracked) {
                // Restore farmland and crop if trampled
                restoreFarmlandAndCrop(dimension, tracked);

                // Keep active track of any growing crop on this plot
                try {
                    const cropBlock = dimension.getBlock({ x: checkPos.x, y: checkPos.y + 1, z: checkPos.z });
                    if (cropBlock && !cropBlock.isAir) {
                        const cropDef = SUPPORTED_CROPS[cropBlock.typeId];
                        if (cropDef) {
                            tracked.cropTypeId = cropBlock.typeId;
                            tracked.cropGrowthStateName = cropDef.growthStateName;
                            tracked.cropGrowth = cropBlock.permutation.getState(cropDef.growthStateName) as number ?? 0;
                        } else if (
                            cropBlock.typeId === STEM_CROPS.melon.stemTypeId ||
                            cropBlock.typeId === STEM_CROPS.pumpkin.stemTypeId
                        ) {
                            tracked.cropTypeId = cropBlock.typeId;
                            tracked.cropGrowthStateName = "growth";
                            tracked.cropGrowth = cropBlock.permutation.getState("growth") as number ?? 0;
                        }
                    }
                } catch {
                    // Ignore
                }
            } else {
                // Auto-register unrecorded farmland walked over by player
                try {
                    const block = dimension.getBlock(checkPos);
                    if (block && block.typeId === "minecraft:farmland") {
                        registerFarmland(dimension.id, checkPos);
                        const moisture = block.permutation.getState("moisturized_amount") as number ?? 0;
                        if (moisture < 7) {
                            block.setPermutation(block.permutation.withState("moisturized_amount", 7));
                        }
                    }
                } catch {
                    // Ignore
                }
            }
        }
    }
}

/**
 * Scans a compact ground volume around a center point for farmland, crops, and chests.
 */
function scanFarmlandsInArea(dimension: Dimension, center: Vector3, radius: number, yDown = 2, yUp = 2): void {
    const pX = Math.floor(center.x);
    const pY = Math.floor(center.y);
    const pZ = Math.floor(center.z);

    for (let x = pX - radius; x <= pX + radius; x++) {
        for (let z = pZ - radius; z <= pZ + radius; z++) {
            for (let y = pY - yDown; y <= pY + yUp; y++) {
                const pos: Vector3 = { x, y, z };
                try {
                    const block = dimension.getBlock(pos);
                    if (!block) continue;

                    // Automatically index chests into knownChests
                    if (
                        block.typeId === "minecraft:chest" ||
                        block.typeId === "minecraft:trapped_chest" ||
                        block.typeId === "minecraft:barrel"
                    ) {
                        registerChest(dimension, pos);
                        continue;
                    }

                    if (block.typeId === "minecraft:farmland") {
                        // Check crop above
                        const cropBlock = dimension.getBlock({ x, y: y + 1, z });
                        let cropTypeId: string | undefined;
                        let growthName: "growth" | "age" | undefined;
                        let growthVal: number | undefined;

                        if (cropBlock && !cropBlock.isAir) {
                            const cropDef = SUPPORTED_CROPS[cropBlock.typeId];
                            if (cropDef) {
                                cropTypeId = cropBlock.typeId;
                                growthName = cropDef.growthStateName;
                                growthVal = cropBlock.permutation.getState(growthName) as number ?? 0;
                            } else if (
                                cropBlock.typeId === STEM_CROPS.melon.stemTypeId ||
                                cropBlock.typeId === STEM_CROPS.pumpkin.stemTypeId
                            ) {
                                cropTypeId = cropBlock.typeId;
                                growthName = "growth";
                                growthVal = cropBlock.permutation.getState("growth") as number ?? 0;
                            }
                        }

                        registerFarmland(dimension.id, pos, cropTypeId, growthName, growthVal);

                        const moisture = block.permutation.getState("moisturized_amount") as number ?? 0;
                        if (moisture < 7) {
                            block.setPermutation(block.permutation.withState("moisturized_amount", 7));
                        }
                    } else if (block.typeId === "minecraft:sugar_cane") {
                        const below = dimension.getBlock({ x, y: y - 1, z });
                        if (!below || below.typeId !== "minecraft:sugar_cane") {
                            registerStalkCrop(dimension.id, { x, y, z }, "minecraft:sugar_cane");
                        }
                    } else if (block.typeId === "minecraft:cactus") {
                        const below = dimension.getBlock({ x, y: y - 1, z });
                        if (!below || below.typeId !== "minecraft:cactus") {
                            registerStalkCrop(dimension.id, { x, y, z }, "minecraft:cactus");
                        }
                    } else if (block.typeId === "minecraft:bamboo") {
                        const below = dimension.getBlock({ x, y: y - 1, z });
                        if (!below || below.typeId !== "minecraft:bamboo") {
                            registerStalkCrop(dimension.id, { x, y, z }, "minecraft:bamboo");
                        }
                    } else if (block.typeId === "minecraft:kelp" || block.typeId === "minecraft:kelp_plant") {
                        const below = dimension.getBlock({ x, y: y - 1, z });
                        if (!below || (below.typeId !== "minecraft:kelp" && below.typeId !== "minecraft:kelp_plant")) {
                            registerStalkCrop(dimension.id, { x, y, z }, "minecraft:kelp");
                        }
                    } else if (block.typeId === "minecraft:cocoa") {
                        registerFarmland(dimension.id, pos, "minecraft:cocoa", "age", block.permutation.getState("age") as number ?? 0);
                    } else if (block.typeId === "minecraft:sweet_berry_bush") {
                        const groundPos: Vector3 = { x, y: y - 1, z };
                        const growthVal = block.permutation.getState("growth") as number ?? 0;
                        registerFarmland(dimension.id, groundPos, "minecraft:sweet_berry_bush", "growth", growthVal);
                    } else if (
                        block.typeId === "minecraft:cave_vines" ||
                        block.typeId === "minecraft:cave_vines_head_with_berries" ||
                        block.typeId === "minecraft:cave_vines_body_with_berries"
                    ) {
                        registerCaveVines(dimension.id, pos, block.typeId);
                    }
                } catch {
                    // Chunk not loaded
                }
            }
        }
    }
}

// Tracks player locations to only trigger farmland discovery when a player moves to a new location
const playerLastScanPos = new Map<string, { x: number; y: number; z: number }>();

/**
 * Discovers existing farmlands in loaded chunks around online players.
 * Only scans when a player actually moves into a new area to eliminate AFK/idle server lag.
 */
function discoverFarmlandsAroundPlayers(players: Player[]): void {
    const radius = Math.min(8, FarmingConfig.farmland.discoveryRadius ?? 8);

    for (const player of players) {
        if (!player || !player.isValid) continue;
        const last = playerLastScanPos.get(player.id);
        const loc = player.location;
        if (last) {
            const dx = loc.x - last.x;
            const dy = loc.y - last.y;
            const dz = loc.z - last.z;
            // Player moved less than 10 blocks: skip scan completely
            if (dx * dx + dy * dy + dz * dz < 100) {
                continue;
            }
        }
        playerLastScanPos.set(player.id, { x: loc.x, y: loc.y, z: loc.z });
        scanFarmlandsInArea(player.dimension, player.location, radius, 2, 2);
    }
}

/**
 * Accelerates crop growth on tracked farmland blocks so that growth from planting
 * to full maturity takes exactly 1 Minecraft in-game day (24,000 ticks = 20 real minutes).
 * Also handles upward growth for Stalk Crops (Sugar Cane, Cactus, Bamboo, Kelp) and Cocoa Beans.
 * Supports cross-dimension and distant simulation: elapsed ticks accumulate safely even when chunks
 * are unloaded, catching up immediately when chunks load.
 */
function processFastGrowth(dimension: Dimension): void {
    if (!FarmingConfig.growth.fastGrowth) return;

    const { showGrowthParticles } = FarmingConfig.growth;
    const checkInterval = FarmingConfig.growth.growthCheckIntervalTicks ?? 100;

    for (const data of trackedFarmlands.values()) {
        if (data.dimensionId !== dimension.id) continue;

        // Skip crops that are already fully mature to avoid redundant block lookups
        const knownDef = data.cropTypeId ? SUPPORTED_CROPS[data.cropTypeId] : undefined;
        if (knownDef && data.cropGrowth !== undefined && data.cropGrowth >= knownDef.maxGrowth) {
            continue;
        }

        // 1. Advance elapsed ticks and enforce step rate gate
        data.elapsedTicks = (data.elapsedTicks ?? 0) + checkInterval;
        const targetStepTicks = data.ticksPerGrowthStep ?? calculateTicksPerGrowthStep(knownDef?.maxGrowth ?? 7, data.cropTypeId);

        if (data.elapsedTicks < targetStepTicks) {
            continue; // Not yet time to advance this crop stage
        }

        try {
            // 2. Stalk Crops (Sugar Cane, Cactus, Bamboo, Kelp) - grow vertically upwards
            if (
                data.plotType === "sugar_cane" ||
                data.plotType === "cactus" ||
                data.plotType === "bamboo" ||
                data.plotType === "kelp"
            ) {
                const stalkDef = STALK_CROPS[data.cropTypeId ?? "minecraft:sugar_cane"];
                if (stalkDef) {
                    let currentHeight = 0;
                    while (currentHeight < stalkDef.maxHeight) {
                        const b = dimension.getBlock({ x: data.x, y: data.y + currentHeight, z: data.z });
                        if (b && (b.typeId === stalkDef.typeId || (stalkDef.typeId === "minecraft:kelp" && b.typeId === "minecraft:kelp_plant"))) {
                            currentHeight++;
                        } else {
                            break;
                        }
                    }

                    if (currentHeight < stalkDef.maxHeight) {
                        const nextPos: Vector3 = { x: data.x, y: data.y + currentHeight, z: data.z };
                        const nextBlock = dimension.getBlock(nextPos);
                        const canGrow =
                            nextBlock &&
                            (nextBlock.isAir || (stalkDef.typeId === "minecraft:kelp" && nextBlock.typeId === "minecraft:water"));

                        if (canGrow) {
                            nextBlock.setPermutation(BlockPermutation.resolve(stalkDef.typeId));
                            data.elapsedTicks = Math.max(0, data.elapsedTicks - targetStepTicks);
                            if (showGrowthParticles) {
                                try {
                                    dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                        x: nextPos.x + 0.5,
                                        y: nextPos.y + 0.5,
                                        z: nextPos.z + 0.5,
                                    });
                                } catch {
                                    // Ignore particle failure
                                }
                            }
                        }
                    } else {
                        data.elapsedTicks = Math.min(data.elapsedTicks, targetStepTicks * 3);
                    }
                }
                continue;
            }

            // 3. Cocoa Beans on jungle logs
            if (data.plotType === "cocoa" || data.cropTypeId === "minecraft:cocoa") {
                const cocoaBlock = dimension.getBlock({ x: data.x, y: data.y, z: data.z });
                if (cocoaBlock && cocoaBlock.typeId === "minecraft:cocoa") {
                    const currentAge = cocoaBlock.permutation.getState("age") as number ?? 0;
                    if (currentAge < 2) {
                        const stepsToAdvance = Math.min(2 - currentAge, Math.max(1, Math.floor(data.elapsedTicks / targetStepTicks)));
                        const nextAge = currentAge + stepsToAdvance;
                        cocoaBlock.setPermutation(cocoaBlock.permutation.withState("age", nextAge));
                        data.cropGrowth = nextAge;
                        data.elapsedTicks = Math.max(0, data.elapsedTicks - stepsToAdvance * targetStepTicks);

                        if (showGrowthParticles) {
                            try {
                                dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                    x: data.x + 0.5,
                                    y: data.y + 0.5,
                                    z: data.z + 0.5,
                                });
                            } catch {
                                // Ignore
                            }
                        }
                    } else {
                        data.elapsedTicks = Math.min(data.elapsedTicks, targetStepTicks * 3);
                    }
                }
                continue;
            }

            // 4. Standard crops on farmland (Wheat, Carrots, Potatoes, Beetroot, Nether Wart, Sweet Berries, Pitcher, Torchflower)
            const cropPos: Vector3 = { x: data.x, y: data.y + 1, z: data.z };
            const cropBlock = dimension.getBlock(cropPos);
            if (!cropBlock) continue;

            const cropDef = SUPPORTED_CROPS[cropBlock.typeId];
            if (cropDef) {
                const currentGrowth = cropBlock.permutation.getState(cropDef.growthStateName) as number ?? 0;
                if (currentGrowth < cropDef.maxGrowth) {
                    const stepsToAdvance = Math.min(
                        cropDef.maxGrowth - currentGrowth,
                        Math.max(1, Math.floor(data.elapsedTicks / targetStepTicks))
                    );
                    const nextGrowth = currentGrowth + stepsToAdvance;
                    cropBlock.setPermutation(cropBlock.permutation.withState(cropDef.growthStateName, nextGrowth));

                    data.cropTypeId = cropBlock.typeId;
                    data.cropGrowthStateName = cropDef.growthStateName;
                    data.cropGrowth = nextGrowth;
                    data.elapsedTicks = Math.max(0, data.elapsedTicks - stepsToAdvance * targetStepTicks);

                    if (showGrowthParticles) {
                        try {
                            dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                x: cropPos.x + 0.5,
                                y: cropPos.y + 0.3,
                                z: cropPos.z + 0.5,
                            });
                        } catch {
                            // Ignore particle failure
                        }
                    }
                } else {
                    data.elapsedTicks = Math.min(data.elapsedTicks, getCropFullGrowthTicks(data.cropTypeId) * 10);
                }
                continue;
            }

            // 5. Check melon and pumpkin stems
            if (
                cropBlock.typeId === STEM_CROPS.melon.stemTypeId ||
                cropBlock.typeId === STEM_CROPS.pumpkin.stemTypeId
            ) {
                const currentGrowth = cropBlock.permutation.getState("growth") as number ?? 0;
                if (currentGrowth < 7) {
                    const stepsToAdvance = Math.min(7 - currentGrowth, Math.max(1, Math.floor(data.elapsedTicks / targetStepTicks)));
                    const nextGrowth = currentGrowth + stepsToAdvance;
                    cropBlock.setPermutation(cropBlock.permutation.withState("growth", nextGrowth));
                    data.cropTypeId = cropBlock.typeId;
                    data.cropGrowthStateName = "growth";
                    data.cropGrowth = nextGrowth;
                    data.elapsedTicks = Math.max(0, data.elapsedTicks - stepsToAdvance * targetStepTicks);
                } else {
                    // Fully grown stem: attempt to spawn fruit block on an adjacent valid ground
                    const isMelon = cropBlock.typeId === STEM_CROPS.melon.stemTypeId;
                    const fruitTypeId = isMelon ? STEM_CROPS.melon.fruitTypeId : STEM_CROPS.pumpkin.fruitTypeId;

                    const directions: Vector3[] = [
                        { x: 1, y: 0, z: 0 },
                        { x: -1, y: 0, z: 0 },
                        { x: 0, y: 0, z: 1 },
                        { x: 0, y: 0, z: -1 },
                    ];

                    let fruitAlreadyGrown = false;
                    for (const dir of directions) {
                        const checkFruit = dimension.getBlock({
                            x: cropPos.x + dir.x,
                            y: cropPos.y + dir.y,
                            z: cropPos.z + dir.z,
                        });
                        if (checkFruit && checkFruit.typeId === fruitTypeId) {
                            fruitAlreadyGrown = true;
                            break;
                        }
                    }

                    if (!fruitAlreadyGrown) {
                        const randomDir = directions[Math.floor(Math.random() * directions.length)];
                        const targetFruitPos: Vector3 = {
                            x: cropPos.x + randomDir.x,
                            y: cropPos.y + randomDir.y,
                            z: cropPos.z + randomDir.z,
                        };
                        const targetBlock = dimension.getBlock(targetFruitPos);
                        const groundBlock = dimension.getBlock({
                            x: targetFruitPos.x,
                            y: targetFruitPos.y - 1,
                            z: targetFruitPos.z,
                        });

                        if (
                            targetBlock &&
                            targetBlock.isAir &&
                            groundBlock &&
                            (groundBlock.typeId === "minecraft:farmland" ||
                                groundBlock.typeId === "minecraft:dirt" ||
                                groundBlock.typeId === "minecraft:grass_block")
                        ) {
                            targetBlock.setPermutation(BlockPermutation.resolve(fruitTypeId));
                            data.elapsedTicks = Math.max(0, data.elapsedTicks - targetStepTicks);
                        }
                    }
                }
            }

            // 6. Cave Vines (Glow Berries)
            if (
                data.plotType === "cave_vines" ||
                data.cropTypeId === "minecraft:cave_vines" ||
                data.cropTypeId === "minecraft:cave_vines_head_with_berries" ||
                data.cropTypeId === "minecraft:cave_vines_body_with_berries"
            ) {
                const vinePos: Vector3 = { x: data.x, y: data.y, z: data.z };
                const vineBlock = dimension.getBlock(vinePos);
                if (vineBlock) {
                    if (vineBlock.typeId === "minecraft:cave_vines") {
                        // Produce glow berries on vine head
                        vineBlock.setPermutation(BlockPermutation.resolve("minecraft:cave_vines_head_with_berries"));
                        data.cropTypeId = "minecraft:cave_vines_head_with_berries";
                        data.elapsedTicks = Math.max(0, data.elapsedTicks - targetStepTicks);
                        if (showGrowthParticles) {
                            try {
                                dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                    x: vinePos.x + 0.5,
                                    y: vinePos.y + 0.5,
                                    z: vinePos.z + 0.5,
                                });
                            } catch {
                                // Ignore
                            }
                        }
                    } else if (
                        vineBlock.typeId === "minecraft:cave_vines_head_with_berries" ||
                        vineBlock.typeId === "minecraft:cave_vines_body_with_berries"
                    ) {
                        // Attempt downward growth if space exists below
                        const belowPos: Vector3 = { x: data.x, y: data.y - 1, z: data.z };
                        const belowBlock = dimension.getBlock(belowPos);
                        if (belowBlock && belowBlock.isAir) {
                            vineBlock.setPermutation(BlockPermutation.resolve("minecraft:cave_vines_body_with_berries"));
                            belowBlock.setPermutation(BlockPermutation.resolve("minecraft:cave_vines"));
                            registerCaveVines(dimension.id, belowPos, "minecraft:cave_vines");
                            data.elapsedTicks = Math.max(0, data.elapsedTicks - targetStepTicks);
                            if (showGrowthParticles) {
                                try {
                                    dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                        x: belowPos.x + 0.5,
                                        y: belowPos.y + 0.5,
                                        z: belowPos.z + 0.5,
                                    });
                                } catch {
                                    // Ignore
                                }
                            }
                        } else {
                            data.elapsedTicks = Math.min(data.elapsedTicks, targetStepTicks * 3);
                        }
                    }
                }
                continue;
            }
        } catch {
            // Chunk unloaded; growth progress is preserved
        }
    }
}

/**
 * Handles automatic harvesting and depositing items into nearby chests.
 * Stalk crops retain their base block to allow continuous regrowth.
 */
function processAutoHarvest(dimension: Dimension): void {
    if (!FarmingConfig.autoHarvest.enabled) return;

    const { chestSearchRadius, autoReplant, routeSeedsToCompostChest } = FarmingConfig.autoHarvest;

    for (const data of trackedFarmlands.values()) {
        if (data.dimensionId !== dimension.id) continue;
        const fullCycleTicks = getCropFullGrowthTicks(data.cropTypeId);

        try {
            // 1. Stalk crops (Sugar Cane, Cactus, Bamboo, Kelp)
            if (
                data.plotType === "sugar_cane" ||
                data.plotType === "cactus" ||
                data.plotType === "bamboo" ||
                data.plotType === "kelp"
            ) {
                const stalkDef = STALK_CROPS[data.cropTypeId ?? "minecraft:sugar_cane"];
                if (stalkDef) {
                    let currentHeight = 0;
                    while (currentHeight < stalkDef.maxHeight) {
                        const b = dimension.getBlock({ x: data.x, y: data.y + currentHeight, z: data.z });
                        if (b && (b.typeId === stalkDef.typeId || (stalkDef.typeId === "minecraft:kelp" && b.typeId === "minecraft:kelp_plant"))) {
                            currentHeight++;
                        } else {
                            break;
                        }
                    }

                    if (currentHeight >= stalkDef.harvestHeight) {
                        const basePos: Vector3 = { x: data.x, y: data.y, z: data.z };
                        const chestTarget = findMatchingChest(dimension, basePos, stalkDef.signKeywords, chestSearchRadius);

                        if (chestTarget) {
                            const harvestCount = currentHeight - 1;
                            if (harvestCount > 0) {
                                chestTarget.container.addItem(new ItemStack(stalkDef.dropItemId, harvestCount));

                                // Break only upper blocks, keep base block at y intact
                                for (let h = 1; h < currentHeight; h++) {
                                    const upperBlock = dimension.getBlock({ x: data.x, y: data.y + h, z: data.z });
                                    if (upperBlock) {
                                        if (stalkDef.typeId === "minecraft:kelp") {
                                            upperBlock.setPermutation(BlockPermutation.resolve("minecraft:water"));
                                        } else {
                                            upperBlock.setPermutation(BlockPermutation.resolve("minecraft:air"));
                                        }
                                    }
                                }

                                data.elapsedTicks = 0;

                                try {
                                    dimension.playSound("block.sweet_berry_bush.pick", basePos, { volume: 0.7, pitch: 1.2 });
                                } catch {
                                    // Ignore
                                }
                            }
                        }
                    }
                }
                continue;
            }

            // 2. Cocoa Beans on jungle logs
            if (data.plotType === "cocoa" || data.cropTypeId === "minecraft:cocoa") {
                const cocoaPos: Vector3 = { x: data.x, y: data.y, z: data.z };
                const cocoaBlock = dimension.getBlock(cocoaPos);
                if (cocoaBlock && cocoaBlock.typeId === "minecraft:cocoa") {
                    const currentAge = cocoaBlock.permutation.getState("age") as number ?? 0;
                    if (currentAge >= 2) {
                        const cocoaKeywords = ["cocoa", "cocoa beans", "cocoa bean", "cacau"];
                        const chestTarget = findMatchingChest(dimension, cocoaPos, cocoaKeywords, chestSearchRadius);

                        if (chestTarget) {
                            let targetContainer = chestTarget.container;
                            if (routeSeedsToCompostChest) {
                                const seedChest = findSeedChest(dimension, cocoaPos, ["cocoa beans", "cocoa bean", "seeds", "seed", "compost"], chestSearchRadius);
                                if (seedChest) {
                                    targetContainer = seedChest.container;
                                }
                            }

                            const missedCycles = Math.min(10, Math.floor((data.elapsedTicks ?? 0) / fullCycleTicks));
                            const totalMultiplier = 1 + missedCycles;

                            targetContainer.addItem(new ItemStack("minecraft:cocoa_beans", 3 * totalMultiplier));

                            if (autoReplant) {
                                cocoaBlock.setPermutation(cocoaBlock.permutation.withState("age", 0));
                                data.cropGrowth = 0;
                                data.elapsedTicks = (data.elapsedTicks ?? 0) % fullCycleTicks;
                            } else {
                                cocoaBlock.setPermutation(BlockPermutation.resolve("minecraft:air"));
                                data.cropTypeId = undefined;
                            }

                            try {
                                dimension.playSound("block.sweet_berry_bush.pick", cocoaPos, { volume: 0.7, pitch: 1.2 });
                            } catch {
                                // Ignore
                            }
                        }
                    }
                }
                continue;
            }

            // 3. Standard crops on farmland (Wheat, Carrots, Potatoes, Beetroot, Nether Wart, Sweet Berries, Torchflower, Pitcher)
            const knownDef = data.cropTypeId ? SUPPORTED_CROPS[data.cropTypeId] : undefined;
            if (knownDef && data.cropGrowth !== undefined && data.cropGrowth < knownDef.maxGrowth) {
                continue; // Crop is not yet mature
            }

            const cropPos: Vector3 = { x: data.x, y: data.y + 1, z: data.z };
            const cropBlock = dimension.getBlock(cropPos);
            if (!cropBlock) continue;

            const cropDef = SUPPORTED_CROPS[cropBlock.typeId];
            if (cropDef) {
                const currentGrowth = cropBlock.permutation.getState(cropDef.growthStateName) as number ?? 0;
                if (currentGrowth >= cropDef.maxGrowth) {
                    const chestTarget = findMatchingChest(dimension, cropPos, cropDef.signKeywords, chestSearchRadius);

                    if (chestTarget) {
                        const drops = cropDef.getDrops();
                        const missedCycles = Math.min(10, Math.floor((data.elapsedTicks ?? 0) / fullCycleTicks));
                        const totalMultiplier = 1 + missedCycles;

                        // Deposit items, routing seeds to compost/hopper seed chest if available
                        for (const drop of drops) {
                            const isSeed = SEED_ITEMS.has(drop.typeId) || drop.typeId.includes("seed") || drop.typeId.includes("pod");
                            let targetContainer = chestTarget.container;

                            if (isSeed && routeSeedsToCompostChest) {
                                const keywords = SEED_KEYWORDS[drop.typeId] ?? [
                                    drop.typeId.replace("minecraft:", "").replace(/_/g, " "),
                                    "seeds",
                                    "seed",
                                    "compost",
                                    "composter",
                                ];
                                const seedChest = findSeedChest(dimension, cropPos, keywords, chestSearchRadius);
                                if (seedChest) {
                                    targetContainer = seedChest.container;
                                }
                            }

                            const remainder = targetContainer.addItem(new ItemStack(drop.typeId, drop.count * totalMultiplier));
                            // Fallback to main chest if seed chest was full
                            if (remainder && remainder.amount > 0 && targetContainer !== chestTarget.container) {
                                chestTarget.container.addItem(remainder);
                            }
                        }

                        // Replant crop
                        if (autoReplant) {
                            cropBlock.setPermutation(
                                cropBlock.permutation.withState(cropDef.growthStateName, cropDef.replantGrowth)
                            );
                            data.cropGrowth = cropDef.replantGrowth;
                            data.elapsedTicks = (data.elapsedTicks ?? 0) % fullCycleTicks;
                        } else {
                            cropBlock.setPermutation(BlockPermutation.resolve("minecraft:air"));
                            data.cropTypeId = undefined;
                        }

                        try {
                            dimension.playSound("block.sweet_berry_bush.pick", cropPos, { volume: 0.7, pitch: 1.2 });
                        } catch {
                            // Ignore sound error
                        }
                    }
                }
                continue;
            }

            // 4. Melon and Pumpkin fruits attached to stems
            const isMelonStem = cropBlock.typeId === STEM_CROPS.melon.stemTypeId;
            const isPumpkinStem = cropBlock.typeId === STEM_CROPS.pumpkin.stemTypeId;

            if (isMelonStem || isPumpkinStem) {
                const stemData = isMelonStem ? STEM_CROPS.melon : STEM_CROPS.pumpkin;

                const directions: Vector3[] = [
                    { x: 1, y: 0, z: 0 },
                    { x: -1, y: 0, z: 0 },
                    { x: 0, y: 0, z: 1 },
                    { x: 0, y: 0, z: -1 },
                ];

                for (const dir of directions) {
                    const fruitPos: Vector3 = {
                        x: cropPos.x + dir.x,
                        y: cropPos.y + dir.y,
                        z: cropPos.z + dir.z,
                    };

                    const fruitBlock = dimension.getBlock(fruitPos);
                    if (fruitBlock && fruitBlock.typeId === stemData.fruitTypeId) {
                        const chestTarget = findMatchingChest(dimension, fruitPos, stemData.signKeywords, chestSearchRadius);

                        if (chestTarget) {
                            const drops = stemData.getDrops();
                            for (const drop of drops) {
                                const isSeed = SEED_ITEMS.has(drop.typeId) || drop.typeId.includes("seed");
                                let targetContainer = chestTarget.container;

                                if (isSeed && routeSeedsToCompostChest) {
                                    const keywords = SEED_KEYWORDS[drop.typeId] ?? [
                                        drop.typeId.replace("minecraft:", "").replace(/_/g, " "),
                                        "seeds",
                                        "seed",
                                        "compost",
                                        "composter",
                                    ];
                                    const seedChest = findSeedChest(dimension, fruitPos, keywords, chestSearchRadius);
                                    if (seedChest) {
                                        targetContainer = seedChest.container;
                                    }
                                }

                                const remainder = targetContainer.addItem(new ItemStack(drop.typeId, drop.count));
                                if (remainder && remainder.amount > 0 && targetContainer !== chestTarget.container) {
                                    chestTarget.container.addItem(remainder);
                                }
                            }

                            // Harvest fruit block
                            fruitBlock.setPermutation(BlockPermutation.resolve("minecraft:air"));

                            try {
                                dimension.playSound("block.sweet_berry_bush.pick", fruitPos, { volume: 0.7, pitch: 1.2 });
                            } catch {
                                // Ignore
                            }
                        }
                    }
                }
            }

            // 5. Cave Vines (Glow Berries)
            if (
                data.plotType === "cave_vines" ||
                data.cropTypeId === "minecraft:cave_vines" ||
                data.cropTypeId === "minecraft:cave_vines_head_with_berries" ||
                data.cropTypeId === "minecraft:cave_vines_body_with_berries"
            ) {
                const vineBlock = dimension.getBlock({ x: data.x, y: data.y, z: data.z });
                if (
                    vineBlock &&
                    (vineBlock.typeId === "minecraft:cave_vines_head_with_berries" ||
                        vineBlock.typeId === "minecraft:cave_vines_body_with_berries")
                ) {
                    const chestTarget = findMatchingChest(
                        dimension,
                        { x: data.x, y: data.y, z: data.z },
                        ["glow berry", "glow berries", "berry", "berries", "cave vine"],
                        chestSearchRadius
                    );
                    if (chestTarget) {
                        chestTarget.container.addItem(new ItemStack("minecraft:glow_berries", 1));
                        vineBlock.setPermutation(BlockPermutation.resolve("minecraft:cave_vines"));
                        data.cropTypeId = "minecraft:cave_vines";
                        data.elapsedTicks = 0;
                        try {
                            dimension.playSound("block.sweet_berry_bush.pick", { x: data.x, y: data.y, z: data.z }, { volume: 0.7, pitch: 1.2 });
                        } catch {
                            // Ignore
                        }
                    }
                }
                continue;
            }
        } catch {
            // Unloaded chunk
        }
    }
}

/**
 * Initializes the farming QoL system with all recurring loops and event handlers.
 */
export function initFarmingFeature(): void {
    // 1. Player Interact Block Listener:
    //    a) Right-Click Harvest on mature crops (harvests drops and replants in 1 action)
    //    b) Hoe Interaction: immediately hydrates and registers tilled soil
    world.afterEvents.playerInteractWithBlock.subscribe((event: PlayerInteractWithBlockAfterEvent) => {
        const { block, itemStack } = event;

        // a) Right-click Harvest on mature crops
        if (FarmingConfig.autoHarvest.rightClickHarvest && block) {
            // Check Cave Vines with Glow Berries
            if (
                block.typeId === "minecraft:cave_vines_head_with_berries" ||
                block.typeId === "minecraft:cave_vines_body_with_berries"
            ) {
                try {
                    block.setPermutation(BlockPermutation.resolve("minecraft:cave_vines"));
                    block.dimension.spawnItem(
                        new ItemStack("minecraft:glow_berries", 1),
                        {
                            x: block.location.x + 0.5,
                            y: block.location.y + 0.2,
                            z: block.location.z + 0.5,
                        }
                    );
                    block.dimension.playSound("block.sweet_berry_bush.pick", block.location, { volume: 0.8, pitch: 1.1 });
                    block.dimension.spawnParticle("minecraft:crop_growth_emitter", {
                        x: block.location.x + 0.5,
                        y: block.location.y + 0.3,
                        z: block.location.z + 0.5,
                    });
                    const selfKey = `${block.dimension.id}:${Math.floor(block.location.x)},${Math.floor(block.location.y)},${Math.floor(block.location.z)}`;
                    const tracked = trackedFarmlands.get(selfKey);
                    if (tracked) {
                        tracked.cropTypeId = "minecraft:cave_vines";
                        tracked.elapsedTicks = 0;
                    }
                    return;
                } catch {
                    // Ignore
                }
            }

            // Check Cocoa beans
            if (block.typeId === "minecraft:cocoa") {
                try {
                    const currentAge = block.permutation.getState("age") as number ?? 0;
                    if (currentAge >= 2) {
                        block.setPermutation(block.permutation.withState("age", 0));
                        const selfKey = `${block.dimension.id}:${Math.floor(block.location.x)},${Math.floor(block.location.y)},${Math.floor(block.location.z)}`;
                        const tracked = trackedFarmlands.get(selfKey);
                        if (tracked) {
                            tracked.cropGrowth = 0;
                            tracked.elapsedTicks = 0;
                        } else {
                            registerFarmland(block.dimension.id, block.location, "minecraft:cocoa", "age", 0);
                        }

                        block.dimension.spawnItem(
                            new ItemStack("minecraft:cocoa_beans", 3),
                            {
                                x: block.location.x + 0.5,
                                y: block.location.y + 0.2,
                                z: block.location.z + 0.5,
                            }
                        );

                        try {
                            block.dimension.playSound("block.sweet_berry_bush.pick", block.location, { volume: 0.8, pitch: 1.1 });
                            block.dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                x: block.location.x + 0.5,
                                y: block.location.y + 0.3,
                                z: block.location.z + 0.5,
                            });
                        } catch {
                            // Ignore
                        }
                        return;
                    }
                } catch {
                    // Ignore
                }
            }

            // Check Stalk Crops (Sugar Cane, Cactus, Bamboo, Kelp)
            const stalkDef = STALK_CROPS[block.typeId];
            if (stalkDef) {
                try {
                    let bY = Math.floor(block.location.y);
                    while (bY > -64) {
                        const below = block.dimension.getBlock({ x: Math.floor(block.location.x), y: bY - 1, z: Math.floor(block.location.z) });
                        if (below && (below.typeId === stalkDef.typeId || (stalkDef.typeId === "minecraft:kelp" && below.typeId === "minecraft:kelp_plant"))) {
                            bY--;
                        } else {
                            break;
                        }
                    }

                    let currentHeight = 0;
                    while (currentHeight < stalkDef.maxHeight) {
                        const b = block.dimension.getBlock({ x: Math.floor(block.location.x), y: bY + currentHeight, z: Math.floor(block.location.z) });
                        if (b && (b.typeId === stalkDef.typeId || (stalkDef.typeId === "minecraft:kelp" && b.typeId === "minecraft:kelp_plant"))) {
                            currentHeight++;
                        } else {
                            break;
                        }
                    }

                    if (currentHeight >= stalkDef.harvestHeight) {
                        const harvestCount = currentHeight - 1; // Preserve base stalk block
                        if (harvestCount > 0) {
                            for (let h = 1; h < currentHeight; h++) {
                                const upperBlock = block.dimension.getBlock({ x: Math.floor(block.location.x), y: bY + h, z: Math.floor(block.location.z) });
                                if (upperBlock) {
                                    if (stalkDef.typeId === "minecraft:kelp") {
                                        upperBlock.setPermutation(BlockPermutation.resolve("minecraft:water"));
                                    } else {
                                        upperBlock.setPermutation(BlockPermutation.resolve("minecraft:air"));
                                    }
                                }
                            }

                            block.dimension.spawnItem(
                                new ItemStack(stalkDef.dropItemId, harvestCount),
                                {
                                    x: block.location.x + 0.5,
                                    y: block.location.y + 0.2,
                                    z: block.location.z + 0.5,
                                }
                            );

                            const baseKey = `${block.dimension.id}:${Math.floor(block.location.x)},${bY},${Math.floor(block.location.z)}`;
                            const tracked = trackedFarmlands.get(baseKey);
                            if (tracked) {
                                tracked.elapsedTicks = 0;
                            }

                            try {
                                block.dimension.playSound("block.sweet_berry_bush.pick", block.location, { volume: 0.8, pitch: 1.1 });
                                block.dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                    x: block.location.x + 0.5,
                                    y: block.location.y + 0.3,
                                    z: block.location.z + 0.5,
                                });
                            } catch {
                                // Ignore
                            }
                            return;
                        }
                    }
                } catch {
                    // Ignore
                }
            }

            // Check standard crops (Wheat, Carrots, Potatoes, Beetroot, Nether Wart, Sweet Berry Bush, Sniffer crops)
            const cropDef = SUPPORTED_CROPS[block.typeId];
            if (cropDef) {
                try {
                    const currentGrowth = block.permutation.getState(cropDef.growthStateName) as number ?? 0;
                    if (currentGrowth >= cropDef.maxGrowth) {
                        // Reset crop growth to replant stage
                        block.setPermutation(
                            block.permutation.withState(cropDef.growthStateName, cropDef.replantGrowth)
                        );

                        // Update tracked farmland
                        const groundPos: Vector3 = {
                            x: Math.floor(block.location.x),
                            y: Math.floor(block.location.y - 1),
                            z: Math.floor(block.location.z),
                        };
                        const groundKey = `${block.dimension.id}:${groundPos.x},${groundPos.y},${groundPos.z}`;
                        const tracked = trackedFarmlands.get(groundKey);
                        if (tracked) {
                            tracked.cropGrowth = cropDef.replantGrowth;
                            tracked.elapsedTicks = 0;
                        } else {
                            registerFarmland(
                                block.dimension.id,
                                groundPos,
                                cropDef.typeId,
                                cropDef.growthStateName,
                                cropDef.replantGrowth
                            );
                        }

                        // Ensure ground farmland is hydrated
                        try {
                            const groundBlock = block.dimension.getBlock(groundPos);
                            if (groundBlock && groundBlock.typeId === "minecraft:farmland") {
                                groundBlock.setPermutation(
                                    BlockPermutation.resolve("minecraft:farmland", { moisturized_amount: 7 })
                                );
                            }
                        } catch {
                            // Ignore
                        }

                        // Spawn harvested drops directly at the crop
                        const drops = cropDef.getDrops();
                        for (const drop of drops) {
                            block.dimension.spawnItem(
                                new ItemStack(drop.typeId, drop.count),
                                {
                                    x: block.location.x + 0.5,
                                    y: block.location.y + 0.2,
                                    z: block.location.z + 0.5,
                                }
                            );
                        }

                        // Play harvesting sound and bonemeal sparkle
                        try {
                            block.dimension.playSound("block.sweet_berry_bush.pick", block.location, {
                                volume: 0.8,
                                pitch: 1.1,
                            });
                            block.dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                x: block.location.x + 0.5,
                                y: block.location.y + 0.3,
                                z: block.location.z + 0.5,
                            });
                        } catch {
                            // Ignore
                        }

                        return;
                    }
                } catch {
                    // Ignore
                }
            }
        }

        // b) Hoe Interaction: immediately hydrates and registers tilled soil
        if (itemStack && (itemStack.typeId.endsWith("_hoe") || itemStack.hasTag("minecraft:is_hoe"))) {
            system.runTimeout(() => {
                try {
                    const updatedBlock = block.dimension.getBlock(block.location);
                    if (updatedBlock && updatedBlock.typeId === "minecraft:farmland") {
                        registerFarmland(block.dimension.id, block.location);
                        updatedBlock.setPermutation(
                            BlockPermutation.resolve("minecraft:farmland", { moisturized_amount: 7 })
                        );
                    }
                } catch {
                    // Ignore
                }
            }, 1);
        }
    });

    // 2. Crop & Farm Container Planting Listener: registers crops, chests, and signs
    world.afterEvents.playerPlaceBlock.subscribe((event: PlayerPlaceBlockAfterEvent) => {
        const cropBlock = event.block;

        // Auto-register placed containers and refresh crop cache
        if (
            cropBlock.typeId === "minecraft:chest" ||
            cropBlock.typeId === "minecraft:trapped_chest" ||
            cropBlock.typeId === "minecraft:barrel"
        ) {
            registerChest(event.dimension, cropBlock.location);
            cropChestCache.clear();
            return;
        }

        // Auto-register adjacent chests when a sign is placed
        if (cropBlock.typeId.includes("sign")) {
            const offsets = [
                { x: 0, y: 1, z: 0 },
                { x: 0, y: -1, z: 0 },
                { x: 1, y: 0, z: 0 },
                { x: -1, y: 0, z: 0 },
                { x: 0, y: 0, z: 1 },
                { x: 0, y: 0, z: -1 },
            ];
            for (const off of offsets) {
                registerChest(event.dimension, {
                    x: cropBlock.location.x + off.x,
                    y: cropBlock.location.y + off.y,
                    z: cropBlock.location.z + off.z,
                });
            }
            cropChestCache.clear();
            return;
        }

        // Auto-register chests when a hopper or composter is placed below them
        if (cropBlock.typeId === "minecraft:hopper" || cropBlock.typeId === "minecraft:composter") {
            for (let dy = 1; dy <= 3; dy++) {
                const abovePos: Vector3 = {
                    x: cropBlock.location.x,
                    y: cropBlock.location.y + dy,
                    z: cropBlock.location.z,
                };
                try {
                    const aboveBlock = event.dimension.getBlock(abovePos);
                    if (
                        aboveBlock &&
                        (aboveBlock.typeId === "minecraft:chest" ||
                            aboveBlock.typeId === "minecraft:trapped_chest" ||
                            aboveBlock.typeId === "minecraft:barrel")
                    ) {
                        registerChest(event.dimension, abovePos);
                    }
                } catch {
                    // Ignore
                }
            }
            cropChestCache.clear();
            return;
        }

        if (cropBlock.typeId === "minecraft:cocoa") {
            registerFarmland(event.dimension.id, cropBlock.location, "minecraft:cocoa", "age", 0);
            return;
        }

        if (cropBlock.typeId === "minecraft:sweet_berry_bush") {
            const groundPos: Vector3 = {
                x: Math.floor(cropBlock.location.x),
                y: Math.floor(cropBlock.location.y - 1),
                z: Math.floor(cropBlock.location.z),
            };
            registerFarmland(event.dimension.id, groundPos, "minecraft:sweet_berry_bush", "growth", 0);
            return;
        }

        if (
            cropBlock.typeId === "minecraft:cave_vines" ||
            cropBlock.typeId === "minecraft:cave_vines_head_with_berries" ||
            cropBlock.typeId === "minecraft:cave_vines_body_with_berries"
        ) {
            registerCaveVines(event.dimension.id, cropBlock.location, cropBlock.typeId);
            return;
        }

        const stalkDef = STALK_CROPS[cropBlock.typeId];
        if (stalkDef) {
            let bY = Math.floor(cropBlock.location.y);
            while (bY > -64) {
                const below = event.dimension.getBlock({ x: Math.floor(cropBlock.location.x), y: bY - 1, z: Math.floor(cropBlock.location.z) });
                if (below && (below.typeId === stalkDef.typeId || (stalkDef.typeId === "minecraft:kelp" && below.typeId === "minecraft:kelp_plant"))) {
                    bY--;
                } else {
                    break;
                }
            }
            registerStalkCrop(event.dimension.id, { x: cropBlock.location.x, y: bY, z: cropBlock.location.z }, cropBlock.typeId);
            return;
        }

        const groundPos: Vector3 = {
            x: cropBlock.location.x,
            y: cropBlock.location.y - 1,
            z: cropBlock.location.z,
        };

        try {
            const groundBlock = event.dimension.getBlock(groundPos);
            if (groundBlock && groundBlock.typeId === "minecraft:farmland") {
                const cropDef = SUPPORTED_CROPS[cropBlock.typeId];
                const growthName = cropDef ? cropDef.growthStateName : "growth";

                registerFarmland(
                    event.dimension.id,
                    groundPos,
                    cropBlock.typeId,
                    growthName,
                    0
                );
                groundBlock.setPermutation(
                    BlockPermutation.resolve("minecraft:farmland", { moisturized_amount: 7 })
                );
            }
        } catch {
            // Ignore
        }
    });

    // 3. Entity Item Spawn Intercept: catches dropped items when vanilla tries to pop off crops
    world.afterEvents.entitySpawn.subscribe((event: EntitySpawnAfterEvent) => {
        if (!FarmingConfig.farmland.antiTrample) return;

        try {
            const entity = event.entity;
            if (entity.typeId !== "minecraft:item") return;

            const loc = entity.location;
            const groundPos: Vector3 = {
                x: Math.floor(loc.x),
                y: Math.floor(loc.y - 0.2),
                z: Math.floor(loc.z),
            };

            const key = `${entity.dimension.id}:${groundPos.x},${groundPos.y},${groundPos.z}`;
            const tracked = trackedFarmlands.get(key);

            if (tracked) {
                // Restore trampled crop and soil
                restoreFarmlandAndCrop(entity.dimension, tracked);
            }
        } catch {
            // Ignore
        }
    });

    // 4. Player Break Block Listener:
    //    Handles manual crop harvesting (with auto-replant), chest/sign removal, and farmland unregistration
    world.afterEvents.playerBreakBlock.subscribe((event: PlayerBreakBlockAfterEvent) => {
        const brokenId = event.brokenBlockPermutation.type.id;
        const dimId = event.dimension.id;
        const loc = event.block.location;
        const player = event.player;

        // Clean up broken chests, barrels, signs, hoppers, and composters
        if (
            brokenId.includes("chest") ||
            brokenId.includes("barrel") ||
            brokenId.includes("sign") ||
            brokenId === "minecraft:hopper" ||
            brokenId === "minecraft:composter"
        ) {
            const chestKey = `${dimId}:${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
            knownChests.delete(chestKey);
            if (brokenId === "minecraft:hopper" || brokenId === "minecraft:composter") {
                for (let dy = 1; dy <= 3; dy++) {
                    const abovePos = { x: loc.x, y: loc.y + dy, z: loc.z };
                    try {
                        registerChest(event.dimension, abovePos);
                    } catch {
                        // Ignore
                    }
                }
            }
            cropChestCache.clear();
        }

        if (brokenId === "minecraft:farmland" || STALK_CROPS[brokenId] || brokenId === "minecraft:cocoa") {
            unregisterFarmland(dimId, loc);
            return;
        }

        const cropDef = SUPPORTED_CROPS[brokenId];
        if (cropDef) {
            const prevGrowth = event.brokenBlockPermutation.getState(cropDef.growthStateName) as number ?? 0;
            const isMature = prevGrowth >= cropDef.maxGrowth;

            // Auto-replant on manual harvest if player is not sneaking
            if (FarmingConfig.autoHarvest.replantOnManualHarvest && !player.isSneaking && isMature) {
                system.runTimeout(() => {
                    try {
                        const currentBlock = event.dimension.getBlock(loc);
                        const groundPos: Vector3 = {
                            x: Math.floor(loc.x),
                            y: Math.floor(loc.y - 1),
                            z: Math.floor(loc.z),
                        };
                        const groundBlock = event.dimension.getBlock(groundPos);

                        const isValidGround =
                            brokenId === "minecraft:nether_wart"
                                ? groundBlock && (groundBlock.typeId === "minecraft:soul_sand" || groundBlock.typeId === "minecraft:soul_soil")
                                : groundBlock && groundBlock.typeId === "minecraft:farmland";

                        if (currentBlock && currentBlock.isAir && isValidGround) {
                            // Replant crop at replant growth stage
                            currentBlock.setPermutation(
                                BlockPermutation.resolve(cropDef.typeId, {
                                    [cropDef.growthStateName]: cropDef.replantGrowth,
                                })
                            );

                            // Keep farmland moisturized
                            if (groundBlock && groundBlock.typeId === "minecraft:farmland") {
                                groundBlock.setPermutation(
                                    BlockPermutation.resolve("minecraft:farmland", { moisturized_amount: 7 })
                                );
                            }

                            // Keep tracked in memory
                            registerFarmland(
                                dimId,
                                groundPos,
                                cropDef.typeId,
                                cropDef.growthStateName,
                                cropDef.replantGrowth
                            );

                            try {
                                event.dimension.playSound("block.grass.place", loc, { volume: 0.6, pitch: 1.2 });
                                event.dimension.spawnParticle("minecraft:crop_growth_emitter", {
                                    x: loc.x + 0.5,
                                    y: loc.y + 0.2,
                                    z: loc.z + 0.5,
                                });
                            } catch {
                                // Ignore
                            }
                        }
                    } catch {
                        // Ignore
                    }
                }, 1);
            } else {
                // Player sneak-broke or broke immature crop: clear tracked crop
                const groundKey = `${dimId}:${Math.floor(loc.x)},${Math.floor(loc.y - 1)},${Math.floor(loc.z)}`;
                const tracked = trackedFarmlands.get(groundKey);
                if (tracked) {
                    tracked.cropTypeId = undefined;
                    tracked.cropGrowth = undefined;
                }
            }
        } else if (brokenId.includes("stem")) {
            const groundKey = `${dimId}:${Math.floor(loc.x)},${Math.floor(loc.y - 1)},${Math.floor(loc.z)}`;
            const tracked = trackedFarmlands.get(groundKey);
            if (tracked) {
                tracked.cropTypeId = undefined;
                tracked.cropGrowth = undefined;
            }
        }
    });

    // 5. Explosion Protection Listener: shields farmland, crops, and chests from Creepers, Ghasts, and TNT
    world.beforeEvents.explosion.subscribe((event: ExplosionBeforeEvent) => {
        if (!FarmingConfig.farmland.mobProtection) return;

        try {
            const impactedBlocks = event.getImpactedBlocks();
            const safeBlocks = impactedBlocks.filter((b) => !isFarmProtected(b));
            event.setImpactedBlocks(safeBlocks);
        } catch {
            // Ignore
        }
    });

    // 6. Optimized Feet Protection (Every 6 ticks = 300ms): guarantees crops and soil are never destroyed when jumped on
    system.runInterval(() => {
        const players = Array.from(world.getAllPlayers());
        if (players.length > 0) {
            processTickProtection(players);
        }
    }, 6);

    // 7. Farmland Discovery Loop (Every 100 ticks = 5 seconds)
    // Only runs when players move to a new location
    system.runInterval(() => {
        const players = Array.from(world.getAllPlayers());
        if (players.length > 0) {
            discoverFarmlandsAroundPlayers(players);
        }
    }, 100);

    // 7. Fast Growth Loop (Every growthCheckIntervalTicks)
    // Processes all loaded dimensions so crops grow even if players are in the Nether or far away
    const growthTicks = Math.max(10, FarmingConfig.growth.growthCheckIntervalTicks);
    system.runInterval(() => {
        const players = Array.from(world.getAllPlayers());
        if (players.length === 0) return;

        for (const dimId of ["overworld", "nether", "the_end"]) {
            try {
                const dim = world.getDimension(dimId);
                if (dim) {
                    processFastGrowth(dim);
                }
            } catch {
                // Ignore dimension error
            }
        }
    }, growthTicks);

    // 8. Auto-Harvest & Labeled Chest Loop (Every checkIntervalTicks)
    // Processes all loaded dimensions so automated farms run continuously
    const harvestTicks = Math.max(15, FarmingConfig.autoHarvest.checkIntervalTicks);
    system.runInterval(() => {
        const players = Array.from(world.getAllPlayers());
        if (players.length === 0) return;

        for (const dimId of ["overworld", "nether", "the_end"]) {
            try {
                const dim = world.getDimension(dimId);
                if (dim) {
                    processAutoHarvest(dim);
                }
            } catch {
                // Ignore dimension error
            }
        }
    }, harvestTicks);

    // Visual stage indicator loop for unautomated crops
    const reminderTicks = FarmingConfig.harvestReminder?.refreshIntervalTicks ?? 20;
    system.runInterval(() => {
        const players = Array.from(world.getAllPlayers());
        if (players.length === 0) return;
        processHarvestReminders(players);
    }, reminderTicks);

    // 10. Clean up player scan cache when a player leaves to prevent memory leaks
    world.afterEvents.playerLeave.subscribe((event) => {
        playerLastScanPos.delete(event.playerId);
    });
}
