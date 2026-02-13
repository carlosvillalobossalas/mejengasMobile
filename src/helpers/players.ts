/**
 * Get player display name (prefer name, fallback to originalName)
 * Format: "FirstName L" (first name + first letter of last name)
 */
export function getPlayerDisplay(
    player: any
): string {
    if (!player?.name) return 'Desconocido';
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(player.name);
    if (!isEmail && player?.name) {
        return player.name;
    } else if (isEmail) {
        return player?.originalName || 'Sin nombre';
    }
    return player?.name || player?.originalName || 'Sin nombre';


}

export function getPlayerShortDisplay(
    player: any
): string {
    if (!player) {
        return 'Desconocido';
    }

    let fullName = player.name || player.originalName || 'Desconocido';

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fullName);
    if (isEmail && player?.originalName) {
        fullName = player.originalName;
    }

    const names = fullName.split(' ');

    if (names.length === 1) {
        return names[0];
    }

    return `${names[0]} ${names[1][0]}`;
}

export const getPlayerInitial = (name?: string): string => {
    return name ? name.charAt(0).toUpperCase() : '?';
};