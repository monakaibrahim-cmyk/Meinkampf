import { Block, BlockPermutation, Vector3 } from "@minecraft/server";

export function posKey(pos: Vector3): string {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
}

export function parsePos(key: string): Vector3 {
    const [x, y, z] = key.split(",").map(Number);
    return { x, y, z };
}

/**
 * Checks if a block or permutation represents a tree log / stem / wood block.
 */
export function isLog(target: Block | BlockPermutation): boolean {
    const permutation = "permutation" in target ? target.permutation : target;
    const typeId = permutation.type.id;

    if (
        typeId.endsWith("_log") ||
        typeId.endsWith("_wood") ||
        typeId.endsWith("_stem") ||
        typeId.endsWith("_hyphae") ||
        typeId === "minecraft:mangrove_roots"
    ) {
        return true;
    }

    return (
        permutation.hasTag("minecraft:is_log") ||
        permutation.hasTag("minecraft:is_wood") ||
        permutation.hasTag("log")
    );
}

/**
 * Checks if a block or permutation represents leaves or nether tree canopy blocks.
 */
export function isLeaves(target: Block | BlockPermutation): boolean {
    const permutation = "permutation" in target ? target.permutation : target;
    const typeId = permutation.type.id;

    if (
        typeId.endsWith("_leaves") ||
        typeId === "minecraft:nether_wart_block" ||
        typeId === "minecraft:warped_wart_block" ||
        typeId === "minecraft:shroomlight"
    ) {
        return true;
    }

    return (
        permutation.hasTag("minecraft:is_leaves") ||
        permutation.hasTag("leaves")
    );
}

/**
 * Checks if a leaf block was placed by a player (persistent_bit is true in Bedrock).
 */
export function isPlayerPlacedLeaves(target: Block | BlockPermutation): boolean {
    const permutation = "permutation" in target ? target.permutation : target;
    try {
        const persistent = permutation.getState("persistent_bit");
        return persistent === true;
    } catch {
        return false;
    }
}

/**
 * Resolves the wood species name (e.g. "oak", "birch", "spruce", "dark_oak", etc.) from a log typeId.
 */
export function getWoodSpecies(typeId: string): string | undefined {
    if (typeId.includes("pale_oak")) return "pale_oak";
    if (typeId.includes("dark_oak")) return "dark_oak";
    if (typeId.includes("oak")) return "oak";
    if (typeId.includes("birch")) return "birch";
    if (typeId.includes("spruce")) return "spruce";
    if (typeId.includes("jungle")) return "jungle";
    if (typeId.includes("acacia")) return "acacia";
    if (typeId.includes("cherry")) return "cherry";
    if (typeId.includes("mangrove")) return "mangrove";
    if (typeId.includes("crimson")) return "crimson";
    if (typeId.includes("warped")) return "warped";
    return undefined;
}

/**
 * Checks whether a leaf block or permutation belongs to the given log/wood type.
 * Ensures smart filtering so cutting down one tree never decays neighboring trees of different species.
 */
export function isMatchingLeafForLog(target: Block | BlockPermutation, logTypeId: string): boolean {
    if (!isLeaves(target)) return false;

    const permutation = "permutation" in target ? target.permutation : target;
    const typeId = permutation.type.id;

    // Nether fungi canopies
    if (logTypeId.includes("crimson")) {
        return typeId === "minecraft:nether_wart_block" || typeId === "minecraft:shroomlight";
    }
    if (logTypeId.includes("warped")) {
        return typeId === "minecraft:warped_wart_block" || typeId === "minecraft:shroomlight";
    }

    const species = getWoodSpecies(logTypeId);
    if (!species) return true; // Fallback if custom or unknown wood type

    // 1. Flattened Bedrock IDs (e.g. minecraft:oak_leaves, minecraft:spruce_leaves)
    if (typeId === `minecraft:${species}_leaves`) {
        return true;
    }

    // Oak trees can generate with azalea or flowering azalea leaves
    if (species === "oak" && (typeId === "minecraft:azalea_leaves" || typeId === "minecraft:flowering_azalea_leaves")) {
        return true;
    }

    // 2. Legacy Bedrock IDs (minecraft:leaves and minecraft:leaves2)
    if (typeId === "minecraft:leaves") {
        try {
            const oldType = permutation.getState("old_leaf_type");
            if (typeof oldType === "string") {
                return oldType === species;
            }
        } catch {
            // Ignore
        }
        return species === "oak" || species === "spruce" || species === "birch" || species === "jungle";
    }

    if (typeId === "minecraft:leaves2") {
        try {
            const newType = permutation.getState("new_leaf_type");
            if (typeof newType === "string") {
                return newType === species;
            }
        } catch {
            // Ignore
        }
        return species === "acacia" || species === "dark_oak";
    }

    return false;
}

