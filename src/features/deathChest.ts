import {
    Block,
    BlockInventoryComponent,
    BlockPermutation,
    Container,
    Dimension,
    EntityComponentTypes,
    EntityEquippableComponent,
    EntityHealthComponent,
    EntityHurtBeforeEvent,
    EntityInventoryComponent,
    EntityItemComponent,
    EquipmentSlot,
    ExplosionBeforeEvent,
    ItemStack,
    Player,
    PlayerBreakBlockAfterEvent,
    PlayerInteractWithBlockBeforeEvent,
    PlayerSpawnAfterEvent,
    system,
    Vector3,
    world,
} from "@minecraft/server";
import { DeathChestConfig } from "../config";
import { showPlayerNotification } from "../utils/notifications";

interface PlayerInventorySnapshot {
    items: (ItemStack | undefined)[]; // Slots 0-35
    armor: (ItemStack | undefined)[]; // Head, Chest, Legs, Feet
    offhand?: ItemStack;              // Offhand slot
    timestamp: number;
    location: Vector3;
    dimensionId: string;
}

interface DeathChestRecord {
    dimensionId: string;
    locations: Vector3[];
    playerId: string;
    playerName: string;
    itemCount: number;
    isDoubleChest: boolean;
    timestamp: number;
}

// Active in-memory caches
const playerSnapshots = new Map<string, PlayerInventorySnapshot>();
const activeDeathChests = new Map<string, DeathChestRecord>();
const playerLastChest = new Map<string, DeathChestRecord>();

const DYNAMIC_PROPERTY_KEY = "qol:death_chests_data";

/**
 * Serializes and saves active death chests to world dynamic properties.
 */
function persistDeathChests(): void {
    try {
        const records = Array.from(new Set(activeDeathChests.values()));
        const json = JSON.stringify(records);
        if (json.length < 32000) {
            world.setDynamicProperty(DYNAMIC_PROPERTY_KEY, json);
        }
    } catch {
        // Fallback
    }
}

/**
 * Deserializes active death chests from world dynamic properties upon startup.
 */
function loadPersistedDeathChests(): void {
    try {
        const raw = world.getDynamicProperty(DYNAMIC_PROPERTY_KEY);
        if (typeof raw === "string" && raw.length > 0) {
            const records: DeathChestRecord[] = JSON.parse(raw);
            for (const r of records) {
                for (const loc of r.locations) {
                    const key = `${r.dimensionId}:${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
                    activeDeathChests.set(key, r);
                }
                playerLastChest.set(r.playerId, r);
            }
        }
    } catch {
        // Fallback
    }
}

/**
 * Creates a unique string key for a block position in a dimension.
 */
function toLocationKey(dimensionId: string, loc: Vector3): string {
    return `${dimensionId}:${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
}

/**
 * Checks if a specific location is part of a registered active death chest.
 */
export function isDeathChestLocation(dimensionId: string, loc: Vector3): boolean {
    return activeDeathChests.has(toLocationKey(dimensionId, loc));
}

/**
 * Formats dimension identifier for clean player-facing notifications.
 */
function getDimensionDisplayName(dimensionId: string): string {
    if (dimensionId.includes("nether")) return "The Nether";
    if (dimensionId.includes("the_end") || dimensionId.includes("end")) return "The End";
    return "Overworld";
}

/**
 * Takes a full snapshot of the player's inventory, armor, and offhand slots.
 */
export function snapshotPlayerInventory(player: Player): PlayerInventorySnapshot | undefined {
    if (!player || !player.isValid) return undefined;

    try {
        const invComp = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
        const equippable = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;

        const items: (ItemStack | undefined)[] = [];
        if (invComp && invComp.container) {
            const container = invComp.container;
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                items.push(item ? item.clone() : undefined);
            }
        }

        const armor: (ItemStack | undefined)[] = [];
        let offhand: ItemStack | undefined = undefined;

        if (equippable) {
            const head = equippable.getEquipment(EquipmentSlot.Head);
            const chest = equippable.getEquipment(EquipmentSlot.Chest);
            const legs = equippable.getEquipment(EquipmentSlot.Legs);
            const feet = equippable.getEquipment(EquipmentSlot.Feet);
            const off = equippable.getEquipment(EquipmentSlot.Offhand);

            armor.push(head ? head.clone() : undefined);
            armor.push(chest ? chest.clone() : undefined);
            armor.push(legs ? legs.clone() : undefined);
            armor.push(feet ? feet.clone() : undefined);

            offhand = off ? off.clone() : undefined;
        }

        const snapshot: PlayerInventorySnapshot = {
            items,
            armor,
            offhand,
            timestamp: Date.now(),
            location: { x: player.location.x, y: player.location.y, z: player.location.z },
            dimensionId: player.dimension.id,
        };

        playerSnapshots.set(player.id, snapshot);
        return snapshot;
    } catch {
        return undefined;
    }
}

/**
 * Helper to check if a block is air, liquid, or easily replaceable vegetation.
 */
function isReplaceableBlock(block: Block | undefined): boolean {
    if (!block || !block.isValid) return false;
    if (block.isAir || block.isLiquid) return true;

    const id = block.typeId;
    return (
        id === "minecraft:tallgrass" ||
        id === "minecraft:double_plant" ||
        id === "minecraft:yellow_flower" ||
        id === "minecraft:red_flower" ||
        id === "minecraft:snow_layer" ||
        id === "minecraft:fern" ||
        id === "minecraft:large_fern" ||
        id === "minecraft:deadbush" ||
        id === "minecraft:fire" ||
        id === "minecraft:soul_fire"
    );
}

/**
 * Helper to check if a block is lava or fire.
 */
function isLavaOrFire(block: Block | undefined): boolean {
    if (!block || !block.isValid) return false;
    const id = block.typeId;
    return (
        id === "minecraft:lava" ||
        id === "minecraft:flowing_lava" ||
        id === "minecraft:fire" ||
        id === "minecraft:soul_fire"
    );
}

/**
 * Removes loose dropped items near death location to prevent item duplication.
 */
function removeNearbyDeathDrops(dimension: Dimension, location: Vector3, radius = 8): void {
    try {
        const items = dimension.getEntities({
            type: "minecraft:item",
            location,
            maxDistance: radius,
        });
        for (const itemEntity of items) {
            try {
                itemEntity.remove();
            } catch {
                // Ignore
            }
        }
    } catch {
        // Ignore
    }
}

/**
 * Determines a safe placement position and orientation for the Death Chest.
 */
function calculateSafePlacement(
    dimension: Dimension,
    loc: Vector3,
    isDoubleChest: boolean
): {
    p1: Vector3;
    p2?: Vector3;
    direction: "north" | "east";
    createPlatform: boolean;
} {
    const dimId = dimension.id;
    let minY = -64;
    let maxY = 319;

    if (dimId.includes("nether")) {
        minY = 0;
        maxY = 127;
    } else if (dimId.includes("the_end") || dimId.includes("end")) {
        minY = 0;
        maxY = 255;
    }

    let x = Math.floor(loc.x);
    let y = Math.floor(loc.y);
    let z = Math.floor(loc.z);
    let createPlatform = false;

    // 1. VOID RESCUE: If death occurred below minimum world altitude
    if (y < minY + 4) {
        y = minY + 4;
        createPlatform = true;
    }

    // 2. LAVA / FIRE SAFETY: Elevate above lava pool surface
    let blockAtPos = dimension.getBlock({ x, y, z });
    if (blockAtPos && isLavaOrFire(blockAtPos)) {
        createPlatform = true;
        let testY = y;
        while (testY < maxY - 2) {
            const b = dimension.getBlock({ x, y: testY, z });
            if (!b || !isLavaOrFire(b)) {
                y = testY;
                break;
            }
            testY++;
        }
    }

    // 3. SUFFOCATION / SOLID BLOCKS: Scan upward to find open air
    blockAtPos = dimension.getBlock({ x, y, z });
    if (blockAtPos && !isReplaceableBlock(blockAtPos)) {
        let testY = y;
        while (testY < maxY - 2) {
            const b = dimension.getBlock({ x, y: testY, z });
            if (b && isReplaceableBlock(b)) {
                y = testY;
                break;
            }
            testY++;
        }
    }

    // 4. HIGH FALL / SKY DROP: Scan downward to find solid floor if floating in air
    blockAtPos = dimension.getBlock({ x, y, z });
    if (blockAtPos && blockAtPos.isAir) {
        const belowBlock = dimension.getBlock({ x, y: y - 1, z });
        if (belowBlock && belowBlock.isAir) {
            let scanY = y - 1;
            let foundGround = false;
            while (scanY > minY + 2 && y - scanY < 32) {
                const b = dimension.getBlock({ x, y: scanY, z });
                if (b && !b.isAir && !b.isLiquid) {
                    y = scanY + 1;
                    foundGround = true;
                    break;
                }
                scanY--;
            }
            if (!foundGround) {
                createPlatform = true;
            }
        }
    }

    // Clamp Y to safe world boundaries
    y = Math.max(minY + 2, Math.min(maxY - 2, y));

    const p1: Vector3 = { x, y, z };

    if (!isDoubleChest) {
        return { p1, direction: "north", createPlatform };
    }

    // 5. DOUBLE CHEST CANDIDATES: Find adjacent space for the second chest block
    const candidates: { p2: Vector3; dir: "north" | "east" }[] = [
        { p2: { x: x + 1, y, z }, dir: "north" },
        { p2: { x: x - 1, y, z }, dir: "north" },
        { p2: { x, y, z: z + 1 }, dir: "east" },
        { p2: { x, y, z: z - 1 }, dir: "east" },
    ];

    let selectedCandidate = candidates[0];
    for (const cand of candidates) {
        const b = dimension.getBlock(cand.p2);
        if (b && isReplaceableBlock(b)) {
            selectedCandidate = cand;
            break;
        }
    }

    return {
        p1,
        p2: selectedCandidate.p2,
        direction: selectedCandidate.dir,
        createPlatform,
    };
}

/**
 * Places safe cobblestone platform blocks under the death chest in hazardous areas (lava, void).
 */
function placeProtectivePlatform(dimension: Dimension, p1: Vector3, p2?: Vector3): void {
    const safeBlockPerm = BlockPermutation.resolve("minecraft:cobblestone");

    const positionsToProtect: Vector3[] = [
        { x: p1.x, y: p1.y - 1, z: p1.z },
        { x: p1.x + 1, y: p1.y - 1, z: p1.z },
        { x: p1.x - 1, y: p1.y - 1, z: p1.z },
        { x: p1.x, y: p1.y - 1, z: p1.z + 1 },
        { x: p1.x, y: p1.y - 1, z: p1.z - 1 },
    ];

    if (p2) {
        positionsToProtect.push(
            { x: p2.x, y: p2.y - 1, z: p2.z },
            { x: p2.x + 1, y: p2.y - 1, z: p2.z },
            { x: p2.x - 1, y: p2.y - 1, z: p2.z },
            { x: p2.x, y: p2.y - 1, z: p2.z + 1 },
            { x: p2.x, y: p2.y - 1, z: p2.z - 1 }
        );
    }

    for (const pos of positionsToProtect) {
        try {
            const b = dimension.getBlock(pos);
            if (b && (b.isAir || b.isLiquid || isLavaOrFire(b))) {
                b.setPermutation(safeBlockPerm);
            }
        } catch {
            // Ignore
        }
    }
}

/**
 * Places a chest block with the designated cardinal direction permutation.
 */
function placeChestBlock(dimension: Dimension, pos: Vector3, dir: "north" | "east"): Block | undefined {
    try {
        const block = dimension.getBlock(pos);
        if (!block) return undefined;

        try {
            const perm = BlockPermutation.resolve("minecraft:chest", {
                "minecraft:cardinal_direction": dir,
            });
            block.setPermutation(perm);
        } catch {
            block.setPermutation(BlockPermutation.resolve("minecraft:chest"));
        }

        return block;
    } catch {
        return undefined;
    }
}

/**
 * Distributes player items into the single or double chest containers.
 */
function fillChestContainers(
    items: ItemStack[],
    container1: Container,
    container2?: Container
): void {
    let currentSlot = 0;
    const size1 = container1.size;

    for (const item of items) {
        if (!item) continue;
        try {
            if (currentSlot < size1) {
                container1.setItem(currentSlot, item);
                currentSlot++;
            } else if (container2 && container2.isValid) {
                const slotIn2 = currentSlot - size1;
                if (slotIn2 < container2.size) {
                    container2.setItem(slotIn2, item);
                    currentSlot++;
                } else {
                    container1.addItem(item);
                }
            } else {
                container1.addItem(item);
            }
        } catch {
            try {
                container1.addItem(item);
            } catch {
                // Ignore
            }
        }
    }
}

/**
 * Checks if an item is a valid armor piece for a specific equipment slot.
 */
function getMatchingArmorSlot(item: ItemStack): EquipmentSlot | undefined {
    const id = item.typeId;
    if (id.endsWith("_helmet") || id === "minecraft:turtle_helmet") {
        return EquipmentSlot.Head;
    }
    if (id.endsWith("_chestplate") || id === "minecraft:elytra") {
        return EquipmentSlot.Chest;
    }
    if (id.endsWith("_leggings")) {
        return EquipmentSlot.Legs;
    }
    if (id.endsWith("_boots")) {
        return EquipmentSlot.Feet;
    }
    return undefined;
}

/**
 * Checks if an item is suitable for auto-equipping into the offhand.
 */
function isOffhandEquippable(item: ItemStack): boolean {
    const id = item.typeId;
    return (
        id === "minecraft:shield" ||
        id === "minecraft:totem_of_undying" ||
        id.includes("torch") ||
        id.includes("lantern")
    );
}

/**
 * Quick-recovers items from the Death Chest and auto-equips armor when sneak-interacted.
 */
function handleQuickRecover(player: Player, clickedBlock: Block): void {
    if (!player || !player.isValid || !clickedBlock || !clickedBlock.isValid) return;

    const locKey = toLocationKey(clickedBlock.dimension.id, clickedBlock.location);
    const record = activeDeathChests.get(locKey);
    if (!record) return;

    try {
        const playerInv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
        const playerEquip = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
        if (!playerInv || !playerInv.container) return;

        const pContainer = playerInv.container;
        const chestBlocks: Block[] = [];

        for (const loc of record.locations) {
            const b = clickedBlock.dimension.getBlock(loc);
            if (b && b.typeId === "minecraft:chest") {
                chestBlocks.push(b);
            }
        }

        if (chestBlocks.length === 0) return;

        const collectedItems: ItemStack[] = [];

        // 1. Extract all items from chest block containers
        for (const cb of chestBlocks) {
            const inv = cb.getComponent("minecraft:inventory") as BlockInventoryComponent | undefined;
            if (inv && inv.container) {
                const c = inv.container;
                for (let i = 0; i < c.size; i++) {
                    const item = c.getItem(i);
                    if (item) {
                        collectedItems.push(item.clone());
                        c.setItem(i, undefined);
                    }
                }
            }
        }

        if (collectedItems.length === 0) {
            // Chest is already empty, clean up
            for (const cb of chestBlocks) {
                cb.setPermutation(BlockPermutation.resolve("minecraft:air"));
            }
            for (const loc of record.locations) {
                activeDeathChests.delete(toLocationKey(record.dimensionId, loc));
            }
            playerLastChest.delete(record.playerId);
            persistDeathChests();
            return;
        }

        let equippedArmorCount = 0;
        const overflowItems: ItemStack[] = [];

        // 2. Auto-equip armor and offhand items first
        for (const item of collectedItems) {
            let equipped = false;

            if (playerEquip) {
                const armorSlot = getMatchingArmorSlot(item);
                if (armorSlot !== undefined) {
                    const currentPiece = playerEquip.getEquipment(armorSlot);
                    if (!currentPiece) {
                        playerEquip.setEquipment(armorSlot, item);
                        equippedArmorCount++;
                        equipped = true;
                    }
                } else if (isOffhandEquippable(item)) {
                    const currentOffhand = playerEquip.getEquipment(EquipmentSlot.Offhand);
                    if (!currentOffhand) {
                        playerEquip.setEquipment(EquipmentSlot.Offhand, item);
                        equipped = true;
                    }
                }
            }

            if (!equipped) {
                // 3. Transfer remaining items into player inventory
                const remainder = pContainer.addItem(item);
                if (remainder && remainder.amount > 0) {
                    overflowItems.push(remainder);
                }
            }
        }

        // 4. Handle chest removal or overflow restoral
        if (overflowItems.length === 0) {
            // All items safely recovered! Clean up chest blocks and return chest item(s) to player
            for (const cb of chestBlocks) {
                try {
                    cb.setPermutation(BlockPermutation.resolve("minecraft:air"));
                } catch {
                    // Ignore
                }
            }

            // Give player back their chest blocks
            try {
                const chestItem = new ItemStack("minecraft:chest", chestBlocks.length);
                pContainer.addItem(chestItem);
            } catch {
                // Ignore
            }

            for (const loc of record.locations) {
                activeDeathChests.delete(toLocationKey(record.dimensionId, loc));
            }
            playerLastChest.delete(record.playerId);
            persistDeathChests();

            // Audio and particle feedback
            if (DeathChestConfig.playReclaimEffects) {
                try {
                    player.dimension.playSound("random.levelup", player.location, { volume: 0.7, pitch: 1.2 });
                    player.dimension.playSound("chime.amethyst_block", player.location, { volume: 1.0, pitch: 1.0 });
                    player.dimension.spawnParticle("minecraft:totem_particle", {
                        x: player.location.x,
                        y: player.location.y + 1,
                        z: player.location.z,
                    });
                } catch {
                    // Ignore
                }
            }

            showPlayerNotification(player, "§a✨ All Items Recovered & Equipped! ✨§r");
            player.sendMessage("§e[Death Chest]§r §aAll items recovered from your Death Chest! Welcome back!§r");
        } else {
            // Inventory was full, put overflow items back into the primary chest
            const primaryInv = chestBlocks[0].getComponent("minecraft:inventory") as BlockInventoryComponent | undefined;
            if (primaryInv && primaryInv.container) {
                for (const ofItem of overflowItems) {
                    primaryInv.container.addItem(ofItem);
                }
            }

            showPlayerNotification(player, "§e⚠️ Inventory Full! Some items remain in Death Chest.§r");
            player.sendMessage("§e[Death Chest]§r §eTransferred recovered items. Remaining items left in chest due to full inventory.§r");
        }
    } catch {
        // Fallback
    }
}

/**
 * Initializes the Death Chest (Grave Chest) feature.
 */
export function initDeathChestFeature(): void {
    if (!DeathChestConfig.enabled) return;

    // Load persisted active chests from storage
    loadPersistedDeathChests();

    // 1. Hurt Event: Continuous Pre-Death Inventory Snapshotting
    world.beforeEvents.entityHurt.subscribe((event: EntityHurtBeforeEvent) => {
        if (!DeathChestConfig.enabled) return;
        if (event.hurtEntity.typeId !== "minecraft:player") return;

        const player = event.hurtEntity as Player;
        if (!player || !player.isValid) return;

        // Snapshot immediately upon damage
        snapshotPlayerInventory(player);
    });

    // 2. Periodic Player Snapshot Loop (every 10 ticks = 0.5s)
    system.runInterval(() => {
        if (!DeathChestConfig.enabled) return;
        for (const player of world.getAllPlayers()) {
            if (player && player.isValid) {
                snapshotPlayerInventory(player);
            }
        }
    }, 10);

    // 3. Entity Die Event: Spawn and Populate Death Chest
    world.afterEvents.entityDie.subscribe((event) => {
        if (!DeathChestConfig.enabled) return;
        if (event.deadEntity.typeId !== "minecraft:player") return;

        // If KeepInventory is active in world gamerules, do nothing
        if (world.gameRules.keepInventory) return;

        const deadEntity = event.deadEntity;
        const dimension = deadEntity.dimension;
        const deathLocation = {
            x: deadEntity.location.x,
            y: deadEntity.location.y,
            z: deadEntity.location.z,
        };

        const playerId = deadEntity.id;
        const playerRef = deadEntity as Player;
        const playerName = playerRef.name || "Player";

        // Retrieve saved snapshot
        const snapshot = playerSnapshots.get(playerId);

        // Gather all carried items (hotbar, backpack, armor, offhand)
        const itemsToStore: ItemStack[] = [];

        // Check if deadEntity still has readable inventory items before respawn
        try {
            const invComp = deadEntity.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
            if (invComp && invComp.container) {
                for (let i = 0; i < invComp.container.size; i++) {
                    const item = invComp.container.getItem(i);
                    if (item && !item.keepOnDeath) {
                        itemsToStore.push(item.clone());
                    }
                }
            }

            const equippable = deadEntity.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
            if (equippable) {
                const slots = [
                    EquipmentSlot.Head,
                    EquipmentSlot.Chest,
                    EquipmentSlot.Legs,
                    EquipmentSlot.Feet,
                    EquipmentSlot.Offhand,
                ];
                for (const s of slots) {
                    const item = equippable.getEquipment(s);
                    if (item && !item.keepOnDeath) {
                        itemsToStore.push(item.clone());
                    }
                }
            }
        } catch {
            // Fallback to snapshot
        }

        // If container was already cleared by vanilla drop mechanics, restore from snapshot
        if (itemsToStore.length === 0 && snapshot) {
            for (const it of snapshot.items) {
                if (it && !it.keepOnDeath) itemsToStore.push(it.clone());
            }
            for (const ar of snapshot.armor) {
                if (ar && !ar.keepOnDeath) itemsToStore.push(ar.clone());
            }
            if (snapshot.offhand && !snapshot.offhand.keepOnDeath) {
                itemsToStore.push(snapshot.offhand.clone());
            }
        }

        // If player had zero items on death, do not create an empty chest
        if (itemsToStore.length === 0) {
            try {
                playerRef.sendMessage("§7[Death Chest] No items to store (empty inventory).");
            } catch {
                // Ignore
            }
            return;
        }

        // Clear dropped items at death position to prevent item duplication
        removeNearbyDeathDrops(dimension, deathLocation, 8);
        system.run(() => {
            removeNearbyDeathDrops(dimension, deathLocation, 8);
        });

        // Determine chest sizing: Single Chest (<= 27 items) vs Large Double Chest (> 27 items)
        const isDoubleChest = DeathChestConfig.smartChestSizing ? itemsToStore.length > 27 : false;

        // Calculate safe placement location
        const placement = calculateSafePlacement(dimension, deathLocation, isDoubleChest);
        const p1 = placement.p1;
        const p2 = placement.p2;
        const dir = placement.direction;

        // Place protective platform if required (over lava, void, or high air)
        if (placement.createPlatform && DeathChestConfig.createSafePlatform) {
            placeProtectivePlatform(dimension, p1, p2);
        }

        // Place primary chest block
        const b1 = placeChestBlock(dimension, p1, dir);
        let b2: Block | undefined = undefined;

        if (isDoubleChest && p2) {
            b2 = placeChestBlock(dimension, p2, dir);
        }

        // Populate chest container(s)
        if (b1) {
            const inv1 = b1.getComponent("minecraft:inventory") as BlockInventoryComponent | undefined;
            const inv2 = b2 ? (b2.getComponent("minecraft:inventory") as BlockInventoryComponent | undefined) : undefined;

            if (inv1 && inv1.container) {
                fillChestContainers(itemsToStore, inv1.container, inv2?.container);
            }
        }

        // Record active death chest
        const locations = isDoubleChest && p2 ? [p1, p2] : [p1];
        const record: DeathChestRecord = {
            dimensionId: dimension.id,
            locations,
            playerId,
            playerName,
            itemCount: itemsToStore.length,
            isDoubleChest,
            timestamp: Date.now(),
        };

        for (const loc of locations) {
            activeDeathChests.set(toLocationKey(dimension.id, loc), record);
        }
        playerLastChest.set(playerId, record);
        persistDeathChests();

        // Audio and particle feedback
        if (DeathChestConfig.playEffects) {
            try {
                dimension.playSound("beacon.activate", p1, { volume: 0.8, pitch: 1.2 });
                dimension.playSound("random.totem", p1, { volume: 0.6, pitch: 1.5 });
                dimension.spawnParticle("minecraft:totem_particle", {
                    x: p1.x + 0.5,
                    y: p1.y + 0.6,
                    z: p1.z + 0.5,
                });
            } catch {
                // Ignore
            }
        }

        // Inform player of death chest coordinates
        const chestTypeName = isDoubleChest ? "Large Chest" : "Single Chest";
        const dimName = getDimensionDisplayName(dimension.id);

        if (DeathChestConfig.showCoordinatesInChat) {
            try {
                playerRef.sendMessage(
                    `§e[Death Chest]§r §aAll §f${itemsToStore.length}§a items safely stored in a §6${chestTypeName}§a at §fX: ${p1.x}, Y: ${p1.y}, Z: ${p1.z}§a in §b${dimName}§a!§r`
                );
            } catch {
                // Ignore
            }
        }

        try {
            showPlayerNotification(
                playerRef,
                `§e📍 Death Chest: ${p1.x}, ${p1.y}, ${p1.z} (${dimName})§r`
            );
        } catch {
            // Ignore
        }
    });

    // 4. Respawn Reminder: Remind player of their death chest coordinates upon respawning
    world.afterEvents.playerSpawn.subscribe((event: PlayerSpawnAfterEvent) => {
        if (!DeathChestConfig.enabled || !DeathChestConfig.showRespawnReminder) return;
        if (event.initialSpawn) return; // Only notify on respawn after death

        const player = event.player;
        if (!player || !player.isValid) return;

        const record = playerLastChest.get(player.id);
        if (!record || record.locations.length === 0) return;

        const p1 = record.locations[0];
        const dimName = getDimensionDisplayName(record.dimensionId);

        let distText = "";
        if (player.dimension.id === record.dimensionId) {
            const dist = Math.round(
                Math.hypot(player.location.x - p1.x, player.location.z - p1.z)
            );
            distText = ` (${dist}m away)`;
        }

        system.runTimeout(() => {
            try {
                if (!player || !player.isValid) return;
                player.sendMessage(
                    `§e[Death Chest]§r §aRemember: Your items are at §fX: ${p1.x}, Y: ${p1.y}, Z: ${p1.z}§a${distText} in §b${dimName}§a!§r`
                );
                showPlayerNotification(
                    player,
                    `§e📍 Death Chest: ${p1.x}, ${p1.y}, ${p1.z}${distText}§r`
                );
            } catch {
                // Ignore
            }
        }, 15);
    });

    // 5. Quick Recover on Sneak + Interact
    world.beforeEvents.playerInteractWithBlock.subscribe((event: PlayerInteractWithBlockBeforeEvent) => {
        if (!DeathChestConfig.enabled || !DeathChestConfig.quickRecoverOnSneakInteract) return;

        const player = event.player;
        const block = event.block;
        if (!player || !player.isValid || !block || !block.isValid) return;

        if (!player.isSneaking) return;
        if (block.typeId !== "minecraft:chest") return;

        const locKey = toLocationKey(block.dimension.id, block.location);
        if (!activeDeathChests.has(locKey)) return;

        // Cancel opening chest UI and trigger quick recover
        event.cancel = true;

        system.run(() => {
            handleQuickRecover(player, block);
        });
    });

    // 6. Chest Broken Event: Reclaim and clean up record
    world.afterEvents.playerBreakBlock.subscribe((event: PlayerBreakBlockAfterEvent) => {
        if (!DeathChestConfig.enabled) return;

        const block = event.block;
        const dimId = event.dimension.id;
        const locKey = toLocationKey(dimId, event.block.location);

        const record = activeDeathChests.get(locKey);
        if (!record) return;

        for (const loc of record.locations) {
            activeDeathChests.delete(toLocationKey(dimId, loc));
        }
        playerLastChest.delete(record.playerId);
        persistDeathChests();

        if (DeathChestConfig.playReclaimEffects) {
            try {
                event.dimension.playSound("chime.amethyst_block", event.block.location, { volume: 1.0, pitch: 1.0 });
            } catch {
                // Ignore
            }
        }

        try {
            event.player.sendMessage("§e[Death Chest]§r §aDeath Chest broken. All items recovered!§r");
        } catch {
            // Ignore
        }
    });

    // 7. Explosion Protection: Shield Death Chest and platform from Creepers, Ghasts, and TNT
    world.beforeEvents.explosion.subscribe((event: ExplosionBeforeEvent) => {
        if (!DeathChestConfig.enabled || !DeathChestConfig.protectFromExplosions) return;

        try {
            const impacted = event.getImpactedBlocks();
            const safe = impacted.filter((b) => !isDeathChestLocation(b.dimension.id, b.location));
            event.setImpactedBlocks(safe);
        } catch {
            // Ignore
        }
    });
}
