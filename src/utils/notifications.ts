import { Player } from "@minecraft/server";

/**
 * Displays a temporary notification directly on the player's Action Bar HUD.
 */
export function showPlayerNotification(player: Player, text: string, durationMs: number = 2500): void {
    if (!player || !player.isValid) return;
    try {
        player.onScreenDisplay.setActionBar(text);
    } catch {
        // Ignore
    }
}
