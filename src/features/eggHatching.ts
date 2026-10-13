import {
    world,
    system,
    Dimension,
    EntityComponentTypes,
    EntityItemComponent,
} from "@minecraft/server";
import { ChickenEggHatchConfig } from "../config";

// Tracks elapsed incubation seconds per egg entity ID
const eggIncubationAge = new Map<string, number>();

/**
 * Initializes the Chicken Egg Auto-Hatch feature.
 * Laid chicken eggs on the ground will no longer despawn into nothingness;
 * instead, they naturally incubate and hatch into baby chicks.
 */
export function initEggHatchingFeature(): void {
    if (!ChickenEggHatchConfig.enabled) return;

    system.runInterval(() => {
        try {
            checkAndHatchEggs();
        } catch {
            // Ignore transient tick errors
        }
    }, ChickenEggHatchConfig.checkIntervalTicks);
}

/**
 * Scans active dimensions for egg items on the ground and advances incubation.
 */
function checkAndHatchEggs(): void {
    const players = Array.from(world.getAllPlayers());
    if (players.length === 0) return;

    // Only inspect dimensions that have online players actively loaded
    const activeDimIds = new Set(players.map((p) => p.dimension.id));

    for (const dimId of activeDimIds) {
        let dim: Dimension;
        try {
            dim = world.getDimension(dimId);
        } catch {
            continue;
        }

        let items;
        try {
            items = dim.getEntities({ type: "minecraft:item" });
        } catch {
            continue;
        }

        for (const itemEntity of items) {
            if (!itemEntity.isValid) continue;

            let itemComp: EntityItemComponent | undefined;
            try {
                itemComp = itemEntity.getComponent(EntityComponentTypes.Item) as EntityItemComponent | undefined;
            } catch {
                continue;
            }

            if (!itemComp || itemComp.itemStack.typeId !== "minecraft:egg") {
                continue;
            }

            const eggId = itemEntity.id;
            const age = (eggIncubationAge.get(eggId) ?? 0) + 1;
            eggIncubationAge.set(eggId, age);

            const loc = itemEntity.location;

            // Periodic warmth particles while incubating
            if (ChickenEggHatchConfig.showParticles && age % 6 === 0) {
                try {
                    dim.spawnParticle("minecraft:heart_particle", {
                        x: loc.x,
                        y: loc.y + 0.25,
                        z: loc.z,
                    });
                } catch {
                    // Ignore particle error
                }
            }

            // Check if incubation period is complete
            if (age >= ChickenEggHatchConfig.incubationSeconds) {
                // Check nearby chicken density to prevent runaway lag in tight pens
                try {
                    const nearbyChickens = dim.getEntities({
                        type: "minecraft:chicken",
                        location: loc,
                        maxDistance: 6,
                    });

                    if (nearbyChickens.length >= ChickenEggHatchConfig.maxNearbyChickens) {
                        // Pause hatching until space is available
                        continue;
                    }
                } catch {
                    // Continue with hatch if query fails
                }

                // Spawn baby chicken
                if (Math.random() <= ChickenEggHatchConfig.hatchChance) {
                    if (ChickenEggHatchConfig.showParticles) {
                        try {
                            dim.spawnParticle("minecraft:egg_destroy_particle", {
                                x: loc.x,
                                y: loc.y + 0.2,
                                z: loc.z,
                            });
                        } catch {
                            try {
                                dim.spawnParticle("minecraft:poof_particle", {
                                    x: loc.x,
                                    y: loc.y + 0.2,
                                    z: loc.z,
                                });
                            } catch {
                                // Ignore
                            }
                        }
                    }

                    if (ChickenEggHatchConfig.playSound) {
                        try {
                            dim.playSound("random.break", loc, { volume: 0.8, pitch: 1.2 });
                            dim.playSound("entity.chicken.egg", loc, { volume: 0.8, pitch: 1.4 });
                        } catch {
                            // Ignore sound error
                        }
                    }

                    // Spawn baby chick
                    try {
                        const chick = dim.spawnEntity("minecraft:chicken", loc);
                        try {
                            chick.triggerEvent("minecraft:entity_born");
                        } catch {
                            // Fallback
                        }
                        try {
                            chick.triggerEvent("minecraft:spawn_baby");
                        } catch {
                            // Fallback
                        }
                    } catch {
                        // Ignore spawn failure
                    }

                    // Twin spawn chance
                    if (Math.random() < ChickenEggHatchConfig.twinChance) {
                        try {
                            const twin = dim.spawnEntity("minecraft:chicken", loc);
                            try {
                                twin.triggerEvent("minecraft:entity_born");
                            } catch {
                                // Fallback
                            }
                            try {
                                twin.triggerEvent("minecraft:spawn_baby");
                            } catch {
                                // Fallback
                            }
                        } catch {
                            // Ignore
                        }
                    }

                    // Decrement or remove egg stack
                    const stack = itemComp.itemStack;
                    eggIncubationAge.delete(eggId);

                    try {
                        itemEntity.remove();
                    } catch {
                        // Ignore
                    }

                    if (stack.amount > 1) {
                        try {
                            const remaining = stack.clone();
                            remaining.amount -= 1;
                            dim.spawnItem(remaining, loc);
                        } catch {
                            // Ignore
                        }
                    }
                } else {
                    // Reset age if chance failed
                    eggIncubationAge.set(eggId, 0);
                }
            }
        }
    }

    // Periodic memory cleanup for despawned or picked up eggs
    if (eggIncubationAge.size > 200) {
        eggIncubationAge.clear();
    }
}

