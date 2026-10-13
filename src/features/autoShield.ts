import {
    EntityComponentTypes,
    EntityDamageCause,
    EntityEquippableComponent,
    EquipmentSlot,
    ItemStack,
    Player,
    Vector3,
    world,
} from "@minecraft/server";
import { AutoShieldConfig } from "../config";

/**
 * Checks whether an item is a shield.
 */
export function isShield(item?: ItemStack): boolean {
    if (!item) return false;
    return item.typeId === "minecraft:shield";
}

/**
 * Checks if the player has a shield equipped (offhand or mainhand).
 */
export function getEquippedShieldSlot(player: Player): EquipmentSlot | undefined {
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!equippable) return undefined;

        const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
        if (isShield(offhand)) return EquipmentSlot.Offhand;

        const mainhand = equippable.getEquipment(EquipmentSlot.Mainhand);
        if (isShield(mainhand)) return EquipmentSlot.Mainhand;
    } catch {
        // Fallback
    }
    return undefined;
}

/**
 * Checks if the damage cause is blockable by a shield in Minecraft.
 */
export function isBlockableDamageCause(cause: EntityDamageCause): boolean {
    switch (cause) {
        case EntityDamageCause.entityAttack:
        case EntityDamageCause.projectile:
        case EntityDamageCause.entityExplosion:
        case EntityDamageCause.blockExplosion:
            return true;
        default:
            return false;
    }
}

/**
 * Checks whether the attack source is in front of the player (within ~180° field of view).
 */
export function isAttackFromFront(player: Player, sourceLoc?: Vector3): boolean {
    if (!AutoShieldConfig.blockFrontOnly || !sourceLoc) return true;

    try {
        const pLoc = player.location;
        const viewDir = player.getViewDirection();
        const dx = sourceLoc.x - pLoc.x;
        const dz = sourceLoc.z - pLoc.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= 0.1) return true; // Direct contact / explosion at center

        const dot = (dx * viewDir.x + dz * viewDir.z) / dist;
        return dot > -0.25; // Within ~105° cone in front of player
    } catch {
        return true;
    }
}

/**
 * Initializes the Auto Shield feature.
 * Intercepts blockable attacks and protects players while attacking, sprinting, or moving.
 */
export function initAutoShieldFeature(): void {
    if (!AutoShieldConfig.enabled) {
        console.warn("[AutoShield] Feature is disabled in configuration.");
        return;
    }

    world.beforeEvents.entityHurt.subscribe((event) => {
        const victim = event.hurtEntity;
        if (!victim || !victim.isValid || victim.typeId !== "minecraft:player") return;

        const player = victim as Player;
        if (player.hasTag("auto_shield_disabled")) return;

        // Check if player has an equipped shield
        const shieldSlot = getEquippedShieldSlot(player);
        if (shieldSlot === undefined) return;

        const cause = event.damageSource.cause;
        if (!isBlockableDamageCause(cause)) return;

        // Check source location for front blocking
        const sourceLoc = event.damageSource.damagingEntity?.location ?? event.damageSource.damagingProjectile?.location;
        if (!isAttackFromFront(player, sourceLoc)) return;

        // Cancel damage (Shield blocks 100% of the attack)
        event.cancel = true;

        // Play authentic Minecraft shield block sound
        if (AutoShieldConfig.playSound) {
            try {
                player.dimension.playSound("item.shield.block", player.location, {
                    volume: 1.0,
                    pitch: 1.0,
                });
            } catch {
                // Ignore
            }
        }

        // Spawn shield block particle effect
        if (AutoShieldConfig.showParticles) {
            try {
                const viewDir = player.getViewDirection();
                player.dimension.spawnParticle("minecraft:crit_emitter", {
                    x: player.location.x + viewDir.x * 0.7,
                    y: player.location.y + 1.2,
                    z: player.location.z + viewDir.z * 0.7,
                });
            } catch {
                // Ignore
            }
        }

        // Knockback melee attacker
        if (AutoShieldConfig.knockbackAttacker) {
            const attacker = event.damageSource.damagingEntity;
            if (attacker && attacker.isValid && attacker.id !== player.id) {
                try {
                    const viewDir = player.getViewDirection();
                    attacker.applyKnockback({ x: viewDir.x * 0.45, z: viewDir.z * 0.45 }, 0.15);
                } catch {
                    // Ignore
                }
            }
        }

        // Deflect/destroy projectile
        const projectile = event.damageSource.damagingProjectile;
        if (projectile && projectile.isValid) {
            try {
                projectile.kill();
            } catch {
                // Ignore
            }
        }
    });

    console.warn("[AutoShield] Feature initialized successfully.");
}
