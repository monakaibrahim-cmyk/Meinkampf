import {
    Block,
    Dimension,
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
import { HOSTILE_MOBS, NEUTRAL_MOBS, PASSIVE_MOBS, isPlayerNamedEntity } from "./mobHealthBar";

interface TrackedCampfireMob {
    entity: Entity;
    campfireLoc: Vector3;
    dimensionId: string;
}

// Track hostiles currently or previously influenced by lit campfires
const trackedCampfireHostiles = new Map<string, TrackedCampfireMob>();

// Tracks previous health values of hostile mobs to suppress health regeneration
const mobLastRecordedHealth = new Map<string, number>();

/**
 * Checks if an entity has been given a genuine custom name tag by a player.
 * Uses isPlayerNamedEntity to correctly distinguish player-given names from generated UI tags.
 */
export function isNamedEntity(entity: Entity): boolean {
    return isPlayerNamedEntity(entity);
}

/**
 * Determines whether an entity is a hostile mob, using strict registry matching
 * with fallback to entity type identifier substrings.
 */
export function isHostileMob(typeId: string): boolean {
    if (HOSTILE_MOBS.has(typeId)) return true;
    const cleanId = typeId.startsWith("minecraft:") ? typeId.substring(10) : typeId;
    if (HOSTILE_MOBS.has(`minecraft:${cleanId}`)) return true;
    return (
        cleanId.includes("zombie") ||
        cleanId.includes("skeleton") ||
        cleanId.includes("creeper") ||
        cleanId.includes("spider") ||
        cleanId.includes("slime") ||
        cleanId.includes("phantom") ||
        cleanId.includes("illager") ||
        cleanId.includes("pillager") ||
        cleanId.includes("vindicator") ||
        cleanId.includes("evoker") ||
        cleanId.includes("ravager") ||
        cleanId.includes("witch") ||
        cleanId.includes("enderman") ||
        cleanId.includes("warden") ||
        cleanId.includes("wither") ||
        cleanId.includes("blaze") ||
        cleanId.includes("ghast") ||
        cleanId.includes("hoglin") ||
        cleanId.includes("zoglin") ||
        cleanId.includes("breeze") ||
        cleanId.includes("bogged")
    );
}

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
const playerLastCampfireScanTick = new Map<string, number>();

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
 * Finds all lit campfires within search radius of a location.
 * Checks knownCampfires cache in memory with pure vector math (0 block queries).
 * Scans locally if moving to a new area or periodically every 5 seconds if none cached.
 */
export function findLitCampfiresAround(
    dim: Dimension,
    pLoc: Vector3,
    searchRadius: number,
    playerId?: string
): Block[] {
    const radiusSq = searchRadius * searchRadius;
    const foundCampfires: Block[] = [];
    const deadKeys: string[] = [];

    // 1. Check knownCampfires cache in memory (vector math, ultra-fast)
    for (const [key, camp] of knownCampfires.entries()) {
        if (camp.dimensionId !== dim.id) continue;
        const distSq = (camp.x + 0.5 - pLoc.x) ** 2 + (camp.y + 0.5 - pLoc.y) ** 2 + (camp.z + 0.5 - pLoc.z) ** 2;
        if (distSq <= radiusSq) {
            try {
                const b = dim.getBlock({ x: camp.x, y: camp.y, z: camp.z });
                if (b && isLitCampfire(b)) {
                    foundCampfires.push(b);
                } else if (b && b.typeId !== "minecraft:campfire" && b.typeId !== "minecraft:soul_campfire") {
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

    if (foundCampfires.length > 0) {
        return foundCampfires;
    }

    // 2. Discovery scan throttling: only scan if player moved significantly (>= 4 blocks)
    // or if at least 60 ticks (3 seconds) passed since last scan
    if (playerId) {
        const lastPos = playerLastCampfireScanPos.get(playerId);
        const lastTick = playerLastCampfireScanTick.get(playerId) ?? 0;
        const currentTick = system.currentTick;
        let shouldScan = true;

        if (lastPos) {
            const dx = pLoc.x - lastPos.x;
            const dy = pLoc.y - lastPos.y;
            const dz = pLoc.z - lastPos.z;
            const movedDistSq = dx * dx + dy * dy + dz * dz;
            const timedOut = currentTick - lastTick >= 60;
            if (movedDistSq < 16 && !timedOut) {
                shouldScan = false;
            }
        }

        if (!shouldScan) {
            return foundCampfires;
        }

        playerLastCampfireScanPos.set(playerId, { x: pLoc.x, y: pLoc.y, z: pLoc.z });
        playerLastCampfireScanTick.set(playerId, currentTick);
    }

    // 3. Local discovery scan: adds any discovered campfire to knownCampfires
    const scanR = Math.min(searchRadius, 10);
    const scanRSq = scanR * scanR;
    const minX = Math.floor(pLoc.x) - scanR;
    const maxX = Math.floor(pLoc.x) + scanR;
    const minY = Math.max(-64, Math.floor(pLoc.y) - 3);
    const maxY = Math.min(320, Math.floor(pLoc.y) + 3);
    const minZ = Math.floor(pLoc.z) - scanR;
    const maxZ = Math.floor(pLoc.z) + scanR;

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const distSq = (x + 0.5 - pLoc.x) ** 2 + (y + 0.5 - pLoc.y) ** 2 + (z + 0.5 - pLoc.z) ** 2;
                if (distSq > scanRSq) continue;

                try {
                    const b = dim.getBlock({ x, y, z });
                    if (b && (b.typeId === "minecraft:campfire" || b.typeId === "minecraft:soul_campfire")) {
                        const key = `${dim.id}:${x},${y},${z}`;
                        knownCampfires.set(key, {
                            x,
                            y,
                            z,
                            dimensionId: dim.id,
                            isSoul: b.typeId === "minecraft:soul_campfire",
                        });
                        if (isLitCampfire(b)) {
                            foundCampfires.push(b);
                        }
                    }
                } catch {
                    // Ignore unloaded block
                }
            }
        }
    }

    return foundCampfires;
}

/**
 * High-speed lookup for the nearest lit campfire within radius.
 */
export function findNearestLitCampfire(
    dim: Dimension,
    pLoc: Vector3,
    radius: number,
    playerId?: string
): Block | undefined {
    const campfires = findLitCampfiresAround(dim, pLoc, radius, playerId);
    if (campfires.length === 0) return undefined;

    let nearest = campfires[0];
    let nearestDistSq =
        (nearest.location.x + 0.5 - pLoc.x) ** 2 +
        (nearest.location.y + 0.5 - pLoc.y) ** 2 +
        (nearest.location.z + 0.5 - pLoc.z) ** 2;

    for (let i = 1; i < campfires.length; i++) {
        const c = campfires[i];
        const distSq =
            (c.location.x + 0.5 - pLoc.x) ** 2 +
            (c.location.y + 0.5 - pLoc.y) ** 2 +
            (c.location.z + 0.5 - pLoc.z) ** 2;
        if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearest = c;
        }
    }
    return nearest;
}

/**
 * Determines whether a mob is eligible for campfire regeneration based on configuration.
 */
function shouldHealMob(mobTypeId: string): boolean {
    if (isHostileMob(mobTypeId)) {
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
 * Processes campfire health regeneration and hostile mob burning/defense for all active campfires.
 * Runs once per second (every 20 ticks) for authentic vanilla survival balance.
 */
export function processCampfireRegeneration(): void {
    if (!CampfireRegenConfig.enabled) return;

    const players = Array.from(world.getAllPlayers());
    if (players.length === 0) return;

    const radius = CampfireRegenConfig.radius;
    const burnRadius = CampfireRegenConfig.burnHostilesRadius ?? 10;
    const searchRadius = Math.max(radius, burnRadius) + 4;
    const baseHeal = CampfireRegenConfig.baseHealthPerSecond;
    const healedEntityIds = new Set<string>();
    const currentMobsInRange = new Set<string>();
    const damagedMobsThisCycle = new Set<string>();

    // Collect all lit campfires in active range of any online player
    const activeCampfires = new Map<string, { block: Block; dim: Dimension }>();

    for (const player of players) {
        if (!player || !player.isValid) continue;

        try {
            const pLoc = player.location;
            const dim = player.dimension;
            const nearbyCampfires = findLitCampfiresAround(dim, pLoc, searchRadius, player.id);

            for (const camp of nearbyCampfires) {
                const key = `${dim.id}:${camp.location.x},${camp.location.y},${camp.location.z}`;
                if (!activeCampfires.has(key)) {
                    activeCampfires.set(key, { block: camp, dim });
                }
            }

            // Find closest campfire to player for player warmth & regeneration
            let playerNearestCamp: Block | undefined;
            let playerMinDistSq = (radius + 1) * (radius + 1);
            let hasNearbySoul = false;

            for (const camp of nearbyCampfires) {
                const distSq =
                    (camp.location.x + 0.5 - pLoc.x) ** 2 +
                    (camp.location.y + 0.5 - pLoc.y) ** 2 +
                    (camp.location.z + 0.5 - pLoc.z) ** 2;
                if (distSq <= radius * radius) {
                    if (distSq < playerMinDistSq) {
                        playerMinDistSq = distSq;
                        playerNearestCamp = camp;
                    }
                    if (camp.typeId === "minecraft:soul_campfire") {
                        hasNearbySoul = true;
                    }
                }
            }

            // Apply player healing only if player is within campfire radius and NOT actively burning
            if (playerNearestCamp) {
                const onFireComp = player.getComponent(EntityComponentTypes.OnFire);
                if (!onFireComp) {
                    let multiplier = 1.0;
                    if (player.isSneaking) {
                        multiplier *= CampfireRegenConfig.restingMultiplier;
                    }
                    if (hasNearbySoul) {
                        multiplier *= CampfireRegenConfig.soulCampfireMultiplier;
                    }

                    const healAmount = baseHeal * multiplier;
                    const healthComp = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
                    if (healthComp && healthComp.currentValue < healthComp.effectiveMax) {
                        const newHp = Math.min(healthComp.effectiveMax, healthComp.currentValue + healAmount);
                        healthComp.setCurrentValue(newHp);

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
                }
            }
        } catch {
            // Ignore
        }
    }

    // Now process all active campfires for mob healing & hostile defense
    const shouldHealAnyMob =
        CampfireRegenConfig.healPets ||
        CampfireRegenConfig.healNeutralMobs ||
        CampfireRegenConfig.healPassiveMobs;

    for (const { block: campfire, dim } of activeCampfires.values()) {
        try {
            const firePos = campfire.location;
            const cCenter: Vector3 = { x: firePos.x + 0.5, y: firePos.y + 0.5, z: firePos.z + 0.5 };
            const isSoul = campfire.typeId === "minecraft:soul_campfire";

            // 1. Heal nearby tamed pets, neutral mobs, and passive mobs
            if (shouldHealAnyMob) {
                try {
                    const nearbyEntities = dim.getEntities({
                        location: cCenter,
                        maxDistance: radius,
                    });

                    for (const mob of nearbyEntities) {
                        if (!mob || !mob.isValid || mob.typeId === "minecraft:player") continue;
                        if (healedEntityIds.has(mob.id)) continue;

                        if (shouldHealMob(mob.typeId)) {
                            healedEntityIds.add(mob.id);

                            const mobOnFire = mob.getComponent(EntityComponentTypes.OnFire);
                            if (mobOnFire) continue;

                            const mobHealth = mob.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
                            if (mobHealth && mobHealth.currentValue < mobHealth.effectiveMax) {
                                mobHealth.setCurrentValue(Math.min(mobHealth.effectiveMax, mobHealth.currentValue + baseHeal));

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
                    // Ignore
                }
            }

            // 2. Burn, damage, debuff, and repel hostile mobs inside burnHostilesRadius
            const shouldDefendHostiles = CampfireRegenConfig.burnHostiles || CampfireRegenConfig.debuffHostiles;
            if (shouldDefendHostiles) {
                const burnDuration = CampfireRegenConfig.burnHostileDurationSeconds ?? 3;
                try {
                    const hostiles = dim.getEntities({
                        location: cCenter,
                        maxDistance: burnRadius,
                    });

                    for (const mob of hostiles) {
                        if (!mob || !mob.isValid || mob.typeId === "minecraft:player") continue;
                        if (isHostileMob(mob.typeId)) {
                            // Completely exempt named hostile mobs from campfire burning, damage, debuffs, and knockback
                            if (CampfireRegenConfig.exemptNamedHostiles && isPlayerNamedEntity(mob)) {
                                continue;
                            }

                            currentMobsInRange.add(mob.id);

                            // Continuously keep burning duration at full duration (3s) and deal damage while inside radius
                            if (CampfireRegenConfig.burnHostiles) {
                                mob.setOnFire(burnDuration, true);

                                if (!damagedMobsThisCycle.has(mob.id)) {
                                    damagedMobsThisCycle.add(mob.id);
                                    const baseDmg = isSoul ? 2 : 1;
                                    try {
                                        mob.applyDamage(baseDmg, { cause: EntityDamageCause.campfire });
                                    } catch {
                                        // Entity dead or invulnerable
                                    }
                                }
                            }

                            // Apply balanced status debuffs to hostile mobs inside campfire radius
                            if (CampfireRegenConfig.debuffHostiles) {
                                const debuffTicks = (CampfireRegenConfig.debuffDurationSeconds ?? burnDuration) * 20;

                                // 1. Slowness: slow movement speed (Slowness II for normal, Slowness III for soul)
                                if (CampfireRegenConfig.debuffSlowness) {
                                    const slownessAmp = isSoul ? 2 : 1;
                                    try {
                                        mob.addEffect("minecraft:slowness", debuffTicks, {
                                            amplifier: slownessAmp,
                                            showParticles: true,
                                        });
                                    } catch {
                                        try {
                                            mob.addEffect("slowness", debuffTicks, {
                                                amplifier: slownessAmp,
                                                showParticles: true,
                                            });
                                        } catch {
                                            // Fallback
                                        }
                                    }
                                }

                                // 2. Weakness: reduce mob melee attack damage (Weakness I for normal, Weakness II for soul)
                                if (CampfireRegenConfig.debuffWeakness) {
                                    const weaknessAmp = isSoul ? 1 : 0;
                                    try {
                                        mob.addEffect("minecraft:weakness", debuffTicks, {
                                            amplifier: weaknessAmp,
                                            showParticles: true,
                                        });
                                    } catch {
                                        try {
                                            mob.addEffect("weakness", debuffTicks, {
                                                amplifier: weaknessAmp,
                                                showParticles: true,
                                            });
                                        } catch {
                                            // Fallback
                                        }
                                    }
                                }

                                // 3. Mining Fatigue: slow down attack swing / wind-up speed
                                if (CampfireRegenConfig.debuffMiningFatigue) {
                                    const fatigueAmp = isSoul ? 1 : 0;
                                    try {
                                        mob.addEffect("minecraft:mining_fatigue", debuffTicks, {
                                            amplifier: fatigueAmp,
                                            showParticles: true,
                                        });
                                    } catch {
                                        try {
                                            mob.addEffect("mining_fatigue", debuffTicks, {
                                                amplifier: fatigueAmp,
                                                showParticles: true,
                                            });
                                        } catch {
                                            // Fallback
                                        }
                                    }
                                }

                                // 4. Mob Regen Suppression: strip regeneration & absorption buffs and revert healed HP
                                if (CampfireRegenConfig.debuffRegen) {
                                    try {
                                        mob.removeEffect("minecraft:regeneration");
                                        mob.removeEffect("regeneration");
                                        mob.removeEffect("minecraft:absorption");
                                        mob.removeEffect("absorption");
                                    } catch {
                                        // Ignore
                                    }

                                    try {
                                        const healthComp = mob.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
                                        if (healthComp) {
                                            const prevHp = mobLastRecordedHealth.get(mob.id);
                                            if (prevHp !== undefined && healthComp.currentValue > prevHp) {
                                                healthComp.setCurrentValue(prevHp);
                                            } else {
                                                mobLastRecordedHealth.set(mob.id, healthComp.currentValue);
                                            }
                                        }
                                    } catch {
                                        // Ignore
                                    }
                                }

                                // 5. Soul Campfire special: brief Blindness (2s) in soul smoke
                                if (isSoul && CampfireRegenConfig.debuffSoulBlindness) {
                                    try {
                                        mob.addEffect("minecraft:blindness", 40, {
                                            amplifier: 0,
                                            showParticles: true,
                                        });
                                    } catch {
                                        try {
                                            mob.addEffect("blindness", 40, {
                                                amplifier: 0,
                                                showParticles: true,
                                            });
                                        } catch {
                                            // Fallback
                                        }
                                    }
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

                            // Spawn fire and smoke particles
                            if (CampfireRegenConfig.showParticles) {
                                try {
                                    dim.spawnParticle("minecraft:basic_flame_particle", {
                                        x: mLoc.x,
                                        y: mLoc.y + 0.5,
                                        z: mLoc.z,
                                    });
                                    dim.spawnParticle(isSoul ? "minecraft:soul_particle" : "minecraft:basic_smoke_particle", {
                                        x: mLoc.x,
                                        y: mLoc.y + 0.8,
                                        z: mLoc.z,
                                    });
                                } catch {
                                    // Ignore
                                }
                            }

                            // Track mob for lingering burn once pushed / fled out of range
                            if (CampfireRegenConfig.burnHostiles) {
                                trackedCampfireHostiles.set(mob.id, {
                                    entity: mob,
                                    campfireLoc: cCenter,
                                    dimensionId: dim.id,
                                });
                            }
                        }
                    }
                } catch {
                    // Ignore
                }
            }
        } catch {
            // Ignore
        }
    }

    // Check previously tracked hostiles: if they are now out of range from burnHostilesRadius,
    // apply lingering burn duration
    const lingerDuration = CampfireRegenConfig.burnHostileDurationSeconds ?? 3;

    for (const [mobId, tracked] of trackedCampfireHostiles.entries()) {
        if (currentMobsInRange.has(mobId)) {
            // Still in range; continuous burn handles it
            continue;
        }

        // Hostile is no longer in range of the lit campfire
        trackedCampfireHostiles.delete(mobId);
        mobLastRecordedHealth.delete(mobId);

        try {
            const mob = tracked.entity;
            if (!mob || !mob.isValid) continue;

            // Check if mob was named in the interim
            if (CampfireRegenConfig.exemptNamedHostiles && isPlayerNamedEntity(mob)) {
                try {
                    mob.extinguishFire(true);
                } catch {
                    // Ignore
                }
                continue;
            }

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

    // Periodic memory cleanup for anti-regen health tracker
    if (mobLastRecordedHealth.size > 200) {
        for (const id of mobLastRecordedHealth.keys()) {
            if (!currentMobsInRange.has(id)) {
                mobLastRecordedHealth.delete(id);
            }
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
            let campBlock: Block | undefined;
            if (!isCampfireCause && cause === EntityDamageCause.fire) {
                const hurtEntity = event.hurtEntity;
                if (hurtEntity && hurtEntity.isValid) {
                    const dim = hurtEntity.dimension;
                    const loc = hurtEntity.location;
                    const bAt = dim.getBlock(loc);
                    const bBelow = dim.getBlock({ x: loc.x, y: Math.floor(loc.y - 0.2), z: loc.z });
                    if (bAt && isLitCampfire(bAt)) {
                        onCampfire = true;
                        campBlock = bAt;
                    } else if (bBelow && isLitCampfire(bBelow)) {
                        onCampfire = true;
                        campBlock = bBelow;
                    }
                }
            }

            if (campBlock) {
                const key = `${campBlock.dimension.id}:${Math.floor(campBlock.location.x)},${Math.floor(campBlock.location.y)},${Math.floor(campBlock.location.z)}`;
                knownCampfires.set(key, {
                    x: Math.floor(campBlock.location.x),
                    y: Math.floor(campBlock.location.y),
                    z: Math.floor(campBlock.location.z),
                    dimensionId: campBlock.dimension.id,
                    isSoul: campBlock.typeId === "minecraft:soul_campfire",
                });
            }

            if (isCampfireCause || onCampfire) {
                if (isHostileMob(event.hurtEntity.typeId)) {
                    // Exempt named hostile mobs from campfire damage
                    if (CampfireRegenConfig.exemptNamedHostiles && isPlayerNamedEntity(event.hurtEntity)) {
                        event.cancel = true;
                        try {
                            event.hurtEntity.extinguishFire(true);
                        } catch {
                            // Ignore
                        }
                        return;
                    }

                    const multiplier = CampfireRegenConfig.hostileDamageMultiplier ?? 3.0;
                    event.damage *= multiplier;
                }
            }
        } catch {
            // Ignore
        }
    });

    // 2. Event-based tracking of placed, interacted, and broken campfires
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

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        try {
            const b = event.block;
            if (b.typeId === "minecraft:campfire" || b.typeId === "minecraft:soul_campfire") {
                const key = `${b.dimension.id}:${Math.floor(b.location.x)},${Math.floor(b.location.y)},${Math.floor(b.location.z)}`;
                knownCampfires.set(key, {
                    x: Math.floor(b.location.x),
                    y: Math.floor(b.location.y),
                    z: Math.floor(b.location.z),
                    dimensionId: b.dimension.id,
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
        playerLastCampfireScanTick.delete(event.playerId);
    });

    // 3. Run healing and burn loop every 20 ticks = 1 second
    system.runInterval(() => {
        processCampfireRegeneration();
    }, 20);

    console.warn("[CampfireRegen] Feature initialized successfully.");
}
