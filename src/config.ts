export const TreeCapitatorConfig = {
    /**
     * Whether an axe is required in the player's main hand to fell trees.
     * Default: true (punching with bare hands will only break one block).
     */
    requireAxe: true,

    /**
     * If true, Tree Capitator only triggers when the player is sneaking.
     * If false, Tree Capitator is always active when using an axe.
     * Default: false
     */
    sneakToActivate: false,

    /**
     * Maximum number of connected logs to fell in a single tree.
     * Prevents runaway destruction of massive structures or lag.
     * Default: 256
     */
    maxLogs: 256,

    /**
     * Maximum horizontal radius (X and Z) from the initial cut log.
     * Default: 12 blocks
     */
    maxHorizontalRadius: 12,

    /**
     * Maximum vertical downward depth (in blocks) to search for connected logs below the cut block.
     * Allows felling the whole tree even when chopping from the middle or branch, including all lower logs.
     * Default: 32 blocks
     */
    maxVerticalDown: 32,

    /**
     * Number of logs to break per tick.
     * Set to 0 to break all logs instantly.
     * Set to > 0 (e.g. 6) for an upward break progression.
     * Default: 6
     */
    logsPerTick: 6,

    /**
     * Whether to apply tool durability damage for extra logs broken in survival.
     * Default: false (durability loss removed)
     */
    consumeDurability: false,

    /**
     * Whether Tree Capitator fells naturally fallen trees and downed logs lying on the ground that have no leaves.
     * Default: true
     */
    fellFallenLogs: true,

    /**
     * Maximum number of logs for a leafless fallen tree / downed log.
     * Safely prevents accidentally felling large player-built structures (cabins, houses, walls) without leaves.
     * Default: 32 blocks
     */
    maxFallenLogs: 32,

    /**
     * FAST LEAF DECAY SETTINGS
     */
    leafDecay: {
        /**
         * Whether connected leaves should automatically decay after the tree is cut.
         * Default: true
         */
        enabled: true,

        /**
         * Smart filtering: only decay leaves that match the species/type of the cut tree
         * (e.g. cutting an Oak tree never decays neighboring Birch, Spruce, or Cherry leaves).
         * Default: true
         */
        matchTreeSpecies: true,

        /**
         * Search distance from any felled log to find orphan leaves.
         * Default: 5 blocks
         */
        searchRadius: 5,

        /**
         * Minimum tick delay before a leaf crumbles (1 second = 20 ticks).
         * Default: 2 ticks
         */
        minDelayTicks: 2,

        /**
         * Maximum tick delay before a leaf crumbles.
         * Random delay between min and max gives a natural rustling cascade effect.
         * Default: 18 ticks (approx 0.9s)
         */
        maxDelayTicks: 18,

        /**
         * Protect leaves placed by players (with persistent_bit: true).
         * Default: true
         */
        protectPlayerLeaves: true,
    },

    /**
     * AUTO-PLANT SAPLINGS
     */
    autoPlantSapling: {
        /**
         * Automatically plant a matching sapling in an optimal growing spot when a tree is felled.
         * Default: true
         */
        enabled: true,

        /**
         * Automatically plant a 2x2 of saplings for Dark Oak or mega trees.
         * Default: true
         */
        plant2x2WhenApplicable: true,

        /**
         * Automatically plant additional saplings dropped by the felled tree's decaying leaves in good nearby spots.
         * Default: true
         */
        plantDroppedSaplings: true,

        /**
         * Maximum number of extra dropped saplings to auto-plant per felled tree.
         * Default: 4
         */
        maxExtraSaplingsToPlant: 4,

        /**
         * Minimum spacing (in blocks) between planted saplings to give each tree adequate room to grow.
         * Default: 3 blocks
         */
        minSaplingSpacing: 3,

        /**
         * Search radius (in blocks) around the tree base to find good spots for dropped saplings.
         * Default: 8 blocks
         */
        droppedSaplingSearchRadius: 8,
    },
};

export const FarmingConfig = {
    /**
     * FARMLAND (TILLED SOIL) BEHAVIOR
     */
    farmland: {
        /**
         * Automatically keep farmland at max hydration (moisturized_amount: 7).
         * No nearby water source is needed.
         * Default: true
         */
        autoHydrate: true,

        /**
         * Prevent farmland from being destroyed or trampled by jumping entities / players.
         * If trampled, immediately restores to hydrated farmland and protects crops.
         * Default: true
         */
        antiTrample: true,

        /**
         * Prevent farmland from drying out and reverting to dirt or grass block.
         * Default: true
         */
        preventReversion: true,

        /**
         * Scan radius around players to discover farmland in loaded chunks.
         * Default: 16 blocks
         */
        discoveryRadius: 16,

        /**
         * Protect farmland, crops, and farm chests from being destroyed by Creepers,
         * Ghasts, Withers, Ravagers, and other hostile mobs / explosions.
         * Default: true
         */
        mobProtection: true,
    },

    /**
     * CROP GROWTH SETTINGS
     */
    growth: {
        /**
         * Accelerate crop growth speed.
         * Default: true
         */
        fastGrowth: true,

        /**
         * Base growth duration for standard crops in Minecraft ticks.
         * 24,000 ticks = 1 in-game day (20 real-time minutes), matching vanilla Minecraft crop growth.
         * Default: 24000
         */
        defaultFullGrowthTicks: 24000,

        /**
         * Growth rate multiplier applied to default crops (1.25 = 125% speed, 25% faster than default).
         * Target duration for standard crops: 24,000 / 1.25 = 19,200 ticks (16 minutes).
         * Default: 1.25
         */
        growthRateMultiplier: 2,

        /**
         * Target duration for standard crops to grow from planting to full maturity (in game ticks).
         * Effective: defaultFullGrowthTicks / growthRateMultiplier = 19,200 ticks (16 minutes).
         * Default: 19200
         */
        targetFullGrowthTicks: 19200,

        /**
         * Sweet Berry Bush and Glow Berries are exempt from default rate and use fast growth.
         * Default: true
         */
        berriesFastGrowth: true,

        /**
         * Target growth duration for Sweet Berry Bush and Glow Berries (in game ticks).
         * 100 ticks = 5.0 seconds (rapid berry yield for foraging and farming).
         * Default: 100
         */
        berriesFullGrowthTicks: 100,

        /**
         * Tick interval for the crop growth loop (20 ticks = 1.0 second).
         * Default: 20 ticks
         */
        growthCheckIntervalTicks: 20,

        /**
         * Number of growth stages to advance per growth cycle.
         * Default: 1
         */
        growthStep: 1,

        /**
         * Spawn bonemeal growth sparkle particles when a crop advances.
         * Default: true
         */
        showGrowthParticles: true,

        /**
         * Allow crops to grow in low light conditions without uprooting.
         * Default: true
         */
        ignoreLightLevel: true,
    },

    /**
     * AUTO-HARVEST & CONTAINER SETTINGS
     */
    autoHarvest: {
        /**
         * Enable automatic harvesting of mature crops.
         * Default: true
         */
        enabled: true,

        /**
         * How often to check for mature crops ready for harvest (in ticks).
         * Default: 30 ticks (1.5s)
         */
        checkIntervalTicks: 30,

        /**
         * Radius (in blocks) to search for chests around the crop.
         * Default: 10 blocks
         */
        chestSearchRadius: 10,

        /**
         * Automatically replant crops after harvesting via automated chest system.
         * Default: true
         */
        autoReplant: true,

        /**
         * Automatically replant crops when harvested manually by player (breaking or punching).
         * Default: true
         */
        replantOnManualHarvest: true,

        /**
         * Allow right-click harvesting on mature crops (harvests drops and replants in 1 click).
         * Default: true
         */
        rightClickHarvest: true,


        /**
         * Route surplus seeds and compostable items to a chest positioned above a hopper and composter.
         * Default: true
         */
        routeSeedsToCompostChest: true,
    },

    /**
     * HARVEST REMINDER INDICATOR (FOR UN-AUTOMATED CROPS)
     * Displays a stage indicator representing crop progress:
     * - Red: Early stage (0-40% growth)
     * - Yellow: Mid stage (40-99% growth)
     * - Green: Mature (100% growth)
     */
    harvestReminder: {
        /**
         * Display a growth stage indicator particle above unautomated crops.
         * Default: true
         */
        enabled: true,

        /**
         * Particle for mature stage.
         * Default: "qol:crop_indicator_green"
         */
        greenParticle: "qol:crop_indicator_green",

        /**
         * Particle for mid stage growth (40-99%).
         * Uses custom HD illuminated exclamation mark icon asset.
         * Default: "qol:crop_indicator_yellow"
         */
        yellowParticle: "qol:crop_indicator_yellow",

        /**
         * Particle for early stage growth (0-40%).
         * Uses custom HD illuminated exclamation mark icon asset (replaces redstone dust effect).
         * Default: "qol:crop_indicator_red"
         */
        redParticle: "qol:crop_indicator_red",

        /**
         * Single particle fallback.
         */
        particleType: "qol:crop_indicator_green",

        /**
         * Tick interval between particle refreshes (20 ticks = 1.0s).
         * Overlaps with 2.2s particle lifetime so billboard indicators remain completely static without flickering.
         * Default: 20
         */
        refreshIntervalTicks: 20,

        /**
         * Maximum distance in blocks from any online player to display reminder particles.
         * Default: 24 blocks
         */
        maxPlayerDistance: 24,
    },
};

export const PetConfig = {
    /**
     * Whether tamed pets and mounts are immortal (immune to damage).
     * Covers wolves/dogs, cats, parrots, horses, donkeys, mules, llamas, and camels.
     * Default: true
     */
    enabled: true,

    /**
     * Prevent friendly fire (owner accidentally hitting their own pet with melee or projectiles).
     * Default: true
     */
    preventFriendlyFire: true,

    /**
     * Automatically extinguish pet when in fire or lava.
     * Default: true
     */
    autoExtinguish: true,

    /**
     * Automatically rescue pets that fall into the void by teleporting them back to their owner.
     * Default: true
     */
    autoVoidRescue: true,

    /**
     * Notify owner when their pet is protected or rescued from the void.
     * Default: true
     */
    notifyOwner: true,
};

export const DynamicLightingConfig = {
    /**
     * Enable lightweight dynamic lighting for held torches, lanterns, glowstone.
     * Only updates when crossing block boundaries to prevent chunk flicker and lag.
     * Default: true
     */
    enabled: true,

    /**
     * Emit light when holding a light source in the main hand.
     * Default: true
     */
    mainHand: true,

    /**
     * Emit light when holding a light source in the offhand.
     * Default: true
     */
    offHand: true,

    /**
     * Tick interval for checking held light (4 ticks = 200ms).
     * Default: 4
     */
    updateIntervalTicks: 4,

    /**
     * Right-clicking in air with a torch or lantern equips or swaps it into the offhand slot.
     * Default: true
     */
    allowOffhandEquipOnUse: true,

    /**
     * Show an action bar notification confirming torch/lantern offhand equipment.
     * Default: true
     */
    showEquipNotification: true,

    /**
     * Play an equipment sound when equipping a torch or lantern into the offhand.
     * Default: true
     */
    playOffhandSound: true,
};

export const DurabilityConfig = {
    /**
     * Remove durability loss from all items that have durability (tools, weapons, armor, bows, shields, elytra).
     * Makes all items unbreakable and freezes durability wear.
     * Default: true
     */
    enabled: true,

    /**
     * Automatically repair all damaged items to full 100% health (damage = 0).
     * Default: true
     */
    repairExistingDamage: true,

    /**
     * Temporarily disable / remove durability enchantments (Unbreaking, Mending) from items
     * when max durability is enabled, since items are unbreakable and never lose durability.
     * Enchantment levels are safely preserved in item dynamic properties and automatically restored
     * if max durability is disabled.
     * Default: true
     */
    disableDurabilityEnchantments: true,

    /**
     * Scan interval for players' inventory and equipment (in ticks; 10 ticks = 0.5s).
     * Default: 10
     */
    scanIntervalTicks: 10,
};

export const AutoTotemConfig = {
    /**
     * Enable Auto Totem of Undying protection.
     * Automatically saves players from fatal damage if a totem exists in offhand, mainhand, hotbar, or backpack.
     * Offhand is never automatically populated, allowing players to freely hold torches, lanterns, or shields.
     * Default: true
     */
    enabled: true,

    /**
     * Make Totems of Undying stackable up to 64 in player inventory and backpack.
     * Automatically merges loose totems into clean stacks to save inventory space.
     * Default: true
     */
    stackableTotems: true,

    /**
     * Maximum stack size for Totems of Undying (up to 64).
     * Default: 64
     */
    maxStackSize: 64,

    /**
     * Protect players from falling into the void (teleports to safe ground above void upon fatal void damage).
     * Default: true
     */
    voidRescue: true,

    /**
     * Display an alert on screen when a totem activates from backpack or offhand.
     * Default: true
     */
    notifyPlayer: true,
};

export const AutoFishingConfig = {
    /**
     * Enable automatic fishing when casting a fishing rod.
     * Automatically catches fish, collects loot, and keeps fishing continuously while AFK.
     * Default: true
     */
    enabled: true,

    /**
     * Send caught loot directly to player inventory or feet.
     * Default: true
     */
    directLootPickup: true,

    /**
     * Show particle effects and action bar notification upon catch.
     * Default: true
     */
    showEffects: true,

    /**
     * Keep fishing line in water automatically for continuous AFK fishing without recasting.
     * Default: true
     */
    continuousAFK: true,
};

export const VeinMinerConfig = {
    /**
     * Enable Vein Miner.
     * Automatically mines all connected matching ores when one is mined.
     * Default: true
     */
    enabled: true,

    /**
     * Require a pickaxe in mainhand to trigger Vein Miner.
     * Default: true
     */
    requirePickaxe: true,

    /**
     * Require player to be sneaking (crouching) to activate Vein Miner.
     * Set to false to always vein mine, or true to only vein mine while sneaking.
     * Default: false
     */
    sneakToActivate: false,

    /**
     * Maximum number of connected ore blocks to mine in a single vein.
     * Default: 64
     */
    maxBlocks: 64,

    /**
     * Maximum horizontal and vertical search radius from the initial mined block.
     * Default: 12 blocks
     */
    maxRadius: 12,

    /**
     * Number of blocks to break per tick (0 for instant breaking).
     * Default: 4 (smooth crumble animation)
     */
    blocksPerTick: 4,

    /**
     * Support Fortune and Silk Touch enchantments from player's pickaxe.
     * Default: true
     */
    supportEnchantments: true,

    /**
     * Deliver mined ores and XP directly to the player's position.
     * Default: true
     */
    directPickup: true,
};

export const MobHealthBarConfig = {
    /**
     * Enable modern segmented card health bar above neutral and hostile mobs' heads.
     * Displays bold mob name, remaining/max HP, and 4-segment colored health gauge.
     * Default: true
     */
    enabled: true,

    /**
     * Show health bars above hostile mobs (Zombies, Skeletons, Creepers, Endermen, Wardens, etc.).
     * Default: true
     */
    showHostileMobs: true,

    /**
     * Show health bars above neutral mobs (Iron Golems, Wolves, Bees, Piglins, Polar Bears, etc.).
     * Default: true
     */
    showNeutralMobs: true,

    /**
     * Show health bars above passive mobs (Cows, Sheep, Pigs, Horses, etc.).
     * Default: false (keeps farms and villages clean)
     */
    showPassiveMobs: true,

    /**
     * Number of segments in the health bar gauge (matches 4-segment card template).
     * Default: 4
     */
    gaugeSegments: 4,

    /**
     * Show numeric HP value (e.g. "14/20 HP").
     * Default: true
     */
    showHpValue: true,

    /**
     * Show mob's formatted name on line 1 above the gauge.
     * Default: true
     */
    showMobName: true,

    /**
     * Maximum distance in blocks from players to scan and keep health bars active above mob heads.
     * Default: 64 (full loaded simulation distance so health bars are always rendered statically above mobs)
     */
    maxDisplayDistance: 64,

    /**
     * Maximum distance in blocks to detect and show mob health when looking towards a mob.
     * Default: 64
     */
    maxAimDistance: 64,

    /**
     * Nameplate render distance in blocks (Bedrock 1.21+ API).
     * Set to 64 blocks so mob health bar nameplate always renders at full distance.
     * Default: 64
     */
    nameplateRenderDistance: 64,

    /**
     * Whether the mob health bar nameplate should be depth tested for visibility behind blocks.
     * Set to false so the health bar is not culled by foliage, fences, or mob hitboxes.
     * Default: false
     */
    nameplateDepthTested: false,

    /**
     * Periodic scan interval in game ticks (10 ticks = 0.5s, smooth low-overhead background response).
     * Instant updates also trigger on entity spawn and damage events (0-tick real-time responsiveness).
     * Default: 10
     */
    updateIntervalTicks: 10,
};

export const CampfireRegenConfig = {
    /**
     * Enable campfire health regeneration for players and pets.
     * Default: true
     */
    enabled: true,

    /**
     * Radius in blocks around a lit campfire where regeneration applies.
     * Default: 10 blocks
     */
    radius: 10,

    /**
     * Base health regenerated per second (1 HP = half a heart / sec).
     * Tuned for authentic vanilla survival balance.
     * Default: 1.0 HP/s
     */
    baseHealthPerSecond: 1.0,

    /**
     * Multiplier applied when resting (sneaking / crouching) near the campfire.
     * Default: 1.5x (1.5 HP/s)
     */
    restingMultiplier: 1.5,

    /**
     * Multiplier for soul campfires (blue fire).
     * Default: 1.25x
     */
    soulCampfireMultiplier: 1.25,

    /**
     * Also regenerate nearby tamed pets (wolves, cats, horses, parrots).
     * Default: true
     */
    healPets: true,

    /**
     * Also regenerate nearby neutral mobs (iron golems, snow golems, pandas, bees, dolphins, etc.).
     * Default: true
     */
    healNeutralMobs: true,

    /**
     * Also regenerate nearby passive mobs and farm animals (cows, sheep, pigs, chickens, villagers, etc.).
     * Default: true
     */
    healPassiveMobs: true,

    /**
     * Spawn warm healing heart particles while regenerating.
     * Default: true
     */
    showParticles: true,

    /**
     * BURN HOSTILE MOBS NEAR CAMPFIRE
     * Lit campfires actively burn, repel, and debuff hostile mobs that come within radius.
     * Default: true
     */
    burnHostiles: true,

    /**
     * Exempt named hostile mobs (custom name tags) from campfire damage, burning, debuffs, and knockback.
     * Prevents pet hostile mobs, trophy mobs, and nametagged farm mobs (e.g. iron farm zombies) from being harmed.
     * Default: true
     */
    exemptNamedHostiles: true,

    /**
     * Distance in blocks from lit campfire where hostile mobs catch fire and get debuffed.
     * Default: 10
     */
    burnHostilesRadius: 10,

    /**
     * Duration in seconds hostile mobs burn when approaching or remaining inside lit campfire radius.
     * Continuously kept at this duration while inside radius and lingers upon exit.
     * Default: 3
     */
    burnHostileDurationSeconds: 3,

    /**
     * Apply status debuffs to hostile mobs inside the campfire radius.
     * Default: true
     */
    debuffHostiles: true,

    /**
     * Apply Slowness debuff to hostile mobs (Slowness I for normal campfire, Slowness II for soul campfire).
     * Default: true
     */
    debuffSlowness: true,

    /**
     * Apply Weakness debuff to hostile mobs, reducing their melee attack damage.
     * Default: true
     */
    debuffWeakness: true,

    /**
     * Suppress hostile mob regeneration and strip regeneration / absorption effects in campfire radius.
     * Default: true
     */
    debuffRegen: true,

    /**
     * Apply Mining Fatigue debuff to hostile mobs, slowing their attack swing and wind-up speed.
     * Default: true
     */
    debuffMiningFatigue: true,

    /**
     * Apply brief disorienting Blindness (2 seconds) to hostile mobs in soul campfire mystical smoke.
     * Default: true
     */
    debuffSoulBlindness: true,

    /**
     * Duration of debuff effects in seconds (refreshed every second while inside radius).
     * Default: 3
     */
    debuffDurationSeconds: 3,

    /**
     * Damage multiplier applied when a hostile mob takes damage from a campfire.
     * Hostile mobs standing on lit campfires take 3x damage (3 HP / 1.5 hearts for campfire, 6 HP / 3 hearts for soul campfire).
     * Default: 3.0
     */
    hostileDamageMultiplier: 3.0,
};

export const AutoShieldConfig = {
    /**
     * Enable automatic shield defense.
     * Automatically blocks blockable attacks (melee attacks, arrows, tridents, fireballs, explosions)
     * even while attacking, sprinting, or jumping without needing to crouch/sneak.
     * Default: true
     */
    enabled: true,

    /**
     * Block attacks coming from the front (within 180° field of view).
     * If false, blocks all incoming attacks from 360 degrees.
     * Default: true
     */
    blockFrontOnly: true,

    /**
     * Automatically equip a shield from inventory/hotbar into an empty offhand slot.
     * Default: true
     */
    autoEquipToOffhand: false,

    /**
     * Play authentic Minecraft shield block sound upon blocking an attack.
     * Default: true
     */
    playSound: true,

    /**
     * Spawn deflection particle effects upon blocking an attack.
     * Default: true
     */
    showParticles: true,

    /**
     * Apply a small knockback recoil to melee attackers upon being blocked.
     * Default: true
     */
    knockbackAttacker: true,
};

export const PassivePotionConfig = {
    /**
     * Enable passive buff effects from carrying positive potions in inventory, hotbar, mainhand, or offhand
     * without needing to drink or throw them.
     * Default: true
     */
    enabled: true,

    /**
     * How often to scan inventory and refresh passive potion buffs (in ticks).
     * 20 ticks = 1 second.
     * Default: 20
     */
    checkIntervalTicks: 20,

    /**
     * Duration in ticks applied to the player on each refresh (keeps buff continuous without lingering if potion is removed).
     * Default: 40 ticks (2 seconds)
     */
    buffDurationTicks: 40,

    /**
     * Show particle swirl effects around the player for passive buffs.
     * Default: false (clean screen view without annoying bubbles)
     */
    showParticles: false,

    /**
     * Check main inventory slots (slots 9-35).
     * Default: true
     */
    includeInventory: true,

    /**
     * Check hotbar slots (slots 0-8).
     * Default: true
     */
    includeHotbar: true,

    /**
     * Check offhand slot.
     * Default: true
     */
    includeOffhand: true,

    /**
     * Periodically heal player if holding a Healing potion and below max health (in ticks).
     * Default: 80 ticks (4 seconds)
     */
    healingIntervalTicks: 80,
};

export const InventorySortingConfig = {
    /**
     * Enable inventory and container sorting.
     * Default: true
     */
    enabled: true,

    /**
     * Automatically sort containers (chests, barrels, shulker boxes) when closed.
     * Default: true
     */
    autoSortOnClose: true,

    /**
     * Hit (punch/attack) any container block to open the Sorter menu.
     * Set to false so punching containers allows breaking/destroying chests normally.
     * Container sorting options are accessed by equipping the Quick Sorter item and right-clicking the chest.
     * Default: false
     */
    hitContainerToOpenMenu: false,

    /**
     * Interact with ground with empty hand to open backpack sorting.
     * Default: true
     */
    emptyHandInteractBackpack: true,

    /**
     * Automatically give the player a "Quick Sorter" custom item on spawn/join if they don't have one.
     * Keeps on death and cannot be dropped or duplicated.
     * Default: true
     */
    giveSorterOnSpawn: true,

    /**
     * Enable using the "Quick Sorter" item by right-clicking in hand or on containers.
     * Default: true
     */
    useSorterItem: true,

    /**
     * Default sorting method when sorting automatically.
     * Options: "category" | "alphabetical" | "quantity" | "quality" | "compact"
     * Default: "category"
     */
    defaultSortType: "category" as "category" | "alphabetical" | "quantity" | "quality" | "compact",

    /**
     * When sorting the player's inventory/backpack, protect hotbar slots (slots 0-8) by default.
     * If true, only slots 9-35 (backpack) are sorted, keeping hotbar tools/weapons safe.
     * Default: true
     */
    protectHotbarByDefault: true,

    /**
     * When sorting a single chest that is paired as a double chest, sort both halves together as a unified 54-slot container.
     * Default: true
     */
    sortDoubleChestsTogether: true,

    /**
     * Play a feedback sound when an inventory or container is sorted.
     * Default: true
     */
    playSound: true,

    /**
     * Sound effect played upon successful sorting.
     * Default: "random.chestopen"
     */
    soundEffect: "random.chestopen",

    /**
     * Show an action bar notification confirming sorting result.
     * Default: true
     */
    showNotification: true,
};

export const CreeperMorningDespawnConfig = {
    /**
     * Enable morning creeper despawn mechanic.
     * Surface creepers exposed to morning sunlight safely despawn with smoke particles,
     * preventing base camping creepers when players step outside in the morning.
     * Underground caves, ravines, and named creepers are completely unaffected.
     * Default: true
     */
    enabled: true,

    /**
     * Only despawn during early morning (ticks 0 to 6000, dawn to noon).
     * If false, despawns during any daytime hour (ticks 0 to 12000) when exposed to daylight.
     * Default: false (despawns when exposed to daylight)
     */
    morningOnly: false,

    /**
     * Minimum sky light level required on the creeper to trigger despawn.
     * Ensures creepers in caves or deep shadows do not despawn.
     * Default: 14
     */
    minSkyLightLevel: 14,

    /**
     * Protect creepers that have custom name tags or are named pets.
     * Default: true
     */
    protectNamedCreepers: true,

    /**
     * How often to scan simulation distance for exposed surface creepers (in ticks).
     * 20 ticks = 1 second.
     * Default: 30 ticks (1.5 seconds)
     */
    checkIntervalTicks: 30,

    /**
     * Spawn smoke / poof particle effect at the creeper's position when despawning.
     * Default: true
     */
    showPoofParticles: true,

    /**
     * Play a fizzing poof sound when a creeper despawns.
     * Default: true
     */
    playSound: true,
};

export const XpMagnetConfig = {
    /**
     * Automatically collect XP orbs from a distance so players don't lose XP
     * in lava pits, deep ravines, cliff faces, or behind blocks.
     * Default: true
     */
    enabled: true,

    /**
     * Attraction distance in blocks around the player.
     * Default: 32 blocks
     */
    radius: 32,

    /**
     * Collection mode:
     * - "instant": Instantly teleports XP orbs directly to the player for immediate absorption.
     * - "vacuum": Smoothly accelerates XP orbs towards the player with magnetic physics.
     * Default: "instant"
     */
    collectionMode: "instant" as "instant" | "vacuum",

    /**
     * Vacuum pull speed when in "vacuum" mode (blocks per check).
     * Default: 1.5
     */
    vacuumSpeed: 1.5,

    /**
     * How often to scan for nearby XP orbs (in ticks).
     * 4 ticks = 5 checks per second.
     * Default: 4
     */
    checkIntervalTicks: 4,

    /**
     * Only activate XP magnet when the player is sneaking.
     * Default: false (always active)
     */
    sneakOnly: false,

    /**
     * Ignore players in Creative or Spectator mode.
     * Default: true
     */
    ignoreCreative: true,
};

export const ChickenEggHatchConfig = {
    /**
     * Enable auto-hatching for laid chicken eggs.
     * Laid chicken eggs on the ground will no longer despawn and be lost;
     * instead, they naturally incubate and hatch into baby chicks.
     * Default: true
     */
    enabled: true,

    /**
     * How many seconds an egg incubates on the ground before hatching into a chick.
     * Default: 30 seconds
     */
    incubationSeconds: 30,

    /**
     * Probability that an incubated egg hatches into a chick (1.0 = 100%).
     * Default: 1.0
     */
    hatchChance: 1.0,

    /**
     * Chance for an egg to hatch twins (2 baby chicks).
     * Default: 0.08 (8%)
     */
    twinChance: 0.08,

    /**
     * Maximum number of chickens allowed in a 6-block radius.
     * If chicken density exceeds this cap, hatching pauses to prevent runaway mob cramming lag.
     * Default: 32
     */
    maxNearbyChickens: 32,

    /**
     * Show cracking / warmth particles while incubating and upon hatching.
     * Default: true
     */
    showParticles: true,

    /**
     * Play egg crack / hatching sound when turning into a chick.
     * Default: true
     */
    playSound: true,

    /**
     * How often to check incubating eggs (in ticks).
     * 20 ticks = 1 second.
     * Default: 20 ticks
     */
    checkIntervalTicks: 20,
};

/**
 * Auto Water Bucket (MLG Clutch) Configuration
 */
export const AutoWaterBucketConfig = {
    /**
     * Enable automatic water bucket clutch when falling from heights.
     * Places water right before impact to eliminate fall damage, then auto-retrieves it.
     * Default: true
     */
    enabled: true,

    /**
     * Fall trigger sensitivity mode:
     * - "damaging_falls": Triggers on any fall that would cause fall damage (> minFallDistance blocks).
     * - "lethal_only": Triggers only if the projected fall damage would kill the player (fallDamage >= currentHealth).
     * Default: "damaging_falls"
     */
    mode: "damaging_falls" as "damaging_falls" | "lethal_only",

    /**
     * Minimum distance fallen (in blocks) before considering fall damage.
     * Vanilla Minecraft fall damage starts above 3 blocks.
     * Default: 4.0 blocks
     */
    minFallDistance: 4.0,

    /**
     * Downward vertical velocity threshold (blocks/tick) to detect rapid falling.
     * Normal jumps and walking off 1 block maintain velocity > -0.6.
     * Default: -0.75
     */
    downwardVelocityThreshold: -0.75,

    /**
     * Distance to ground (in blocks) at which water is placed.
     * Placed 1.5 - 2.5 blocks before impact for a clean clutch.
     * Default: 2.2 blocks
     */
    triggerDistanceBlocks: 2.2,

    /**
     * Automatically scoop water back up into the bucket 2-4 ticks after landing.
     * Keeps your surroundings clean and avoids accidental flooding/washing away redstone.
     * Default: true
     */
    autoRetrieveWater: true,

    /**
     * Delay in ticks before retrieving the placed water block.
     * 1-4 ticks gives enough time for the player to touch water and reset fall distance to 0.
     * Default: 3 ticks
     */
    retrieveDelayTicks: 3,

    /**
     * Search entire inventory for a water bucket (true), or only hands/hotbar (false).
     * Default: true
     */
    searchEntireInventory: true,

    /**
     * Cooldown in ticks per player between clutches to prevent multiple triggers during one fall.
     * 20 ticks = 1 second.
     * Default: 40 ticks (2 seconds)
     */
    cooldownTicks: 40,

    /**
     * Play splash sound and particles on clutch.
     * Default: true
     */
    playEffects: true,

    /**
     * Send action bar notification to the player when a clutch is performed.
     * Default: true
     */
    notifyPlayer: true,
};


