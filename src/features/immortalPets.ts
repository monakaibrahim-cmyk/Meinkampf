import {
    Dimension,
    Entity,
    EntityComponentTypes,
    EntityDamageCause,
    EntityHealthComponent,
    EntityHurtBeforeEvent,
    EntityIsTamedComponent,
    EntityTameableComponent,
    EntityTamedAfterEvent,
    EntityTameMountComponent,
    Player,
    system,
    world,
} from "@minecraft/server";
import { PetConfig } from "../config";

/**
 * Retrieves the owner player of a tamed pet, if available.
 */
export function getPetOwner(entity: Entity): Player | undefined {
    try {
        const tameable = entity.getComponent(EntityComponentTypes.Tameable) as EntityTameableComponent | undefined;
        if (tameable && tameable.isTamed && tameable.tamedToPlayer) {
            return tameable.tamedToPlayer;
        }

        const tameMount = entity.getComponent(EntityComponentTypes.TameMount) as EntityTameMountComponent | undefined;
        if (tameMount && tameMount.isTamed && tameMount.tamedToPlayer) {
            return tameMount.tamedToPlayer;
        }
    } catch {
        // Fallback
    }
    return undefined;
}

/**
 * Checks whether an entity is a tamed pet or mount.
 * Supports wolves, cats, parrots, horses, donkeys, mules, llamas, and camels.
 */
export function isTamedPet(entity: Entity): boolean {
    if (!entity || !entity.isValid) return false;

    try {
        // 1. Check Tameable component (Dogs, Cats, Parrots)
        const tameable = entity.getComponent(EntityComponentTypes.Tameable) as EntityTameableComponent | undefined;
        if (tameable?.isTamed) {
            return true;
        }

        // 2. Check TameMount component (Horses, Donkeys, Mules, Llamas, Camels)
        const tameMount = entity.getComponent(EntityComponentTypes.TameMount) as EntityTameMountComponent | undefined;
        if (tameMount?.isTamed) {
            return true;
        }

        // 3. Check is_tamed component
        const isTamedComp = entity.getComponent(EntityComponentTypes.IsTamed);
        if (isTamedComp) {
            return true;
        }

        // 4. Tags
        if (entity.hasTag("minecraft:is_tamed") || entity.hasTag("is_tamed")) {
            return true;
        }
    } catch {
        // Fallback
    }
    return false;
}

/**
 * Initializes the immortal pets feature.
 */
export function initImmortalPetsFeature(): void {
    // 1. Entity Hurt Listener: cancels ALL incoming damage to tamed pets
    world.beforeEvents.entityHurt.subscribe((event: EntityHurtBeforeEvent) => {
        if (!PetConfig.enabled) return;

        const pet = event.hurtEntity;
        if (!isTamedPet(pet)) return;

        const cause = event.damageSource.cause;
        const damagingEntity = event.damageSource.damagingEntity;

        // Friendly fire protection: owner hitting pet with melee or arrows
        if (PetConfig.preventFriendlyFire && damagingEntity) {
            const owner = getPetOwner(pet);
            if (owner && damagingEntity.id === owner.id) {
                event.cancel = true;
                return;
            }
        }

        // Auto Void Rescue: teleport pet back to owner if it falls into the void
        if (PetConfig.autoVoidRescue && cause === EntityDamageCause.void) {
            event.cancel = true;
            const owner = getPetOwner(pet);
            if (owner && owner.isValid) {
                try {
                    pet.teleport(owner.location, { dimension: owner.dimension });
                    if (PetConfig.notifyOwner) {
                        owner.sendMessage("§d[QoL Mod]§r §aYour pet fell into the void and was safely rescued!§r");
                        owner.playSound("random.levelup", { volume: 0.8, pitch: 1.2 });
                    }
                } catch {
                    // Ignore teleport error
                }
            }
            return;
        }

        // Cancel all damage (combat, hostile mobs, creepers, arrows, fall, drowning, fire)
        event.cancel = true;

        // Auto Extinguish: put out fire if burning in lava or fire
        if (
            PetConfig.autoExtinguish &&
            (cause === EntityDamageCause.fire ||
                cause === EntityDamageCause.fireTick ||
                cause === EntityDamageCause.lava)
        ) {
            system.runTimeout(() => {
                try {
                    pet.extinguishFire(true);
                } catch {
                    // Ignore
                }
            }, 1);
        }

        // Ensure pet's health remains full
        try {
            const health = pet.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
            if (health && health.currentValue < health.effectiveMax) {
                health.resetToMaxValue();
            }
        } catch {
            // Ignore
        }
    });

    // 2. Entity Tamed Listener: heals pet to full health and notifies owner
    world.afterEvents.entityTamed.subscribe((event: EntityTamedAfterEvent) => {
        if (!PetConfig.enabled) return;

        const pet = event.entity;
        const tamer = event.tamingEntity;

        // Heal pet to full health
        try {
            const health = pet.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
            health?.resetToMaxValue();
        } catch {
            // Ignore
        }

        if (tamer && tamer.typeId === "minecraft:player") {
            const player = tamer as Player;
            if (player && player.isValid) {
                player.sendMessage("§d[QoL Mod]§r §aYour newly tamed pet is now immortal!§r");
                try {
                    player.playSound("random.levelup", { volume: 0.7, pitch: 1.3 });
                } catch {
                    // Ignore
                }
            }
        }
    });
}
