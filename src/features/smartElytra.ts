import {
    world,
    system,
    Player,
    ItemStack,
    EquipmentSlot,
    EntityComponentTypes,
    EntityEquippableComponent,
    EntityInventoryComponent,
    ItemComponentTypes,
    ItemDurabilityComponent,
    GameMode,
    InputButton,
    ButtonState,
    Container,
} from "@minecraft/server";
import { SmartElytraConfig } from "../config";

interface PlayerFlightState {
    wasGliding: boolean;
    highestY: number;
    groundTicks: number;
    airborneTicks: number;
    lastSwapTick: number;
    lastSneakTime: number;
}

const playerFlightStates = new Map<string, PlayerFlightState>();

/**
 * Hierarchy tiers for standard and modded chestplates.
 * Higher tier = preferred when automatically swapping from Elytra to Armor.
 */
const CHESTPLATE_TIERS = new Map<string, number>([
    ["minecraft:netherite_chestplate", 6],
    ["minecraft:diamond_chestplate", 5],
    ["minecraft:iron_chestplate", 4],
    ["minecraft:chainmail_chestplate", 3],
    ["minecraft:golden_chestplate", 2],
    ["minecraft:leather_chestplate", 1],
]);

/**
 * Checks if an item is an Elytra.
 */
export function isElytra(item?: ItemStack): boolean {
    return item !== undefined && item.typeId === "minecraft:elytra";
}

/**
 * Checks if an item is a protective chestplate.
 */
export function isChestplate(item?: ItemStack): boolean {
    if (!item) return false;
    return CHESTPLATE_TIERS.has(item.typeId) || item.typeId.endsWith("_chestplate");
}

/**
 * Gets or creates the flight tracking state for a player.
 */
function getFlightState(playerId: string): PlayerFlightState {
    let state = playerFlightStates.get(playerId);
    if (!state) {
        state = {
            wasGliding: false,
            highestY: 0,
            groundTicks: 0,
            airborneTicks: 0,
            lastSwapTick: 0,
            lastSneakTime: 0,
        };
        playerFlightStates.set(playerId, state);
    }
    return state;
}

/**
 * Finds the highest quality chestplate in the player's inventory.
 */
function findBestChestplate(container: Container): { slot: number; item: ItemStack; tier: number } | null {
    let bestSlot = -1;
    let bestItem: ItemStack | null = null;
    let bestTier = -1;
    let bestDurability = -1;

    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (!item || !isChestplate(item)) continue;

        const tier = CHESTPLATE_TIERS.get(item.typeId) ?? 3;
        let durability = 100;
        try {
            const durComp = item.getComponent(ItemComponentTypes.Durability) as ItemDurabilityComponent;
            if (durComp) {
                durability = durComp.maxDurability - durComp.damage;
            }
        } catch {
            // Ignore
        }

        if (tier > bestTier || (tier === bestTier && durability > bestDurability)) {
            bestSlot = i;
            bestItem = item;
            bestTier = tier;
            bestDurability = durability;
        }
    }

    if (bestSlot >= 0 && bestItem) {
        return { slot: bestSlot, item: bestItem, tier: bestTier };
    }
    return null;
}

/**
 * Finds the best Elytra in the player's inventory, prioritizing unbroken pairs with higher durability.
 */
function findBestElytra(container: Container): { slot: number; item: ItemStack } | null {
    let bestSlot = -1;
    let bestItem: ItemStack | null = null;
    let bestDurability = -1;

    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (!item || !isElytra(item)) continue;

        let durability = 432;
        try {
            const durComp = item.getComponent(ItemComponentTypes.Durability) as ItemDurabilityComponent;
            if (durComp) {
                durability = durComp.maxDurability - durComp.damage;
            }
        } catch {
            // Ignore
        }

        // Prioritize Elytras that are not on the verge of breaking (durability > 1)
        if (durability > bestDurability) {
            bestSlot = i;
            bestItem = item;
            bestDurability = durability;
        }
    }

    if (bestSlot >= 0 && bestItem) {
        return { slot: bestSlot, item: bestItem };
    }
    return null;
}

/**
 * Formats a Minecraft item identifier into a human-readable display name.
 */
function formatItemName(typeId: string): string {
    const raw = typeId.replace(/^minecraft:/, "").replace(/_/g, " ");
    return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Plays the appropriate armor/elytra equip sound for the player.
 */
function playEquipSound(player: Player, typeId: string): void {
    if (!SmartElytraConfig.playSounds) return;
    try {
        if (typeId === "minecraft:elytra") {
            player.dimension.playSound("armor.equip_elytra", player.location, { volume: 0.8, pitch: 1.0 });
        } else if (typeId === "minecraft:netherite_chestplate") {
            player.dimension.playSound("armor.equip_netherite", player.location, { volume: 0.8, pitch: 1.0 });
        } else if (typeId === "minecraft:diamond_chestplate") {
            player.dimension.playSound("armor.equip_diamond", player.location, { volume: 0.8, pitch: 1.0 });
        } else if (typeId === "minecraft:leather_chestplate") {
            player.dimension.playSound("armor.equip_leather", player.location, { volume: 0.8, pitch: 1.0 });
        } else {
            player.dimension.playSound("armor.equip_generic", player.location, { volume: 0.8, pitch: 1.0 });
        }
    } catch {
        // Fallback
    }
}

/**
 * Displays an action bar notification indicating the newly equipped item.
 */
function showSwapNotification(player: Player, swappedTo: "elytra" | "chestplate", item: ItemStack): void {
    if (!SmartElytraConfig.showNotification) return;
    try {
        const displayName = item.nameTag || formatItemName(item.typeId);
        if (swappedTo === "elytra") {
            player.onScreenDisplay.setActionBar(`§6⚡ [Smart Elytra] §fEquipped §a${displayName} §7(Wings deployed)`);
        } else {
            player.onScreenDisplay.setActionBar(`§b🛡️ [Smart Elytra] §fEquipped §b${displayName} §7(Armor protected)`);
        }
    } catch {
        // Fallback
    }
}

/**
 * Swaps between the player's equipped Elytra and Chestplate in-place without inventory clutter.
 * Preserves all enchantments, custom names, durability, and lore.
 *
 * @param player Target player
 * @param target Explicit target to equip ("elytra" or "chestplate"), or undefined to toggle
 * @param silent Suppress "none found" error messages during automated background checks
 * @returns true if an item swap successfully occurred
 */
export function swapElytraAndChestplate(
    player: Player,
    target?: "elytra" | "chestplate",
    silent: boolean = false
): boolean {
    if (!player.isValid) return false;

    // Check game mode: ignore creative and spectator
    try {
        const gm = player.getGameMode();
        if (gm === GameMode.Creative || gm === GameMode.Spectator) return false;
    } catch {
        // Fallback
    }

    const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent;
    const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
    if (!equippable || !inv || !inv.container) return false;

    const container = inv.container;
    const currentChest = equippable.getEquipment(EquipmentSlot.Chest);
    const isCurrentlyWearingElytra = isElytra(currentChest);
    const isCurrentlyWearingChestplate = isChestplate(currentChest);

    // If already wearing requested target, nothing to do
    if (target === "elytra" && isCurrentlyWearingElytra) return false;
    if (target === "chestplate" && isCurrentlyWearingChestplate) return false;

    const shouldEquipChestplate = target === "chestplate" || (!target && isCurrentlyWearingElytra);

    if (shouldEquipChestplate) {
        // Swap to Chestplate
        const bestChestplate = findBestChestplate(container);
        if (!bestChestplate) {
            if (!silent && !target) {
                player.onScreenDisplay.setActionBar("§c[Smart Elytra] No chestplate found in inventory!");
            }
            return false;
        }

        const newChestItem = container.getItem(bestChestplate.slot);
        if (!newChestItem) return false;

        // Exchange slots: Put equipped Elytra into inventory slot, equip chestplate
        container.setItem(bestChestplate.slot, currentChest);
        equippable.setEquipment(EquipmentSlot.Chest, newChestItem);

        playEquipSound(player, newChestItem.typeId);
        showSwapNotification(player, "chestplate", newChestItem);

        const state = getFlightState(player.id);
        state.wasGliding = false;
        state.lastSwapTick = system.currentTick;
        return true;
    } else {
        // Swap to Elytra
        const bestElytra = findBestElytra(container);
        if (!bestElytra) {
            if (!silent && !target) {
                player.onScreenDisplay.setActionBar("§c[Smart Elytra] No Elytra found in inventory!");
            }
            return false;
        }

        const newElytraItem = container.getItem(bestElytra.slot);
        if (!newElytraItem) return false;

        // Exchange slots: Put equipped chestplate into inventory slot, equip Elytra
        container.setItem(bestElytra.slot, currentChest);
        equippable.setEquipment(EquipmentSlot.Chest, newElytraItem);

        playEquipSound(player, "minecraft:elytra");
        showSwapNotification(player, "elytra", newElytraItem);

        const state = getFlightState(player.id);
        state.wasGliding = true;
        state.lastSwapTick = system.currentTick;
        return true;
    }
}

/**
 * Background tick loop for smart context-aware flight and landing detection.
 * Runs every 2 ticks (10 times/sec) for optimal responsiveness and zero lag.
 */
function processSmartElytraTick(): void {
    if (!SmartElytraConfig.enabled) return;

    const currentTick = system.currentTick;
    const players = world.getAllPlayers();

    for (const player of players) {
        if (!player.isValid) continue;

        try {
            const gm = player.getGameMode();
            if (gm === GameMode.Creative || gm === GameMode.Spectator) continue;
        } catch {
            continue;
        }

        // Ignore if player is riding a mount/vehicle, climbing, or swimming
        if (
            player.isClimbing ||
            player.isSwimming ||
            player.hasComponent("minecraft:riding")
        ) {
            continue;
        }

        const state = getFlightState(player.id);
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent;
        if (!equippable) continue;

        const currentChest = equippable.getEquipment(EquipmentSlot.Chest);
        const wearingElytra = isElytra(currentChest);
        const wearingChestplate = isChestplate(currentChest);

        // 1. Broken Elytra Protection (emergency safety)
        if (wearingElytra && SmartElytraConfig.smartSwitch.brokenElytraProtection) {
            try {
                const durComp = currentChest?.getComponent(ItemComponentTypes.Durability) as ItemDurabilityComponent;
                if (durComp) {
                    const remaining = durComp.maxDurability - durComp.damage;
                    if (remaining <= 1) {
                        swapElytraAndChestplate(player, "chestplate", true);
                        player.onScreenDisplay.setActionBar("§c⚠️ [Smart Elytra] Elytra critically damaged! Swapped to chestplate.");
                        continue;
                    }
                }
            } catch {
                // Ignore
            }
        }

        // 2. Gliding status tracker
        if (player.isGliding) {
            state.wasGliding = true;
            state.groundTicks = 0;
            state.airborneTicks++;
            continue;
        }

        // 3. Ground Landing Detection (auto-equip chestplate)
        if (player.isOnGround) {
            state.airborneTicks = 0;
            state.groundTicks++;
            state.highestY = player.location.y;

            if (
                wearingElytra &&
                state.wasGliding &&
                SmartElytraConfig.smartSwitch.enabled &&
                SmartElytraConfig.smartSwitch.autoEquipChestplateOnLand
            ) {
                // Delay swap slightly to ensure safe touchdown without oscillating on low glides
                if (state.groundTicks >= SmartElytraConfig.smartSwitch.landDelayTicks) {
                    if (currentTick - state.lastSwapTick >= SmartElytraConfig.manualSwitch.cooldownTicks) {
                        swapElytraAndChestplate(player, "chestplate", true);
                    }
                }
            }
            continue;
        }

        // 4. Mid-Air Flight Activation (auto-equip Elytra)
        state.groundTicks = 0;
        state.airborneTicks++;

        if (player.location.y > state.highestY) {
            state.highestY = player.location.y;
        }
        const fallDistance = Math.max(0, state.highestY - player.location.y);

        if (
            wearingChestplate &&
            SmartElytraConfig.smartSwitch.enabled &&
            SmartElytraConfig.smartSwitch.autoEquipElytraInAir
        ) {
            if (currentTick - state.lastSwapTick < SmartElytraConfig.manualSwitch.cooldownTicks) {
                continue;
            }

            const velocity = player.getVelocity();
            const isMidairJump = player.isJumping && state.airborneTicks >= 2;
            const isFallingFast =
                velocity.y < SmartElytraConfig.smartSwitch.downwardVelocityThreshold &&
                state.airborneTicks >= 3;
            const isHighFall =
                player.isFalling &&
                fallDistance >= SmartElytraConfig.smartSwitch.minFallDistanceForElytra;

            if (isMidairJump || isFallingFast || isHighFall) {
                swapElytraAndChestplate(player, "elytra", true);
            }
        }
    }
}

/**
 * Handles physical input buttons (Sneak and Jump) across Mobile, Keyboard, and Controller.
 */
function handleButtonInput(event: { player: Player; button: InputButton; newButtonState: ButtonState }): void {
    if (!SmartElytraConfig.enabled || !SmartElytraConfig.manualSwitch.enabled) return;
    if (event.newButtonState !== ButtonState.Pressed) return;

    const player = event.player;
    if (!player || !player.isValid) return;

    const currentTick = system.currentTick;
    const state = getFlightState(player.id);
    if (currentTick - state.lastSwapTick < SmartElytraConfig.manualSwitch.cooldownTicks) return;

    const mode = SmartElytraConfig.manualSwitch.hotkeyMode;

    // A. Double-Sneak (Shift x2 on PC, Crouch x2 on Mobile/Controller)
    if (event.button === InputButton.Sneak) {
        if (mode === "all" || mode === "double_sneak") {
            const now = Date.now();
            const diff = now - state.lastSneakTime;
            if (diff > 50 && diff <= SmartElytraConfig.manualSwitch.doubleSneakWindowMs) {
                swapElytraAndChestplate(player);
                state.lastSneakTime = 0;
                return;
            }
            state.lastSneakTime = now;
        }
    }

    // B. Sneak + Jump (Shift + Space on PC, Sneak + Jump on Mobile)
    if (event.button === InputButton.Jump) {
        if (mode === "all" || mode === "sneak_jump") {
            if (player.isSneaking) {
                swapElytraAndChestplate(player);
            }
        }
    }
}

/**
 * Handles airborne firework rocket use to immediately equip Elytra for propulsion.
 */
function handleItemUse(event: { source: Player; itemStack: ItemStack }): void {
    if (!SmartElytraConfig.enabled || !SmartElytraConfig.smartSwitch.enabled) return;
    if (!SmartElytraConfig.smartSwitch.autoEquipOnFireworkUse) return;

    if (event.itemStack.typeId !== "minecraft:firework_rocket") return;

    const player = event.source;
    if (!player || !player.isValid) return;

    // Only auto-equip if player is airborne (fireworks on the ground are decorative)
    if (!player.isOnGround) {
        swapElytraAndChestplate(player, "elytra", true);
    }
}

/**
 * Protects players by auto-swapping to chestplate if attacked on the ground while wearing Elytra.
 */
function handleEntityHurt(event: { hurtEntity: any }): void {
    if (!SmartElytraConfig.enabled || !SmartElytraConfig.smartSwitch.enabled) return;
    if (!SmartElytraConfig.smartSwitch.autoEquipChestplateOnHurt) return;

    const entity = event.hurtEntity;
    if (!entity || !entity.isValid || entity.typeId !== "minecraft:player") return;

    const player = entity as Player;
    // Auto-swap to chestplate if player is on ground or not actively gliding
    if (player.isOnGround || !player.isGliding) {
        swapElytraAndChestplate(player, "chestplate", true);
    }
}

/**
 * Listens for script event commands (/scriptevent qol:elytra_swap or /scriptevent qol:swap).
 * Connects directly to custom PC hotkeys, macros, and on-screen HUD buttons.
 */
function handleScriptEvent(event: { id: string; sourceEntity?: any }): void {
    if (!SmartElytraConfig.enabled || !SmartElytraConfig.manualSwitch.enabled) return;
    if (!SmartElytraConfig.manualSwitch.enableScriptEvent) return;

    if (
        event.id === "qol:elytra_swap" ||
        event.id === "qol:swap" ||
        event.id === "qol:elytra" ||
        event.id === "button.elytra_swap_click"
    ) {
        const player = event.sourceEntity;
        if (player && player.isValid && player.typeId === "minecraft:player") {
            swapElytraAndChestplate(player as Player);
        }
    }
}

/**
 * Initializes the Smart Elytra <--> Chestplate switcher feature.
 */
export function initSmartElytraFeature(): void {
    if (!SmartElytraConfig.enabled) {
        console.warn("[SmartElytra] Feature is disabled in configuration.");
        return;
    }

    // 1. Context-aware flight and landing detection loop (every 2 ticks)
    system.runInterval(processSmartElytraTick, 2);

    // 2. Physical button input listener (Double-Sneak, Sneak+Jump)
    world.afterEvents.playerButtonInput.subscribe((event) => {
        handleButtonInput(event);
    });

    // 3. Firework Rocket mid-air propulsion listener
    world.afterEvents.itemUse.subscribe((event) => {
        handleItemUse(event);
    });

    // 4. Ground combat damage protection listener
    world.afterEvents.entityHurt.subscribe((event) => {
        handleEntityHurt(event);
    });

    // 5. ScriptEvent listener (/scriptevent qol:elytra_swap, HUD buttons)
    system.afterEvents.scriptEventReceive.subscribe((event) => {
        handleScriptEvent(event);
    });

    // 6. Cleanup state when players leave
    world.afterEvents.playerLeave.subscribe((event) => {
        playerFlightStates.delete(event.playerId);
    });

    console.warn("[SmartElytra] Feature initialized successfully with smart context-aware flight and hotkeys.");
}
