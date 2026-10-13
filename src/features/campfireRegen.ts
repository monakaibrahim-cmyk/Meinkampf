import {
    Block,
    Entity,
    EntityComponentTypes,
    EntityDamageCause,
    EntityHealthComponent,
    Player,
    system,
    Vector3,
    world,
} from "@minecraft/server";
import { CampfireRegenConfig } from "../config";
import { HOSTILE_MOBS, NEUTRAL_MOBS, PASSIVE_MOBS } from "./mobHealthBar";

interface TrackedCampfireMob {
    entity: Entity;
    campfireLoc: Vector3;
    dimensionId: string;
}

// Track hostiles currently or previously influenced by lit campfires
const trackedCampfireHostiles = new Map<string, TrackedCampfireMob>();

interface KnownCampfire {
    x: number;
    y: number;
    z: number;
    dimensionId: string;
    isSoul: boolean;
}

// High-speed in-memory registry of known placed and discovered campfires
const knownCampfires = new Map<string, KnownCampfire>();
const playerLastCampfireScanPos = new Map<string, { x: number; y: number; z: number }>();

/**
 * Checks if a block is a lit campfire or soul campfire.
 */
export function isLitCampfire(block: Block): boolean {
    if (block.typeId !== "minecraft:campfire" && block.typeId !== "minecraft:soul_campfire") {
        return false;
    }
    try {
        const extinguished = block.permutation.getState("extinguished");
        if (typeof extinguished === "boolean") {
            return !extinguished;
        }
        const lit = block.permutation.getState("lit");
        if (typeof lit === "boolean") {
            return lit;
        }
    } catch {
        // Fallback
    }
    return true;
}

/**
 * High-speed lookup for the nearest lit campfire within radius.
 * First checks known campfires in memory with pure vector math (0 block queries).
 * Only performs a localized discovery scan if the player moves into a completely new area.
 */
export function findNearestLitCampfire(
    dim: import("@minecraft/server").Dimension,
    pLoc: Vector3,
    radius: number,
    playerId?: string
): Block | undefined {
    const radiusSq = radius * radius;
    let nearestBlock: Block | undefined;
    let nearestDistSq = (radius + 1) * (radius + 1);

    // 1. Check knownCampfires cache in memory (vector math, ultra-fast)
    const deadKeys: string[] = [];
    for (const [key, camp] of knownCampfires.entries()) {
        if (camp.dimensionId !== dim.id) continue;
        const distSq = (camp.x + 0.5 - pLoc.x) ** 2 + (camp.y + 0.5 - pLoc.y) ** 2 + (camp.z + 0.5 - pLoc.z) ** 2;
        if (distSq <= radiusSq) {
            try {
                const b = dim.getBlock({ x: camp.x, y: camp.y, z: camp.z });
                if (b && isLitCampfire(b)) {
                    if (distSq < nearestDistSq) {
                        nearestDistSq = distSq;
                        nearestBlock = b;
                    }
                } else {
                    deadKeys.push(key);
                }
            } catch {
                // Block unloaded, keep in cache
            }
        }
    }
    for (const k of deadKeys) {
        knownCampfires.delete(k);
    }

    if (nearestBlock) {
        return nearestBlock;
    }

    // 2. If no campfire in cache, only scan if player moved significantly (>= 6 blocks)
    if (playerId) {
        const last = playerLastCampfireScanPos.get(playerId);
        if (last) {
            const dx = pLoc.x - last.x;
            const dy = pLoc.y - last.y;
            const dz = pLoc.z - last.z;
            if (dx * dx + dy * dy + dz * dz < 36) {
                return undefined; // Stationary or small movement: skip expensive block scan
            }
        }
        playerLastCampfireScanPos.set(playerId, { x: pLoc.x, y: pLoc.y, z: pLoc.z });
    }

    // 3. One-off discovery scan: any discovered campfire is immediately added to knownCampfires
    const minX = Math.floor(pLoc.x) - radius;
    const maxX = Math.floor(pLoc.x) + radius;
    const minY = Math.max(-64, Math.floor(pLoc.y) - 2);
    const maxY = Math.min(320, Math.floor(pLoc.y) + 3);
    const minZ = Math.floor(pLoc.z) - radius;
    const maxZ = Math.floor(pLoc.z) + radius;

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const distSq = (x + 0.5 - pLoc.x) ** 2 + (y + 0.5 - pLoc.y) ** 2 + (z + 0.5 - pLoc.z) ** 2;
                if (distSq > radiusSq) continue;

                try {
                    const b = dim.getBlock({ x, y, z });
                    if (b && (b.typeId === "minecraft:campfire" || b.typeId === "minecraft:soul_campfire")) {
                        const key = `${dim.id}:${x},${y},${z}`;
                        const lit = isLitCampfire(b);
                        if (lit) {
                            knownCampfires.set(key, {
                                x,
                                y,
                                z,
                                dimensionId: dim.id,
                                isSoul: b.typeId === "minecraft:soul_campfire",
                            });
                            if (distSq < nearestDistSq) {
                                nearestDistSq = distSq;
                                nearestBlock = b;
                            }
                        }
                    }
                } catch {
                    // Ignore unloaded block
                }
            }
        }
    }

    return nearestBlock;
}

/**
 * Determines whether a mob is eligible for campfire regeneration based on configuration.
 */
function shouldHealMob(mobTypeId: string): boolean {
    if (HOSTILE_MOBS.has(mobTypeId)) {
        return false;
    }

    if (
        CampfireRegenConfig.healPets &&
        (mobTypeId === "minecraft:wolf" ||
            mobTypeId === "minecraft:cat" ||
            mobTypeId === "minecraft:horse" ||
            mobTypeId === "minecraft:donkey" ||
            mobTypeId === "minecraft:mule" ||
            mobTypeId === "minecraft:parrot")
    ) {
        return true;
    }

    if (CampfireRegenConfig.healNeutralMobs && NEUTRAL_MOBS.has(mobTypeId)) {
        return true;
    }

    if (CampfireRegenConfig.healPassiveMobs && PASSIVE_MOBS.has(mobTypeId)) {
        return true;
    }

    return false;
}

/**
 * Processes campfire health regeneration for all online players and their nearby pets, neutral, and passive mobs.
 * Runs once per second (every 20 ticks) for authentic vanilla survival balance.
 */
export function processCampfireRegeneration(): void {
    if (!CampfireRegenConfig.enabled) return;

    const players = Array.from(world.getAllPlayers());
    if (players.length === 0) return;

    const radius = CampfireRegenConfig.radius;
    const baseHeal = CampfireRegenConfig.baseHealthPerSecond;
    const healedEntityIds = new Set<string>();
    const currentMobsInRange = new Set<string>();
    const damagedMobsThisCycle = new Set<string>();

    for (const player of players) {
        if (!player || !player.isValid) continue;

        try {
            const pLoc = player.location;
            const dim = player.dimension;

            // Check if player is on fire (burning in flames)
            const onFireComp = player.getComponent(EntityComponentTypes.OnFire);
            if (onFireComp) {
                continue; // Do not heal if player is actively burning
            }

            // Search for nearest lit campfire using high-speed cached lookup
            const nearestCampfire = findNearestLitCampfire(dim, pLoc, radius, player.id);
            if (!nearestCampfire) continue;

            // Calculate multiplier suited for vanilla
            let multiplier = 1.0;

            // Resting multiplier: player is sitting / crouching near the campfire
            if (player.isSneaking) {
                multiplier *= CampfireRegenConfig.restingMultiplier;
            }

            // Soul campfire multiplier: mystical blue flames grant healing bonus
            if (nearestCampfire.typeId === "minecraft:soul_campfire") {
                multiplier *= CampfireRegenConfig.soulCampfireMultiplier;
            }

            const healAmount = baseHeal * multiplier;

            // Apply healing to player
            const healthComp = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
            if (healthComp && healthComp.currentValue < healthComp.effectiveMax) {
                const newHp = Math.min(healthComp.effectiveMax, healthComp.currentValue + healAmount);
                healthComp.setCurrentValue(newHp);

                // Spawn warmth / healing heart particles
                if (CampfireRegenConfig.showParticles) {
                    try {
                        dim.spawnParticle("minecraft:heart_particle", {
                            x: pLoc.x + (Math.random() - 0.5) * 0.6,
                            y: pLoc.y + 1.2 + Math.random() * 0.4,
                            z: pLoc.z + (Math.random() - 0.5) * 0.6,
                        });
                    } catch {
                        // Ignore
                    }
                }
            }

            // Heal nearby tamed pets, neutral mobs, and passive mobs
            const shouldHealAnyMob =
                CampfireRegenConfig.healPets ||
                CampfireRegenConfig.healNeutralMobs ||
                CampfireRegenConfig.healPassiveMobs;

            if (shouldHealAnyMob && nearestCampfire) {
                const firePos = nearestCampfire.location;
                const cCenter: Vector3 = { x: firePos.x + 0.5, y: firePos.y + 0.5, z: firePos.z + 0.5 };
                try {
                    const nearbyEntities = dim.getEntities({
                        location: cCenter,
                        maxDistance: radius,
                    });

                    for (const mob of nearbyEntities) {
                        if (!mob || !mob.isValid || mob.id === player.id) continue;
                        if (healedEntityIds.has(mob.id)) continue;

                        if (shouldHealMob(mob.typeId)) {
                            healedEntityIds.add(mob.id);

                            // Do not heal mob if it is actively burning
                            const mobOnFire = mob.getComponent(EntityComponentTypes.OnFire);
                            if (mobOnFire) continue;

                            const mobHealth = mob.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
                            if (mobHealth && mobHealth.currentValue < mobHealth.effectiveMax) {
                                mobHealth.setCurrentValue(Math.min(mobHealth.effectiveMax, mobHealth.currentValue + healAmount));

                                if (CampfireRegenConfig.showParticles) {
                                    try {
                                        dim.spawnParticle("minecraft:heart_particle", {
                                            x: mob.location.x,
                                            y: mob.location.y + 0.8,
                                            z: mob.location.z,
                                        });
                                    } catch {
                                        // Ignore
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    // Fallback
                }
            }

            // Burn hostile mobs that venture within burnHostilesRadius of the lit campfire
            if (CampfireRegenConfig.burnHostiles && nearestCampfire) {
                const firePos = nearestCampfire.location;
                const cCenter: Vector3 = { x: firePos.x + 0.5, y: firePos.y + 0.5, z: firePos.z + 0.5 };
                const burnRadius = CampfireRegenConfig.burnHostilesRadius ?? 10;
                try {
                    const hostiles = dim.getEntities({
                        location: cCenter,
                        maxDistance: burnRadius,
                    });

                    for (const mob of hostiles) {
                        if (!mob || !mob.isValid || mob.id === player.id) continue;
                        if (HOSTILE_MOBS.has(mob.typeId)) {
                            currentMobsInRange.add(mob.id);

                            // While inside radius, continuously keep on fire for 1s
                            mob.setOnFire(1, true);

                            // Deal campfire damage indefinitely every second while inside the radius
                            if (!damagedMobsThisCycle.has(mob.id)) {
                                damagedMobsThisCycle.add(mob.id);
                                const isSoul = nearestCampfire.typeId === "minecraft:soul_campfire";
                                const baseDmg = isSoul ? 2 : 1;
                                try {
                                    mob.applyDamage(baseDmg, { cause: EntityDamageCause.campfire });
                                } catch {
                                    // Entity dead or invulnerable
                                }
                            }

                            // Push hostile mob slightly back from the campfire
                            const mLoc = mob.location;
                            const dx = mLoc.x - cCenter.x;
                            const dz = mLoc.z - cCenter.z;
                            const dist = Math.sqrt(dx * dx + dz * dz);
                            if (dist > 0.1) {
                                mob.applyKnockback({ x: (dx / dist) * 0.4, z: (dz / dist) * 0.4 }, 0.1);
                            }

                            // Spawn fire sizzle particles
                            if (CampfireRegenConfig.showParticles) {
                                dim.spawnParticle("minecraft:basic_flame_particle", {
                                    x: mLoc.x,
                                    y: mLoc.y + 0.5,
                                    z: mLoc.z,
                                });
                            }

                            // Track mob for lingering burn once pushed / fled out of range
                            trackedCampfireHostiles.set(mob.id, {
                                entity: mob,
                                campfireLoc: cCenter,
                                dimensionId: dim.id,
                            });
                        }
                    }
                } catch {
                    // Ignore dimension error
                }
            }
        } catch {
            // Ignore
        }
    }

    // Check previously tracked hostiles: if they are now out of range from burnHostilesRadius,
    // apply burnHostileDurationSeconds lingering burn duration
    const burnRadius = CampfireRegenConfig.burnHostilesRadius ?? 10;
    const lingerDuration = CampfireRegenConfig.burnHostileDurationSeconds ?? 3;

    for (const [mobId, tracked] of trackedCampfireHostiles.entries()) {
        if (currentMobsInRange.has(mobId)) {
            // Still in range; continuous burn handles it
            continue;
        }

        // Hostile is no longer in range of the lit campfire
        trackedCampfireHostiles.delete(mobId);

        try {
            const mob = tracked.entity;
            if (!mob || !mob.isValid) continue;

            const mLoc = mob.location;
            const dx = mLoc.x - tracked.campfireLoc.x;
            const dy = mLoc.y - tracked.campfireLoc.y;
            const dz = mLoc.z - tracked.campfireLoc.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            // Only apply lingering burn if mob is out of burnHostilesRadius (and within 32 blocks)
            if (distSq >= burnRadius * burnRadius && distSq <= 32 * 32) {
                mob.setOnFire(lingerDuration, true);
            }
        } catch {
            // Ignore if entity is despawned or dimension unloaded
        }
    }
}

/**
 * Initializes the Campfire Regeneration feature with a 1-second interval loop (20 ticks).
 */
export function initCampfireRegenFeature(): void {
    if (!CampfireRegenConfig.enabled) {
        console.warn("[CampfireRegen] Feature is disabled in configuration.");
        return;
    }

    // 1. Intercept campfire damage and apply 3x damage multiplier to hostile mobs
    world.beforeEvents.entityHurt.subscribe((event) => {
        try {
            if (!CampfireRegenConfig.enabled) return;
            const cause = event.damageSource.cause;
            const isCampfireCause = cause === EntityDamageCause.campfire;

            // Also check if hostile mob is standing on a lit campfire block taking fire damage
            let onCampfire = false;
            if (!isCampfireCause && cause === EntityDamageCause.fire) {
                const hurtEntity = event.hurtEntity;
                if (hurtEntity && hurtEntity.isValid) {
                    const dim = hurtEntity.dimension;
                    const loc = hurtEntity.location;
                    const bAt = dim.getBlock(loc);
                    const bBelow = dim.getBlock({ x: loc.x, y: Math.floor(loc.y - 0.2), z: loc.z });
                    if ((bAt && isLitCampfire(bAt)) || (bBelow && isLitCampfire(bBelow))) {
                        onCampfire = true;
                    }
                }
            }

            if (isCampfireCause || onCampfire) {
                if (HOSTILE_MOBS.has(event.hurtEntity.typeId)) {
                    const multiplier = CampfireRegenConfig.hostileDamageMultiplier ?? 3.0;
                    event.damage *= multiplier;
                }
            }
        } catch {
            // Ignore
        }
    });

    // 2. Event-based tracking of placed and broken campfires
    world.afterEvents.playerPlaceBlock.subscribe((event) => {
        try {
            const b = event.block;
            if (b.typeId === "minecraft:campfire" || b.typeId === "minecraft:soul_campfire") {
                const key = `${event.dimension.id}:${Math.floor(b.location.x)},${Math.floor(b.location.y)},${Math.floor(b.location.z)}`;
                knownCampfires.set(key, {
                    x: Math.floor(b.location.x),
                    y: Math.floor(b.location.y),
                    z: Math.floor(b.location.z),
                    dimensionId: event.dimension.id,
                    isSoul: b.typeId === "minecraft:soul_campfire",
                });
            }
        } catch {
            // Ignore
        }
    });

    world.afterEvents.playerBreakBlock.subscribe((event) => {
        try {
            const brokenId = event.brokenBlockPermutation.type.id;
            if (brokenId.includes("campfire")) {
                const loc = event.block.location;
                const key = `${event.dimension.id}:${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
                knownCampfires.delete(key);
            }
        } catch {
            // Ignore
        }
    });

    world.afterEvents.playerLeave.subscribe((event) => {
        playerLastCampfireScanPos.delete(event.playerId);
    });

    // 3. Run healing and burn loop every 20 ticks = 1 second
    system.runInterval(() => {
        processCampfireRegeneration();
    }, 20);

    console.warn("[CampfireRegen] Feature initialized successfully.");
}

