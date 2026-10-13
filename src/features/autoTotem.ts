import {
    EntityComponentTypes,
    EntityDamageSource,
    EntityHealthComponent,
    EntityHurtBeforeEvent,
    EquipmentSlot,
    ItemStack,
    Player,
    system,
    Vector3,
    world,
} from "@minecraft/server";
import { AutoTotemConfig } from "../config";
import { showPlayerNotification } from "../utils/notifications";

interface TotemLocation {
    location: "offhand" | "mainhand" | "inventory";
    slotIndex?: number;
    equipmentSlot?: EquipmentSlot;
}

/**
 * Searches the player's offhand, mainhand, hotbar, and entire backpack for a Totem of Undying.
 */
export function findTotem(player: Player): TotemLocation | undefined {
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable);
        if (equippable) {
            // 1. Offhand
            const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
            if (offhand && offhand.typeId === "minecraft:totem_of_undying") {
                return { location: "offhand", equipmentSlot: EquipmentSlot.Offhand };
            }

            // 2. Mainhand
            const mainhand = equippable.getEquipment(EquipmentSlot.Mainhand);
            if (mainhand && mainhand.typeId === "minecraft:totem_of_undying") {
                return { location: "mainhand", equipmentSlot: EquipmentSlot.Mainhand };
            }
        }

        // 3. Hotbar & Backpack (all inventory slots 0-35)
        const invComp = player.getComponent(EntityComponentTypes.Inventory);
        if (invComp && invComp.container) {
            const container = invComp.container;
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item && item.typeId === "minecraft:totem_of_undying") {
                    return { location: "inventory", slotIndex: i };
                }
            }
        }
    } catch {
        // Ignore
    }

    return undefined;
}


/**
 * Merges loose Totems of Undying in the player's inventory into clean stacks up to maxStackSize (64).
 */
export function mergeInventoryTotems(player: Player): boolean {
    if (!AutoTotemConfig.stackableTotems) return false;

    try {
        const invComp = player.getComponent(EntityComponentTypes.Inventory);
        if (!invComp || !invComp.container) return false;

        const container = invComp.container;
        const maxStack = Math.min(64, Math.max(1, AutoTotemConfig.maxStackSize));

        const totemSlots: { slot: number; amount: number }[] = [];
        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i);
            if (item && item.typeId === "minecraft:totem_of_undying") {
                totemSlots.push({ slot: i, amount: item.amount });
            }
        }

        // If no totems or only 1 stack within limit, no merge needed
        if (totemSlots.length <= 1 && (totemSlots.length === 0 || totemSlots[0].amount <= maxStack)) {
            return false;
        }

        let totalTotems = totemSlots.reduce((sum, s) => sum + s.amount, 0);
        let changed = false;

        for (const s of totemSlots) {
            if (totalTotems <= 0) {
                container.setItem(s.slot, undefined);
                changed = true;
            } else {
                const stackAmount = Math.min(totalTotems, maxStack);
                const current = container.getItem(s.slot);
                if (!current || current.amount !== stackAmount) {
                    container.setItem(s.slot, new ItemStack("minecraft:totem_of_undying", stackAmount));
                    changed = true;
                }
                totalTotems -= stackAmount;
            }
        }

        return changed;
    } catch {
        return false;
    }
}

/**
 * Executes full vanilla Totem of Undying activation effects on the player.
 */
function activateTotemEffects(player: Player, totemLoc: TotemLocation): void {
    if (!player || !player.isValid) return;
    try {
        const equippable = player.getComponent(EntityComponentTypes.Equippable);
        const invComp = player.getComponent(EntityComponentTypes.Inventory);

        // 1. Consume 1 Totem of Undying from the exact slot where it was found
        if (totemLoc.location === "offhand" && equippable) {
            const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
            if (offhand) {
                if (offhand.amount > 1) {
                    offhand.amount -= 1;
                    equippable.setEquipment(EquipmentSlot.Offhand, offhand);
                } else {
                    equippable.setEquipment(EquipmentSlot.Offhand, undefined);
                }
            }
        } else if (totemLoc.location === "mainhand" && equippable) {
            const mainhand = equippable.getEquipment(EquipmentSlot.Mainhand);
            if (mainhand) {
                if (mainhand.amount > 1) {
                    mainhand.amount -= 1;
                    equippable.setEquipment(EquipmentSlot.Mainhand, mainhand);
                } else {
                    equippable.setEquipment(EquipmentSlot.Mainhand, undefined);
                }
            }
        } else if (totemLoc.location === "inventory" && invComp && invComp.container && totemLoc.slotIndex !== undefined) {
            const container = invComp.container;
            const item = container.getItem(totemLoc.slotIndex);
            if (item) {
                if (item.amount > 1) {
                    item.amount -= 1;
                    container.setItem(totemLoc.slotIndex, item);
                } else {
                    container.setItem(totemLoc.slotIndex, undefined);
                }
            }
        }

        // 2. Reset player health
        const healthComp = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
        if (healthComp) {
            healthComp.setCurrentValue(4.0); // 2 hearts (standard vanilla totem revive)
        }

        // 3. Clear all negative status effects
        const negativeEffects = [
            "wither",
            "poison",
            "fatal_poison",
            "slowness",
            "weakness",
            "mining_fatigue",
            "blindness",
            "nausea",
            "darkness",
            "hunger",
        ];
        for (const effect of negativeEffects) {
            try {
                player.removeEffect(effect);
            } catch {
                // Ignore
            }
        }

        // 4. Extinguish fire
        try {
            player.extinguishFire();
        } catch {
            // Ignore
        }

        // 5. Grant vanilla totem status effects
        try {
            player.addEffect("regeneration", 900, { amplifier: 1, showParticles: true }); // Regen II (45s)
            player.addEffect("absorption", 100, { amplifier: 1, showParticles: true }); // Absorption II (5s)
            player.addEffect("fire_resistance", 800, { amplifier: 0, showParticles: true }); // Fire Resistance (40s)
        } catch {
            // Ignore
        }

        // 6. Audio and particle feedback
        try {
            const loc = player.location;
            player.dimension.playSound("random.totem", loc, { volume: 1.0, pitch: 1.0 });
            player.dimension.spawnParticle("minecraft:totem_particle", {
                x: loc.x,
                y: loc.y + 1,
                z: loc.z,
            });
            player.dimension.spawnParticle("minecraft:totem_manual", {
                x: loc.x,
                y: loc.y + 1,
                z: loc.z,
            });
        } catch {
            // Ignore
        }

        // 7. Void Rescue (if fatal damage occurred below Y = -60)
        if (AutoTotemConfig.voidRescue && player.location.y < -60) {
            const safeY = Math.max(64, Math.floor(player.location.y + 120));
            player.teleport({
                x: player.location.x,
                y: safeY,
                z: player.location.z,
            });
            player.addEffect("slow_falling", 200, { amplifier: 0, showParticles: false });
        }

        // 8. Player notification
        if (AutoTotemConfig.notifyPlayer) {
            const slotName =
                totemLoc.location === "inventory"
                    ? "Backpack / Hotbar"
                    : totemLoc.location === "offhand"
                    ? "Offhand"
                    : "Main Hand";
            showPlayerNotification(player, `§e✨ Totem of Undying Activated from ${slotName}! ✨§r`);
            player.sendMessage(`§e[Auto Totem]§r §aCheated death using a Totem from your ${slotName}!§r`);
        }
    } catch {
        // Ignore
    }
}

/**
 * Initializes the Auto Totem feature.
 */
export function initAutoTotemFeature(): void {
    if (!AutoTotemConfig.enabled) return;

    // Intercept fatal damage before player death
    world.beforeEvents.entityHurt.subscribe((event: EntityHurtBeforeEvent) => {
        if (!AutoTotemConfig.enabled) return;
        if (event.hurtEntity.typeId !== "minecraft:player") return;

        const player = event.hurtEntity as Player;
        if (!player || !player.isValid) return;

        const healthComp = player.getComponent(EntityComponentTypes.Health) as EntityHealthComponent | undefined;
        if (!healthComp) return;

        const currentHealth = healthComp.currentValue;

        // Check if incoming damage will deal fatal damage
        if (event.damage < currentHealth && currentHealth > 0) {
            return;
        }

        // Check for Totem anywhere in offhand, mainhand, hotbar, or backpack
        const totemLoc = findTotem(player);
        if (!totemLoc) {
            return; // No totem available
        }

        // Prevent fatal damage
        event.cancel = true;

        // Execute totem revival effects on the next tick
        system.run(() => {
            activateTotemEffects(player, totemLoc);
        });
    });

    // 2. Inventory totem stacking loop (checks every 20 ticks = 1 second)
    system.runInterval(() => {
        const players = Array.from(world.getAllPlayers());
        for (const player of players) {
            if (!player || !player.isValid) continue;
            if (AutoTotemConfig.stackableTotems) {
                mergeInventoryTotems(player);
            }
        }
    }, 20);

    // 3. Manual sneak-use to instantly consolidate totems
    world.afterEvents.itemUse.subscribe((event) => {
        if (!AutoTotemConfig.stackableTotems) return;
        if (event.itemStack.typeId !== "minecraft:totem_of_undying") return;

        const player = event.source;
        if (!player || !player.isValid) return;

        if (player.isSneaking) {
            const merged = mergeInventoryTotems(player);
            if (merged) {
                try {
                    player.dimension.playSound("chime.amethyst_block", player.location, { volume: 0.8, pitch: 1.2 });
                    showPlayerNotification(player, "§e✨ Totems Consolidated into Stacks! ✨§r");
                } catch {
                    // Ignore
                }
            }
        }
    });
}

