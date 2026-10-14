import {
    EntityComponentTypes,
    EntityHealthComponent,
    EntityHungerComponent,
    EquipmentSlot,
    GameMode,
    ItemStack,
    Player,
    system,
    world,
} from "@minecraft/server";
import { AutoEatConfig } from "../config";
import { showPlayerNotification } from "../utils/notifications";

export interface FoodItemInfo {
    id: string;
    name: string;
    nutrition: number;
    saturation: number;
    returnsItem?: string;
    isGoldenApple?: boolean;
    isEnchantedGoldenApple?: boolean;
    isHarmful?: boolean;
    isChorusFruit?: boolean;
    curesPoison?: boolean;
}

export const FOOD_DATABASE: Record<string, FoodItemInfo> = {
    // Golden & Enchanted Foods
    "minecraft:enchanted_golden_apple": {
        id: "minecraft:enchanted_golden_apple",
        name: "Enchanted Golden Apple",
        nutrition: 4,
        saturation: 9.6,
        isEnchantedGoldenApple: true,
    },
    "minecraft:golden_apple": {
        id: "minecraft:golden_apple",
        name: "Golden Apple",
        nutrition: 4,
        saturation: 9.6,
        isGoldenApple: true,
    },
    "minecraft:golden_carrot": {
        id: "minecraft:golden_carrot",
        name: "Golden Carrot",
        nutrition: 6,
        saturation: 14.4,
    },

    // Cooked Meats & Fish (High Tier)
    "minecraft:cooked_porkchop": {
        id: "minecraft:cooked_porkchop",
        name: "Cooked Porkchop",
        nutrition: 8,
        saturation: 12.8,
    },
    "minecraft:cooked_beef": {
        id: "minecraft:cooked_beef",
        name: "Steak",
        nutrition: 8,
        saturation: 12.8,
    },
    "minecraft:cooked_mutton": {
        id: "minecraft:cooked_mutton",
        name: "Cooked Mutton",
        nutrition: 6,
        saturation: 9.6,
    },
    "minecraft:cooked_salmon": {
        id: "minecraft:cooked_salmon",
        name: "Cooked Salmon",
        nutrition: 6,
        saturation: 9.6,
    },
    "minecraft:cooked_chicken": {
        id: "minecraft:cooked_chicken",
        name: "Cooked Chicken",
        nutrition: 6,
        saturation: 7.2,
    },
    "minecraft:cooked_cod": {
        id: "minecraft:cooked_cod",
        name: "Cooked Cod",
        nutrition: 5,
        saturation: 6.0,
    },
    "minecraft:cooked_rabbit": {
        id: "minecraft:cooked_rabbit",
        name: "Cooked Rabbit",
        nutrition: 5,
        saturation: 6.0,
    },

    // Stews & Soups (Bowl return)
    "minecraft:rabbit_stew": {
        id: "minecraft:rabbit_stew",
        name: "Rabbit Stew",
        nutrition: 10,
        saturation: 12.0,
        returnsItem: "minecraft:bowl",
    },
    "minecraft:mushroom_stew": {
        id: "minecraft:mushroom_stew",
        name: "Mushroom Stew",
        nutrition: 6,
        saturation: 7.2,
        returnsItem: "minecraft:bowl",
    },
    "minecraft:beetroot_soup": {
        id: "minecraft:beetroot_soup",
        name: "Beetroot Soup",
        nutrition: 6,
        saturation: 7.2,
        returnsItem: "minecraft:bowl",
    },
    "minecraft:suspicious_stew": {
        id: "minecraft:suspicious_stew",
        name: "Suspicious Stew",
        nutrition: 6,
        saturation: 7.2,
        returnsItem: "minecraft:bowl",
    },

    // Baked & Crafted Foods
    "minecraft:baked_potato": {
        id: "minecraft:baked_potato",
        name: "Baked Potato",
        nutrition: 5,
        saturation: 6.0,
    },
    "minecraft:bread": {
        id: "minecraft:bread",
        name: "Bread",
        nutrition: 5,
        saturation: 6.0,
    },
    "minecraft:pumpkin_pie": {
        id: "minecraft:pumpkin_pie",
        name: "Pumpkin Pie",
        nutrition: 8,
        saturation: 4.8,
    },
    "minecraft:honey_bottle": {
        id: "minecraft:honey_bottle",
        name: "Honey Bottle",
        nutrition: 6,
        saturation: 1.2,
        returnsItem: "minecraft:glass_bottle",
        curesPoison: true,
    },

    // Produce & Crops
    "minecraft:apple": {
        id: "minecraft:apple",
        name: "Apple",
        nutrition: 4,
        saturation: 2.4,
    },
    "minecraft:carrot": {
        id: "minecraft:carrot",
        name: "Carrot",
        nutrition: 3,
        saturation: 3.6,
    },
    "minecraft:melon_slice": {
        id: "minecraft:melon_slice",
        name: "Melon Slice",
        nutrition: 2,
        saturation: 1.2,
    },
    "minecraft:sweet_berries": {
        id: "minecraft:sweet_berries",
        name: "Sweet Berries",
        nutrition: 2,
        saturation: 0.4,
    },
    "minecraft:glow_berries": {
        id: "minecraft:glow_berries",
        name: "Glow Berries",
        nutrition: 2,
        saturation: 0.4,
    },
    "minecraft:cookie": {
        id: "minecraft:cookie",
        name: "Cookie",
        nutrition: 2,
        saturation: 0.4,
    },
    "minecraft:dried_kelp": {
        id: "minecraft:dried_kelp",
        name: "Dried Kelp",
        nutrition: 1,
        saturation: 0.6,
    },
    "minecraft:beetroot": {
        id: "minecraft:beetroot",
        name: "Beetroot",
        nutrition: 1,
        saturation: 1.2,
    },

    // Raw Foods
    "minecraft:beef": {
        id: "minecraft:beef",
        name: "Raw Beef",
        nutrition: 3,
        saturation: 1.8,
    },
    "minecraft:porkchop": {
        id: "minecraft:porkchop",
        name: "Raw Porkchop",
        nutrition: 3,
        saturation: 1.8,
    },
    "minecraft:mutton": {
        id: "minecraft:mutton",
        name: "Raw Mutton",
        nutrition: 2,
        saturation: 1.2,
    },
    "minecraft:salmon": {
        id: "minecraft:salmon",
        name: "Raw Salmon",
        nutrition: 2,
        saturation: 0.4,
    },
    "minecraft:cod": {
        id: "minecraft:cod",
        name: "Raw Cod",
        nutrition: 2,
        saturation: 0.4,
    },
    "minecraft:rabbit": {
        id: "minecraft:rabbit",
        name: "Raw Rabbit",
        nutrition: 3,
        saturation: 1.8,
    },
    "minecraft:potato": {
        id: "minecraft:potato",
        name: "Potato",
        nutrition: 1,
        saturation: 0.6,
    },

    // Harmful / Debuff Foods (Excluded by default)
    "minecraft:rotten_flesh": {
        id: "minecraft:rotten_flesh",
        name: "Rotten Flesh",
        nutrition: 4,
        saturation: 0.8,
        isHarmful: true,
    },
    "minecraft:raw_chicken": {
        id: "minecraft:raw_chicken",
        name: "Raw Chicken",
        nutrition: 2,
        saturation: 1.2,
        isHarmful: true,
    },
    "minecraft:spider_eye": {
        id: "minecraft:spider_eye",
        name: "Spider Eye",
        nutrition: 2,
        saturation: 3.2,
        isHarmful: true,
    },
    "minecraft:poisonous_potato": {
        id: "minecraft:poisonous_potato",
        name: "Poisonous Potato",
        nutrition: 2,
        saturation: 1.2,
        isHarmful: true,
    },
    "minecraft:pufferfish": {
        id: "minecraft:pufferfish",
        name: "Pufferfish",
        nutrition: 1,
        saturation: 0.2,
        isHarmful: true,
    },

    // Special
    "minecraft:chorus_fruit": {
        id: "minecraft:chorus_fruit",
        name: "Chorus Fruit",
        nutrition: 4,
        saturation: 2.4,
        isChorusFruit: true,
    },
};

export interface FoodLocation {
    location: "offhand" | "inventory";
    slotIndex?: number;
    equipmentSlot?: EquipmentSlot;
    food: FoodItemInfo;
}

interface ActiveEatingSession {
    foodLoc: FoodLocation;
    startTick: number;
    totalTicks: number;
    intervalId: number;
    isEmergency: boolean;
}

// Active eating sessions undergoing progressive consumption
const activeEatingSessions = new Map<string, ActiveEatingSession>();

// Map tracking last tick when a player completed auto-eating to enforce cooldowns
const lastEatTicks = new Map<string, number>();

/**
 * Calculates priority score for non-emergency food selection.
 * Higher score = eaten first.
 */
function getFoodScore(food: FoodItemInfo): number {
    return food.nutrition * 2 + food.saturation;
}

/**
 * Renders a visual progress bar for HUD display.
 */
function renderProgressBar(current: number, total: number): string {
    const barLength = 8;
    const filled = Math.min(barLength, Math.max(0, Math.round((current / total) * barLength)));
    const empty = barLength - filled;
    return `§e[§a${"■".repeat(filled)}§7${"□".repeat(empty)}§e]§r`;
}

/**
 * Triggers the vanilla humanoid eating pose / arm raise animation.
 */
function triggerArmEatingAnimation(player: Player): void {
    if (!AutoEatConfig.playArmAnimation) return;
    try {
        player.playAnimation("animation.humanoid.holding_brush", { blendOutTime: 0.2 });
    } catch {
        try {
            player.playAnimation("animation.humanoid.tooting_goat_horn", { blendOutTime: 0.2 });
        } catch {
            // Fallback
        }
    }
}

/**
 * Verifies whether the targeted food item is still available at its original location.
 */
function verifyFoodAvailable(player: Player, foodLoc: FoodLocation): boolean {
    try {
        if (foodLoc.location === "offhand") {
            const equippable = player.getComponent(EntityComponentTypes.Equippable);
            const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
            return offhand?.typeId === foodLoc.food.id && offhand.amount > 0;
        } else if (foodLoc.location === "inventory" && foodLoc.slotIndex !== undefined) {
            const invComp = player.getComponent(EntityComponentTypes.Inventory);
            const item = invComp?.container?.getItem(foodLoc.slotIndex);
            return item?.typeId === foodLoc.food.id && item.amount > 0;
        }
    } catch {
        // Fallback
    }
    return false;
}

/**
 * Cancels an active eating session, clears intervals, and removes movement slowdown.
 */
export function cancelEatingSession(player: Player): void {
    const session = activeEatingSessions.get(player.id);
    if (!session) return;

    try {
        system.clearRun(session.intervalId);
    } catch {
        // Ignore
    }

    activeEatingSessions.delete(player.id);

    try {
        if (player.isValid && AutoEatConfig.applyEatingSlowdown) {
            player.removeEffect("slowness");
        }
    } catch {
        // Ignore
    }
}

/**
 * Searches player's offhand, hotbar, and backpack for the best eligible food item.
 */
export function findBestFood(player: Player, isEmergency: boolean): FoodLocation | undefined {
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable);
        const invComp = player.getComponent(EntityComponentTypes.Inventory);
        const container = invComp?.container;

        // 1. Emergency Golden Apple search (Enchanted Golden Apple > Golden Apple)
        if (isEmergency) {
            // Check offhand
            if (equippable) {
                const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
                if (offhand) {
                    const info = FOOD_DATABASE[offhand.typeId];
                    if (info?.isEnchantedGoldenApple || info?.isGoldenApple) {
                        return { location: "offhand", equipmentSlot: EquipmentSlot.Offhand, food: info };
                    }
                }
            }

            // Check inventory (hotbar first, then backpack)
            if (container) {
                let bestGolden: FoodLocation | undefined;
                for (let i = 0; i < container.size; i++) {
                    const item = container.getItem(i);
                    if (!item) continue;
                    const info = FOOD_DATABASE[item.typeId];
                    if (!info) continue;

                    if (info.isEnchantedGoldenApple) {
                        return { location: "inventory", slotIndex: i, food: info };
                    }
                    if (info.isGoldenApple && !bestGolden) {
                        bestGolden = { location: "inventory", slotIndex: i, food: info };
                    }
                }
                if (bestGolden) return bestGolden;
            }
        }

        // 2. Offhand food prioritization
        if (AutoEatConfig.searchOffhand && equippable) {
            const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
            if (offhand) {
                const info = FOOD_DATABASE[offhand.typeId];
                if (info) {
                    if (AutoEatConfig.excludeHarmfulFoods && info.isHarmful) {
                        // Exclude
                    } else if (AutoEatConfig.excludeChorusFruit && info.isChorusFruit) {
                        // Exclude
                    } else {
                        return { location: "offhand", equipmentSlot: EquipmentSlot.Offhand, food: info };
                    }
                }
            }
        }

        // 3. Inventory search (Hotbar and/or Backpack)
        if (container) {
            let bestLoc: FoodLocation | undefined;
            let bestScore = -1;

            const checkSlot = (slot: number) => {
                const item = container.getItem(slot);
                if (!item) return;

                const info = FOOD_DATABASE[item.typeId];
                if (!info) return;

                if (AutoEatConfig.excludeHarmfulFoods && info.isHarmful) return;
                if (AutoEatConfig.excludeChorusFruit && info.isChorusFruit) return;

                const score = getFoodScore(info);
                if (score > bestScore) {
                    bestScore = score;
                    bestLoc = { location: "inventory", slotIndex: slot, food: info };
                }
            };

            // Hotbar (slots 0-8)
            if (AutoEatConfig.searchHotbar) {
                for (let i = 0; i < Math.min(9, container.size); i++) {
                    checkSlot(i);
                }
            }

            // Backpack (slots 9-35)
            if (AutoEatConfig.searchBackpack) {
                for (let i = 9; i < container.size; i++) {
                    checkSlot(i);
                }
            }

            if (bestLoc) return bestLoc;
        }
    } catch {
        // Ignore
    }

    return undefined;
}

/**
 * Consumes 1 unit of food from the specified location and applies vanilla nutrition,
 * saturation, special status effects, sounds, and particles.
 */
export function consumeFood(player: Player, foodLoc: FoodLocation): void {
    if (!player || !player.isValid) return;

    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable);
        const invComp = player.getComponent(EntityComponentTypes.Inventory);
        const container = invComp?.container;
        const food = foodLoc.food;

        // 1. Deduct 1 food item from source
        if (foodLoc.location === "offhand" && equippable) {
            const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
            if (!offhand || offhand.typeId !== food.id) return;
            if (offhand.amount > 1) {
                offhand.amount -= 1;
                equippable.setEquipment(EquipmentSlot.Offhand, offhand);
            } else {
                equippable.setEquipment(EquipmentSlot.Offhand, undefined);
            }
        } else if (foodLoc.location === "inventory" && container && foodLoc.slotIndex !== undefined) {
            const item = container.getItem(foodLoc.slotIndex);
            if (!item || item.typeId !== food.id) return;
            if (item.amount > 1) {
                item.amount -= 1;
                container.setItem(foodLoc.slotIndex, item);
            } else {
                container.setItem(foodLoc.slotIndex, undefined);
            }
        }

        // 2. Restore hunger points
        let hungerRestored = false;
        try {
            const hunger = player.getComponent("minecraft:player.hunger") as EntityHungerComponent | undefined;
            if (hunger) {
                const target = Math.min(20, Math.max(0, hunger.currentValue + food.nutrition));
                hunger.setCurrentValue(target);
                hungerRestored = true;
            }
        } catch {
            // Ignore direct attribute error
        }

        // Fallback saturation effect if hunger component cannot be written directly
        if (!hungerRestored) {
            try {
                const amp = Math.max(0, Math.min(3, Math.floor(food.nutrition / 2)));
                player.addEffect("saturation", 1, { amplifier: amp, showParticles: false });
            } catch {
                // Ignore
            }
        }

        // 3. Grant saturation (drives natural health regeneration)
        if (food.saturation > 0) {
            try {
                const satAmp = Math.max(0, Math.min(2, Math.floor(food.saturation / 4)));
                player.addEffect("saturation", 1, { amplifier: satAmp, showParticles: false });
            } catch {
                // Ignore
            }
        }

        // 4. Special food effects
        if (food.isEnchantedGoldenApple) {
            try {
                player.addEffect("regeneration", 600, { amplifier: 4, showParticles: true }); // Regen V (30s)
                player.addEffect("absorption", 2400, { amplifier: 3, showParticles: true }); // Absorption IV (2m)
                player.addEffect("resistance", 6000, { amplifier: 0, showParticles: true }); // Resistance (5m)
                player.addEffect("fire_resistance", 6000, { amplifier: 0, showParticles: true }); // Fire Res (5m)
            } catch {
                // Ignore
            }
        } else if (food.isGoldenApple) {
            try {
                player.addEffect("regeneration", 100, { amplifier: 1, showParticles: true }); // Regen II (5s)
                player.addEffect("absorption", 2400, { amplifier: 0, showParticles: true }); // Absorption I (2m)
            } catch {
                // Ignore
            }
        } else if (food.curesPoison) {
            try {
                player.removeEffect("poison");
                player.removeEffect("fatal_poison");
            } catch {
                // Ignore
            }
        }

        // 5. Container return (empty wooden bowl or glass bottle)
        if (food.returnsItem && AutoEatConfig.returnContainers) {
            try {
                const returnStack = new ItemStack(food.returnsItem, 1);
                let added = false;
                if (container) {
                    const leftover = container.addItem(returnStack);
                    if (!leftover) added = true;
                }
                if (!added) {
                    player.dimension.spawnItem(returnStack, player.location);
                }
            } catch {
                // Ignore
            }
        }

        // 6. Sound effects
        if (AutoEatConfig.playSounds) {
            try {
                if (!AutoEatConfig.useVanillaEatingAnimation) {
                    player.dimension.playSound("random.eat", player.location, {
                        volume: 0.8,
                        pitch: 0.95 + Math.random() * 0.1,
                    });
                }
                player.dimension.playSound("random.burp", player.location, { volume: 0.8, pitch: 1.0 });
            } catch {
                // Ignore
            }
        }

        // 7. Visual particles
        if (AutoEatConfig.showParticles) {
            try {
                const loc = player.location;
                player.dimension.spawnParticle("minecraft:crop_growth_emitter", {
                    x: loc.x,
                    y: loc.y + 1.2,
                    z: loc.z,
                });
            } catch {
                // Ignore
            }
        }

        // 8. Notification HUD
        if (AutoEatConfig.showNotification) {
            showPlayerNotification(player, `§a✔ Finished Eating ${food.name}!§r`);
        }

        // Record cooldown
        lastEatTicks.set(player.id, system.currentTick);
    } catch {
        // Ignore
    }
}

/**
 * Initiates a realistic, vanilla-paced eating session with progressive chewing,
 * visual arm animation, particles, sounds, and movement balancing.
 */
export function startEatingSession(player: Player, foodLoc: FoodLocation, isEmergency: boolean): void {
    if (activeEatingSessions.has(player.id)) return;

    const totalTicks = Math.max(4, AutoEatConfig.eatDurationTicks);
    const startTick = system.currentTick;
    let elapsedTicks = 0;

    // Apply movement slowdown for the duration of eating (balancing against sprinting)
    if (AutoEatConfig.applyEatingSlowdown) {
        try {
            player.addEffect("slowness", totalTicks + 6, {
                amplifier: AutoEatConfig.slowdownAmplifier,
                showParticles: false,
            });
        } catch {
            // Ignore
        }
    }

    // Trigger initial arm eating animation
    triggerArmEatingAnimation(player);

    // Initial crunch sound & particles
    if (AutoEatConfig.playSounds) {
        try {
            player.dimension.playSound("random.eat", player.location, {
                volume: 0.8,
                pitch: 0.95 + Math.random() * 0.1,
            });
        } catch {
            // Ignore
        }
    }

    if (AutoEatConfig.showParticles) {
        try {
            const loc = player.location;
            player.dimension.spawnParticle("minecraft:crop_growth_emitter", {
                x: loc.x,
                y: loc.y + 1.2,
                z: loc.z,
            });
        } catch {
            // Ignore
        }
    }

    // Display initial HUD progress bar
    if (AutoEatConfig.showProgressBar) {
        showPlayerNotification(player, `§e🍖 Eating ${foodLoc.food.name}... ${renderProgressBar(0, totalTicks)}§r`, 400);
    }

    // Progressive chewing loop running every 4 ticks
    const intervalId = system.runInterval(() => {
        elapsedTicks += 4;

        // 1. Validate player existence and validity
        if (!player || !player.isValid) {
            system.clearRun(intervalId);
            activeEatingSessions.delete(player.id);
            return;
        }

        // 2. Validate game mode
        try {
            const gm = player.getGameMode();
            if (gm === GameMode.Creative || gm === GameMode.Spectator) {
                cancelEatingSession(player);
                return;
            }
        } catch {
            // Ignore
        }

        // 3. Validate food item is still available
        if (!verifyFoodAvailable(player, foodLoc)) {
            cancelEatingSession(player);
            return;
        }

        // 4. In-progress chewing step
        if (elapsedTicks < totalTicks) {
            if (AutoEatConfig.playSounds) {
                try {
                    player.dimension.playSound("random.eat", player.location, {
                        volume: 0.8,
                        pitch: 0.95 + Math.random() * 0.1,
                    });
                } catch {
                    // Ignore
                }
            }

            if (AutoEatConfig.showParticles) {
                try {
                    const loc = player.location;
                    player.dimension.spawnParticle("minecraft:crop_growth_emitter", {
                        x: loc.x,
                        y: loc.y + 1.2,
                        z: loc.z,
                    });
                } catch {
                    // Ignore
                }
            }

            if (elapsedTicks % 8 === 0) {
                triggerArmEatingAnimation(player);
            }

            if (AutoEatConfig.showProgressBar) {
                showPlayerNotification(
                    player,
                    `§e🍖 Eating ${foodLoc.food.name}... ${renderProgressBar(elapsedTicks, totalTicks)}§r`,
                    300
                );
            }
        } else {
            // 5. Eating finished: consume food, restore hunger, and clean up
            system.clearRun(intervalId);
            activeEatingSessions.delete(player.id);

            // Remove movement slowdown
            try {
                if (AutoEatConfig.applyEatingSlowdown) {
                    player.removeEffect("slowness");
                }
            } catch {
                // Ignore
            }

            // Finalize food consumption
            consumeFood(player, foodLoc);
        }
    }, 4);

    activeEatingSessions.set(player.id, {
        foodLoc,
        startTick,
        totalTicks,
        intervalId,
        isEmergency,
    });
}

/**
 * Evaluates whether a player should auto-eat and initiates a progressive eating session if eligible.
 */
export function tryAutoEat(player: Player, isEmergency: boolean = false): boolean {
    if (!AutoEatConfig.enabled) return false;
    if (!player || !player.isValid) return false;

    // Creative or Spectator check
    try {
        const gm = player.getGameMode();
        if (gm === GameMode.Creative || gm === GameMode.Spectator) return false;
    } catch {
        // Fallback
    }

    // Check if player is already in an active eating session
    if (activeEatingSessions.has(player.id)) {
        return false;
    }

    // Cooldown check (matches configured delay between bites)
    const lastTick = lastEatTicks.get(player.id) ?? -999;
    if (system.currentTick - lastTick < AutoEatConfig.eatDelayTicks) {
        return false;
    }

    // Read Health
    const healthComp = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
    const currentHealth = healthComp?.currentValue ?? 20;
    const maxHealth = healthComp?.effectiveMax ?? 20;

    // Read Hunger
    const hungerComp = player.getComponent("minecraft:player.hunger") as EntityHungerComponent | undefined;
    const currentHunger = hungerComp?.currentValue ?? 20;

    // Determine if eating is needed
    let shouldEat = false;
    let emergency = isEmergency;

    // Condition A: Critical health emergency (Golden Apple)
    if (AutoEatConfig.emergencyGoldenApple && currentHealth <= AutoEatConfig.emergencyHealthThreshold) {
        emergency = true;
        shouldEat = true;
    }

    // Condition B: Injured player needs natural healing saturation (requires hunger >= 18)
    if (!shouldEat && currentHealth < maxHealth && currentHunger <= AutoEatConfig.injuredHungerThreshold) {
        shouldEat = true;
    }

    // Condition C: Normal hunger threshold reached
    if (!shouldEat && currentHunger <= AutoEatConfig.hungerThreshold) {
        shouldEat = true;
    }

    // Golden apples can be consumed at full hunger; standard food cannot
    if (!emergency && currentHunger >= 20) {
        return false;
    }

    if (!shouldEat) return false;

    const foodLoc = findBestFood(player, emergency);
    if (!foodLoc) return false;

    if (AutoEatConfig.useVanillaEatingAnimation) {
        startEatingSession(player, foodLoc, emergency);
    } else {
        triggerArmEatingAnimation(player);
        consumeFood(player, foodLoc);
    }
    return true;
}

/**
 * Initializes the Auto Eat feature.
 */
export function initAutoEatFeature(): void {
    if (!AutoEatConfig.enabled) return;

    // 1. Periodic check loop (runs every 10 ticks = 0.5s)
    system.runInterval(() => {
        if (!AutoEatConfig.enabled) return;

        const players = Array.from(world.getAllPlayers());
        for (const player of players) {
            tryAutoEat(player, false);
        }
    }, 10);

    // 2. Immediate hurt trigger for emergency Golden Apple consumption
    world.afterEvents.entityHurt.subscribe((event) => {
        if (!AutoEatConfig.enabled || !AutoEatConfig.emergencyGoldenApple) return;
        if (event.hurtEntity.typeId !== "minecraft:player") return;

        const player = event.hurtEntity as Player;
        if (!player || !player.isValid) return;

        const healthComp = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
        if (healthComp && healthComp.currentValue <= AutoEatConfig.emergencyHealthThreshold) {
            tryAutoEat(player, true);
        }
    });

    // 3. Clean up active eating sessions and tracking on death, spawn, and leave
    world.afterEvents.entityDie.subscribe((event) => {
        if (event.deadEntity.typeId === "minecraft:player") {
            cancelEatingSession(event.deadEntity as Player);
        }
    });

    world.afterEvents.playerSpawn.subscribe((event) => {
        cancelEatingSession(event.player);
    });

    world.beforeEvents.playerLeave.subscribe((event) => {
        cancelEatingSession(event.player);
        lastEatTicks.delete(event.player.id);
    });
}
