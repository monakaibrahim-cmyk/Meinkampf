import {
    EntityComponentTypes,
    EntityEquippableComponent,
    EntityHealthComponent,
    EntityInventoryComponent,
    EquipmentSlot,
    ItemComponentTypes,
    ItemPotionComponent,
    ItemStack,
    Player,
    system,
    world,
} from "@minecraft/server";
import { PassivePotionConfig } from "../config";

interface PotionBuffDefinition {
    effectType: string;
    amplifier: number;
    isHealing?: boolean;
}

/**
 * Standard vanilla mapping from potion effect types to entity status effect IDs and amplifiers.
 */
const POSITIVE_POTION_MAP: Record<string, PotionBuffDefinition> = {
    // Swiftness -> Speed
    "minecraft:swiftness": { effectType: "minecraft:speed", amplifier: 0 },
    "minecraft:long_swiftness": { effectType: "minecraft:speed", amplifier: 0 },
    "minecraft:strong_swiftness": { effectType: "minecraft:speed", amplifier: 1 },

    // Leaping -> Jump Boost
    "minecraft:leaping": { effectType: "minecraft:jump_boost", amplifier: 0 },
    "minecraft:long_leaping": { effectType: "minecraft:jump_boost", amplifier: 0 },
    "minecraft:strong_leaping": { effectType: "minecraft:jump_boost", amplifier: 1 },

    // Strength
    "minecraft:strength": { effectType: "minecraft:strength", amplifier: 0 },
    "minecraft:long_strength": { effectType: "minecraft:strength", amplifier: 0 },
    "minecraft:strong_strength": { effectType: "minecraft:strength", amplifier: 1 },

    // Regeneration
    "minecraft:regeneration": { effectType: "minecraft:regeneration", amplifier: 0 },
    "minecraft:long_regeneration": { effectType: "minecraft:regeneration", amplifier: 0 },
    "minecraft:strong_regeneration": { effectType: "minecraft:regeneration", amplifier: 1 },

    // Fire Resistance
    "minecraft:fire_resistance": { effectType: "minecraft:fire_resistance", amplifier: 0 },
    "minecraft:long_fire_resistance": { effectType: "minecraft:fire_resistance", amplifier: 0 },

    // Water Breathing
    "minecraft:water_breathing": { effectType: "minecraft:water_breathing", amplifier: 0 },
    "minecraft:long_water_breathing": { effectType: "minecraft:water_breathing", amplifier: 0 },

    // Night Vision
    "minecraft:nightvision": { effectType: "minecraft:night_vision", amplifier: 0 },
    "minecraft:long_nightvision": { effectType: "minecraft:night_vision", amplifier: 0 },
    "minecraft:night_vision": { effectType: "minecraft:night_vision", amplifier: 0 },
    "minecraft:long_night_vision": { effectType: "minecraft:night_vision", amplifier: 0 },

    // Invisibility
    "minecraft:invisibility": { effectType: "minecraft:invisibility", amplifier: 0 },
    "minecraft:long_invisibility": { effectType: "minecraft:invisibility", amplifier: 0 },

    // Slow Falling
    "minecraft:slow_falling": { effectType: "minecraft:slow_falling", amplifier: 0 },
    "minecraft:long_slow_falling": { effectType: "minecraft:slow_falling", amplifier: 0 },

    // Turtle Master -> Resistance (provides high resistance without penalizing slowness)
    "minecraft:turtle_master": { effectType: "minecraft:resistance", amplifier: 2 },
    "minecraft:long_turtle_master": { effectType: "minecraft:resistance", amplifier: 2 },
    "minecraft:strong_turtle_master": { effectType: "minecraft:resistance", amplifier: 3 },

    // Wind Charged
    "minecraft:wind_charged": { effectType: "minecraft:wind_charged", amplifier: 0 },

    // Healing (handled via periodic health restoration)
    "minecraft:healing": { effectType: "minecraft:instant_health", amplifier: 0, isHealing: true },
    "minecraft:strong_healing": { effectType: "minecraft:instant_health", amplifier: 1, isHealing: true },
};

/**
 * Valid potion item type IDs in Minecraft Bedrock.
 */
const POTION_ITEM_TYPES = new Set([
    "minecraft:potion",
    "minecraft:splash_potion",
    "minecraft:lingering_potion",
]);

/**
 * Extracts positive potion buff definition from an ItemStack if applicable.
 */
export function getPositiveBuffFromItem(item?: ItemStack): PotionBuffDefinition | undefined {
    if (!item) return undefined;

    // Check if it's a potion type item or has a potion component
    const isPotionType = POTION_ITEM_TYPES.has(item.typeId);

    // 1. Try to read native ItemPotionComponent
    try {
        const potionComp = item.getComponent("minecraft:potion") as ItemPotionComponent | undefined;
        if (potionComp && potionComp.potionEffectType) {
            const effectId = potionComp.potionEffectType.id;
            if (effectId) {
                const normalized = effectId.startsWith("minecraft:") ? effectId : `minecraft:${effectId}`;
                const buff = POSITIVE_POTION_MAP[normalized];
                if (buff) return buff;
            }
        }
    } catch {
        // Native property safety
    }

    // 2. Name-based fallback for custom/renamed potion items
    if (isPotionType && item.nameTag) {
        const nameLower = item.nameTag.toLowerCase();
        const isStrong = nameLower.includes(" ii") || nameLower.includes(" 2");

        if (nameLower.includes("swiftness") || nameLower.includes("speed")) {
            return { effectType: "minecraft:speed", amplifier: isStrong ? 1 : 0 };
        }
        if (nameLower.includes("leaping") || nameLower.includes("jump")) {
            return { effectType: "minecraft:jump_boost", amplifier: isStrong ? 1 : 0 };
        }
        if (nameLower.includes("strength")) {
            return { effectType: "minecraft:strength", amplifier: isStrong ? 1 : 0 };
        }
        if (nameLower.includes("regeneration") || nameLower.includes("regen")) {
            return { effectType: "minecraft:regeneration", amplifier: isStrong ? 1 : 0 };
        }
        if (nameLower.includes("fire resistance")) {
            return { effectType: "minecraft:fire_resistance", amplifier: 0 };
        }
        if (nameLower.includes("water breathing")) {
            return { effectType: "minecraft:water_breathing", amplifier: 0 };
        }
        if (nameLower.includes("night vision")) {
            return { effectType: "minecraft:night_vision", amplifier: 0 };
        }
        if (nameLower.includes("invisibility")) {
            return { effectType: "minecraft:invisibility", amplifier: 0 };
        }
        if (nameLower.includes("slow falling")) {
            return { effectType: "minecraft:slow_falling", amplifier: 0 };
        }
        if (nameLower.includes("turtle master") || nameLower.includes("resistance")) {
            return { effectType: "minecraft:resistance", amplifier: isStrong ? 3 : 2 };
        }
        if (nameLower.includes("healing") || nameLower.includes("health")) {
            return { effectType: "minecraft:instant_health", amplifier: isStrong ? 1 : 0, isHealing: true };
        }
    }

    return undefined;
}

/**
 * Tracks the last tick each player received a periodic passive heal.
 */
const lastHealTickMap = new Map<string, number>();

/**
 * Scans a player's inventory, hotbar, mainhand, and offhand for positive buff potions
 * and applies the highest tier buff for each effect.
 */
function updatePlayerPotionBuffs(player: Player, currentTick: number): void {
    if (!player.isValid) return;

    // Collect highest amplifier for each positive effect
    const positiveEffects = new Map<string, number>();
    let highestHealingAmplifier: number | undefined;

    // 1. Scan Inventory & Hotbar
    if (PassivePotionConfig.includeInventory || PassivePotionConfig.includeHotbar) {
        try {
            const invComp = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
            if (invComp && invComp.container) {
                const container = invComp.container;
                for (let i = 0; i < container.size; i++) {
                    const isHotbarSlot = i < 9;
                    if (isHotbarSlot && !PassivePotionConfig.includeHotbar) continue;
                    if (!isHotbarSlot && !PassivePotionConfig.includeInventory) continue;

                    const item = container.getItem(i);
                    if (!item) continue;

                    const buff = getPositiveBuffFromItem(item);
                    if (!buff) continue;

                    if (buff.isHealing) {
                        highestHealingAmplifier = Math.max(highestHealingAmplifier ?? -1, buff.amplifier);
                    } else {
                        const existingAmp = positiveEffects.get(buff.effectType);
                        if (existingAmp === undefined || buff.amplifier > existingAmp) {
                            positiveEffects.set(buff.effectType, buff.amplifier);
                        }
                    }
                }
            }
        } catch {
            // Container access safety
        }
    }

    // 2. Scan Offhand & Mainhand
    if (PassivePotionConfig.includeOffhand) {
        try {
            const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
            if (equippable) {
                const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
                const offhandBuff = getPositiveBuffFromItem(offhand);
                if (offhandBuff) {
                    if (offhandBuff.isHealing) {
                        highestHealingAmplifier = Math.max(highestHealingAmplifier ?? -1, offhandBuff.amplifier);
                    } else {
                        const existingAmp = positiveEffects.get(offhandBuff.effectType);
                        if (existingAmp === undefined || offhandBuff.amplifier > existingAmp) {
                            positiveEffects.set(offhandBuff.effectType, offhandBuff.amplifier);
                        }
                    }
                }
            }
        } catch {
            // Equippable access safety
        }
    }

    // 3. Apply continuous positive buffs
    for (const [effectType, amplifier] of positiveEffects.entries()) {
        try {
            const existing = player.getEffect(effectType);
            if (!existing) {
                // Apply fresh buff
                player.addEffect(effectType, PassivePotionConfig.buffDurationTicks, {
                    amplifier,
                    showParticles: PassivePotionConfig.showParticles,
                });
            } else if (existing.amplifier < amplifier) {
                // Upgrade to higher tier
                player.addEffect(effectType, PassivePotionConfig.buffDurationTicks, {
                    amplifier,
                    showParticles: PassivePotionConfig.showParticles,
                });
            } else if (existing.amplifier === amplifier) {
                // Refresh if close to expiring (do not truncate long drank potions > 60 ticks)
                if (existing.duration <= 60) {
                    player.addEffect(effectType, PassivePotionConfig.buffDurationTicks, {
                        amplifier,
                        showParticles: PassivePotionConfig.showParticles,
                    });
                }
            }
        } catch {
            // Effect apply safety
        }
    }

    // 4. Handle passive Healing potion pulse
    if (highestHealingAmplifier !== undefined) {
        try {
            const lastHeal = lastHealTickMap.get(player.id) ?? 0;
            if (currentTick - lastHeal >= PassivePotionConfig.healingIntervalTicks) {
                const healthComp = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
                if (healthComp && healthComp.currentValue < healthComp.effectiveMax) {
                    player.addEffect("minecraft:instant_health", 1, {
                        amplifier: highestHealingAmplifier,
                        showParticles: PassivePotionConfig.showParticles,
                    });
                    lastHealTickMap.set(player.id, currentTick);
                }
            }
        } catch {
            // Health component safety
        }
    }
}

/**
 * Initializes the passive potion buffs feature.
 */
export function initPassivePotionsFeature(): void {
    if (!PassivePotionConfig.enabled) {
        console.warn("[PassivePotions] Feature is disabled in config.");
        return;
    }

    let currentTick = 0;
    system.runInterval(() => {
        currentTick += PassivePotionConfig.checkIntervalTicks;
        try {
            const players = world.getAllPlayers();
            for (const player of players) {
                updatePlayerPotionBuffs(player, currentTick);
            }
        } catch {
            // World player query safety
        }
    }, PassivePotionConfig.checkIntervalTicks);

    // Clean up cache when players leave
    world.afterEvents.playerLeave.subscribe((event) => {
        lastHealTickMap.delete(event.playerId);
    });

    console.warn("[PassivePotions] Feature initialized successfully.");
}

