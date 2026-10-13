import { world } from "@minecraft/server";
import { handleTreeBreak } from "./features/treeCapitator";
import { handleVeinMine } from "./features/veinMiner";
import { initFarmingFeature } from "./features/farming";
import { initImmortalPetsFeature } from "./features/immortalPets";
import { initDynamicLightingFeature } from "./features/dynamicLight";
import { initDurabilityFeature } from "./features/durability";
import { initAutoTotemFeature } from "./features/autoTotem";
import { initAutoFishingFeature } from "./features/autoFishing";
import { initMobHealthBarFeature } from "./features/mobHealthBar";
import { initCampfireRegenFeature } from "./features/campfireRegen";
import { initAutoShieldFeature } from "./features/autoShield";
import { initPassivePotionsFeature } from "./features/passivePotions";
import { initInventorySortingFeature } from "./features/inventorySorting";
import { initCreeperMorningDespawnFeature } from "./features/creeperDespawn";
import { initXpMagnetFeature } from "./features/xpMagnet";
import { initEggHatchingFeature } from "./features/eggHatching";

// Initialize Features
initFarmingFeature();
initImmortalPetsFeature();
initDynamicLightingFeature();
initDurabilityFeature();
initAutoTotemFeature();
initAutoFishingFeature();
initMobHealthBarFeature();
initCampfireRegenFeature();
initAutoShieldFeature();
initPassivePotionsFeature();
initInventorySortingFeature();
initCreeperMorningDespawnFeature();
initXpMagnetFeature();
initEggHatchingFeature();

// Clear any residual titles / subtitles on player spawn to ensure HUD is completely clean
world.afterEvents.playerSpawn.subscribe((event) => {
    try {
        event.player.onScreenDisplay.setTitle("");
        event.player.onScreenDisplay.updateSubtitle("");
    } catch {
        // Ignore
    }
});

// Register block break listener
world.afterEvents.playerBreakBlock.subscribe((event) => {
    handleTreeBreak(event);
    handleVeinMine(event);
});
