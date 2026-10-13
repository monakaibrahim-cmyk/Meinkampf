import {
    Player,
    system,
    Vector2,
    world,
} from "@minecraft/server";
import { AfkProtectionConfig } from "../config";
import { HOSTILE_MOBS } from "./mobHealthBar";

interface PlayerActivityState {
    lastActivityTime: number; // timestamp in ms
    lastCombatTime: number;   // timestamp in ms
    lastLocation: { x: number; y: number; z: number };
    lastRotation: { x: number; y: number }; // pitch, yaw
    lastSneaking: boolean;
    isAfk: boolean;
    afkStartTime: number; // timestamp in ms
}

const playerStates = new Map<string, PlayerActivityState>();

/**
 * Gets or initializes the activity state for a player.
 */
function getPlayerState(player: Player): PlayerActivityState {
    let state = playerStates.get(player.id);
    if (!state) {
        const loc = player.location;
        let rot: Vector2 = { x: 0, y: 0 };
        try {
            rot = player.getRotation();
        } catch {
            // Default rotation
        }
        state = {
            lastActivityTime: Date.now(),
            lastCombatTime: 0,
            lastLocation: { x: loc.x, y: loc.y, z: loc.z },
            lastRotation: { x: rot.x, y: rot.y },
            lastSneaking: player.isSneaking,
            isAfk: false,
            afkStartTime: 0,
        };
        playerStates.set(player.id, state);
    }
    return state;
}

/**
 * Checks whether a player is currently in an invincible AFK protection window.
 */
export function isPlayerAfkInvincible(player: Player): boolean {
    if (!AfkProtectionConfig.enabled || !AfkProtectionConfig.protectFromAllDamage) {
        return false;
    }
    const state = playerStates.get(player.id);
    if (!state || !state.isAfk) {
        return false;
    }
    const maxDurationMs = AfkProtectionConfig.temporaryInvincibilityDurationSeconds * 1000;
    if (maxDurationMs <= 0) {
        return true; // Unlimited duration while AFK
    }
    return Date.now() - state.afkStartTime <= maxDurationMs;
}

/**
 * Checks whether a player is currently marked as AFK.
 */
export function isPlayerAfk(player: Player): boolean {
    const state = playerStates.get(player.id);
    return Boolean(state && state.isAfk);
}

/**
 * Activates AFK mode and protection for a player.
 */
export function activateAfk(player: Player, manual = false): boolean {
    if (!player || !player.isValid) return false;
    const state = getPlayerState(player);
    if (state.isAfk) return true;

    // Check combat cooldown
    const now = Date.now();
    const combatCooldownMs = (AfkProtectionConfig.combatCooldownSeconds ?? 10) * 1000;
    if (combatCooldownMs > 0 && now - state.lastCombatTime < combatCooldownMs) {
        if (manual) {
            const remSec = Math.ceil((combatCooldownMs - (now - state.lastCombatTime)) / 1000);
            player.sendMessage(`§c[AFK] Cannot enter AFK protection while recently in combat! (${remSec}s cooldown remaining)`);
        }
        return false;
    }

    state.isAfk = true;
    state.afkStartTime = now;

    // Apply protection status effects with showParticles = false
    if (AfkProtectionConfig.applyInvisibility) {
        try {
            player.addEffect("invisibility", 999999, { amplifier: 0, showParticles: false });
        } catch {
            // Fallback
        }
    }
    if (AfkProtectionConfig.applyResistance) {
        try {
            player.addEffect("resistance", 999999, { amplifier: 4, showParticles: false });
        } catch {
            // Fallback
        }
    }
    if (AfkProtectionConfig.applyFireResistance) {
        try {
            player.addEffect("fire_resistance", 999999, { amplifier: 0, showParticles: false });
        } catch {
            // Fallback
        }
    }
    if (AfkProtectionConfig.applyWaterBreathing) {
        try {
            player.addEffect("water_breathing", 999999, { amplifier: 0, showParticles: false });
        } catch {
            // Fallback
        }
    }

    if (AfkProtectionConfig.autoExtinguishFire) {
        try {
            player.extinguishFire(true);
        } catch {
            // Fallback
        }
    }

    if (AfkProtectionConfig.notifyPlayer) {
        player.sendMessage("§6[AFK] ✦ AFK Protection is now ACTIVE ✦\n§eYou have temporary invincibility and hostile mobs will ignore you.");
    }

    if (AfkProtectionConfig.announceToChat) {
        world.sendMessage(`§e[AFK] ${player.name} is now AFK (Protected).`);
    }

    return true;
}

/**
 * Deactivates AFK mode and cleans up protection effects.
 */
export function deactivateAfk(player: Player): void {
    if (!player || !player.isValid) return;
    const state = playerStates.get(player.id);
    if (!state || !state.isAfk) return;

    state.isAfk = false;
    state.lastActivityTime = Date.now();

    // Remove status effects that were applied by AFK protection
    try {
        player.removeEffect("invisibility");
    } catch {}
    try {
        player.removeEffect("resistance");
    } catch {}
    try {
        player.removeEffect("fire_resistance");
    } catch {}
    try {
        player.removeEffect("water_breathing");
    } catch {}

    try {
        player.onScreenDisplay.setActionBar("");
    } catch {}

    if (AfkProtectionConfig.notifyPlayer) {
        player.sendMessage("§a[AFK] Welcome back! AFK protection deactivated.");
    }

    if (AfkProtectionConfig.announceToChat) {
        world.sendMessage(`§e[AFK] ${player.name} is no longer AFK.`);
    }
}

/**
 * Records player activity (movement, interaction, etc.), resetting the idle timer
 * and immediately deactivating AFK mode if active.
 */
export function recordPlayerActivity(player: Player): void {
    if (!player || !player.isValid) return;
    const state = getPlayerState(player);
    state.lastActivityTime = Date.now();

    if (state.isAfk) {
        deactivateAfk(player);
    }
}

/**
 * Main periodic loop checking idle timers and maintaining AFK protection.
 */
export function processAfkMonitoring(): void {
    if (!AfkProtectionConfig.enabled) return;

    const players = Array.from(world.getAllPlayers());
    if (players.length === 0) return;

    const now = Date.now();
    const idleThresholdMs = (AfkProtectionConfig.afkIdleThresholdSeconds ?? 60) * 1000;
    const maxInvincibleMs = (AfkProtectionConfig.temporaryInvincibilityDurationSeconds ?? 300) * 1000;

    for (const player of players) {
        if (!player || !player.isValid) continue;

        try {
            const state = getPlayerState(player);
            const loc = player.location;

            let rot: Vector2 = { x: 0, y: 0 };
            try {
                rot = player.getRotation();
            } catch {
                rot = { x: state.lastRotation.x, y: state.lastRotation.y };
            }

            const dx = loc.x - state.lastLocation.x;
            const dy = loc.y - state.lastLocation.y;
            const dz = loc.z - state.lastLocation.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            const dPitch = Math.abs(rot.x - state.lastRotation.x);
            const dYaw = Math.abs(rot.y - state.lastRotation.y);
            const isSneaking = player.isSneaking;
            const sneakChanged = isSneaking !== state.lastSneaking;

            // Detect activity: moved > 0.2 blocks, rotated camera > 1.5 degrees, or changed sneak state
            if (distSq > 0.04 || dPitch > 1.5 || dYaw > 1.5 || sneakChanged) {
                state.lastLocation = { x: loc.x, y: loc.y, z: loc.z };
                state.lastRotation = { x: rot.x, y: rot.y };
                state.lastSneaking = isSneaking;
                recordPlayerActivity(player);
                continue;
            }

            // If player is in AFK mode
            if (state.isAfk) {
                const isInvincible = maxInvincibleMs <= 0 || now - state.afkStartTime <= maxInvincibleMs;

                if (isInvincible) {
                    // Refresh status effects
                    if (AfkProtectionConfig.applyInvisibility) {
                        try {
                            player.addEffect("invisibility", 100, { amplifier: 0, showParticles: false });
                        } catch {}
                    }
                    if (AfkProtectionConfig.applyResistance) {
                        try {
                            player.addEffect("resistance", 100, { amplifier: 4, showParticles: false });
                        } catch {}
                    }
                    if (AfkProtectionConfig.applyFireResistance) {
                        try {
                            player.addEffect("fire_resistance", 100, { amplifier: 0, showParticles: false });
                        } catch {}
                    }
                    if (AfkProtectionConfig.applyWaterBreathing) {
                        try {
                            player.addEffect("water_breathing", 100, { amplifier: 0, showParticles: false });
                        } catch {}
                    }

                    if (AfkProtectionConfig.autoExtinguishFire) {
                        try {
                            player.extinguishFire(true);
                        } catch {}
                    }

                    // Display status in action bar
                    if (AfkProtectionConfig.showActionBar) {
                        let remainingStr = "";
                        if (maxInvincibleMs > 0) {
                            const remSec = Math.max(0, Math.ceil((maxInvincibleMs - (now - state.afkStartTime)) / 1000));
                            remainingStr = ` §7(${remSec}s remaining)`;
                        }
                        try {
                            player.onScreenDisplay.setActionBar(
                                `§6✦ AFK Protection Active ✦ §aInvincible & Ignored${remainingStr}`
                            );
                        } catch {}
                    }

                    // Spawn protective particles
                    if (AfkProtectionConfig.showParticles) {
                        try {
                            player.dimension.spawnParticle("minecraft:totem_particle", {
                                x: loc.x + (Math.random() - 0.5) * 0.8,
                                y: loc.y + 1.0 + (Math.random() - 0.5) * 0.6,
                                z: loc.z + (Math.random() - 0.5) * 0.8,
                            });
                        } catch {}
                    }

                    // Hostile mobs ignore and are repelled away from AFK player
                    if (AfkProtectionConfig.hostileMobsIgnore) {
                        const repelRadius = AfkProtectionConfig.mobRepelRadius ?? 12;
                        const repelForce = AfkProtectionConfig.mobRepelForce ?? 0.5;

                        try {
                            const nearby = player.dimension.getEntities({
                                location: loc,
                                maxDistance: repelRadius,
                            });

                            for (const mob of nearby) {
                                if (!mob || !mob.isValid || mob.id === player.id) continue;
                                if (HOSTILE_MOBS.has(mob.typeId)) {
                                    const mLoc = mob.location;
                                    const mdx = mLoc.x - loc.x;
                                    const mdz = mLoc.z - loc.z;
                                    const mDist = Math.sqrt(mdx * mdx + mdz * mdz);

                                    if (mDist < repelRadius && mDist > 0.1) {
                                        const pushX = (mdx / mDist) * repelForce;
                                        const pushZ = (mdz / mDist) * repelForce;
                                        mob.applyKnockback({ x: pushX, z: pushZ }, 0.15);

                                        // Disorient mob gaze away from player
                                        try {
                                            mob.lookAt({
                                                x: mLoc.x + pushX * 10,
                                                y: mLoc.y,
                                                z: mLoc.z + pushZ * 10,
                                            });
                                        } catch {}
                                    }

                                    // If hostile mob is within 6 blocks, apply brief Blindness to break aggro lock
                                    if (mDist < 6) {
                                        try {
                                            mob.addEffect("minecraft:blindness", 40, {
                                                amplifier: 0,
                                                showParticles: false,
                                            });
                                        } catch {}
                                    }
                                }
                            }
                        } catch {}
                    }
                } else {
                    // Invincibility duration expired while player is still AFK
                    if (AfkProtectionConfig.showActionBar) {
                        try {
                            player.onScreenDisplay.setActionBar(
                                "§c✦ AFK Invincibility Expired ✦ §e(Move to resume normal play)"
                            );
                        } catch {}
                    }
                }
            } else {
                // Player is not AFK: check if idle threshold reached
                const idleTime = now - state.lastActivityTime;
                if (idleTime >= idleThresholdMs) {
                    activateAfk(player);
                }
            }
        } catch {
            // Ignore per-player error
        }
    }
}

/**
 * Initializes the AFK Protection feature with listeners and recurring monitoring.
 */
export function initAfkProtectionFeature(): void {
    if (!AfkProtectionConfig.enabled) {
        console.warn("[AfkProtection] Feature is disabled in configuration.");
        return;
    }

    // 1. Intercept all damage to invincible AFK players
    world.beforeEvents.entityHurt.subscribe((event) => {
        try {
            const hurtEntity = event.hurtEntity;
            if (!hurtEntity || !hurtEntity.isValid) return;

            if (hurtEntity instanceof Player) {
                if (isPlayerAfkInvincible(hurtEntity)) {
                    event.cancel = true;

                    // Extinguish fire if hurt by fire/lava
                    if (AfkProtectionConfig.autoExtinguishFire) {
                        try {
                            hurtEntity.extinguishFire(true);
                        } catch {}
                    }

                    // Push attacking mob away if attacked
                    const damager = event.damageSource.damagingEntity;
                    if (damager && damager.isValid && HOSTILE_MOBS.has(damager.typeId)) {
                        const pLoc = hurtEntity.location;
                        const dLoc = damager.location;
                        const dx = dLoc.x - pLoc.x;
                        const dz = dLoc.z - pLoc.z;
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        if (dist > 0.1) {
                            damager.applyKnockback({ x: (dx / dist) * 0.8, z: (dz / dist) * 0.8 }, 0.2);
                        }
                    }
                    return;
                }

                // If player took damage while NOT AFK, record combat time to prevent immediate AFK protection
                const state = getPlayerState(hurtEntity);
                state.lastCombatTime = Date.now();
                state.lastActivityTime = Date.now();
            }
        } catch {
            // Ignore
        }
    });


    // 3. Register activity event listeners to reset idle timer and exit AFK on action
    world.afterEvents.playerBreakBlock.subscribe((e) => {
        try {
            recordPlayerActivity(e.player);
        } catch {}
    });

    world.afterEvents.playerPlaceBlock.subscribe((e) => {
        try {
            recordPlayerActivity(e.player);
        } catch {}
    });

    world.afterEvents.playerInteractWithBlock.subscribe((e) => {
        try {
            recordPlayerActivity(e.player);
        } catch {}
    });

    world.afterEvents.playerInteractWithEntity.subscribe((e) => {
        try {
            recordPlayerActivity(e.player);
        } catch {}
    });

    world.afterEvents.itemUse.subscribe((e) => {
        try {
            if (e.source instanceof Player) {
                recordPlayerActivity(e.source);
            }
        } catch {}
    });

    world.afterEvents.entityHitEntity.subscribe((e) => {
        try {
            if (e.damagingEntity instanceof Player) {
                recordPlayerActivity(e.damagingEntity);
            }
        } catch {}
    });

    world.afterEvents.playerLeave.subscribe((e) => {
        try {
            playerStates.delete(e.playerId);
        } catch {}
    });

    // 4. Periodic monitoring loop
    const intervalTicks = AfkProtectionConfig.checkIntervalTicks ?? 20;
    system.runInterval(() => {
        processAfkMonitoring();
    }, intervalTicks);

    console.warn("[AfkProtection] Feature initialized successfully.");
}
