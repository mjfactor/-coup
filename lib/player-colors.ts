export interface PlayerColorTheme {
    bg: string;
    border: string;
    text: string;
    accent: string;
    ring: string;
    softBg: string;
}

export const PLAYER_COLORS: PlayerColorTheme[] = [
    {
        bg: "bg-red-500",
        border: "border-red-500",
        text: "text-red-400",
        accent: "bg-red-500",
        ring: "ring-red-500/50",
        softBg: "bg-red-500/10",
    },
    {
        bg: "bg-blue-500",
        border: "border-blue-500",
        text: "text-blue-400",
        accent: "bg-blue-500",
        ring: "ring-blue-500/50",
        softBg: "bg-blue-500/10",
    },
    {
        bg: "bg-green-500",
        border: "border-green-500",
        text: "text-green-400",
        accent: "bg-green-500",
        ring: "ring-green-500/50",
        softBg: "bg-green-500/10",
    },
    {
        bg: "bg-amber-500",
        border: "border-amber-500",
        text: "text-amber-400",
        accent: "bg-amber-500",
        ring: "ring-amber-500/50",
        softBg: "bg-amber-500/10",
    },
    {
        bg: "bg-pink-500",
        border: "border-pink-500",
        text: "text-pink-400",
        accent: "bg-pink-500",
        ring: "ring-pink-500/50",
        softBg: "bg-pink-500/10",
    },
    {
        bg: "bg-cyan-500",
        border: "border-cyan-500",
        text: "text-cyan-400",
        accent: "bg-cyan-500",
        ring: "ring-cyan-500/50",
        softBg: "bg-cyan-500/10",
    },
];

export function getPlayerColor(index: number): PlayerColorTheme {
    const safeIndex = ((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length;
    return PLAYER_COLORS[safeIndex];
}

export function getPlayerInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || "?";
}
