"use client";

import { useState, useEffect } from "react";
import { Card as CardUI, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GameState, ActionType, CharacterType, Player, GameLogEntry } from "@/lib/game-logic";
import { Coins, Crown, Skull, Shield, Users, BookOpen, X, History, Swords, AlertTriangle, RefreshCw, Hourglass, Target, Eye, WifiOff, UserX, Trophy, Volume2, VolumeX, SmilePlus } from "lucide-react";
import type { PlayerReaction, RoomStats } from "@/lib/usePartyKit";
import { getPlayerColor, getPlayerInitial } from "@/lib/player-colors";
import Image from "next/image";
import { RulesModal } from "./rules-modal";
import { StartingPlayerRoulette } from "./starting-player-roulette";
import { CHARACTER_IMAGES, getVariantConfig } from "@/lib/variants";

interface TargetSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (targetId: string) => void;
    actionType: string;
    players: Player[];
}

function TargetSelectionModal({
    isOpen,
    onClose,
    onSelect,
    actionType,
    players,
}: TargetSelectionModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <CardUI className="bg-linear-to-br from-slate-800 to-slate-900 border-2 border-purple-500 max-w-md w-full relative animate-in zoom-in-95 duration-200">
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 text-slate-400 hover:text-white"
                    onClick={onClose}
                >
                    <X className="size-4" />
                </Button>
                <CardHeader>
                    <CardTitle className="text-2xl text-purple-300 flex items-center gap-2 capitalize">
                        <Users className="size-6" />
                        Select Target for {actionType.replace('_', ' ')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                        {players.map((player) => (
                            <Button
                                key={player.id}
                                onClick={() => onSelect(player.id)}
                                className="h-14 text-lg justify-between px-6 bg-slate-700 hover:bg-slate-600 border border-slate-600"
                            >
                                <span>{player.name}</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-slate-400 font-normal flex items-center gap-1">
                                        <Coins className="size-3 text-yellow-400" />
                                        {player.coins}
                                    </span>
                                    <span className="text-sm text-slate-400 font-normal flex items-center gap-1">
                                        <Shield className="size-3 text-purple-400" />
                                        {player.cards.filter(c => !c.revealed).length}
                                    </span>
                                </div>
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </CardUI>
        </div>
    );
}

interface DisconnectedPlayerInfo {
    playerId: string;
    disconnectedAt: number;
    gracePeriodMs: number;
}

interface GameBoardProps {
    gameState: GameState;
    myPlayerId: string;
    isHost: boolean;
    roomStats: RoomStats | null;
    disconnectedPlayers: Map<string, DisconnectedPlayerInfo>;
    soundMuted: boolean;
    reactions: PlayerReaction[];
    onAction: (action: ActionType, targetId?: string) => void;
    onReturnToLobby: () => void;
    onKickPlayer: (playerId: string) => void;
    onToggleSound: () => void;
    onReaction: (emoji: string) => void;
}

const formatLogMessage = (message: string, players: { name: string }[], characters: CharacterType[]) => {
    const characterColors: Record<string, string> = {
        Duke: "text-purple-400 font-bold",
        Assassin: "text-red-400 font-bold",
        Captain: "text-cyan-400 font-bold",
        Ambassador: "text-indigo-400 font-bold",
        Contessa: "text-orange-400 font-bold",
        Inquisitor: "text-emerald-400 font-bold",
    };

    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const playerNames = players.map(p => p.name).filter(Boolean);
    playerNames.sort((a, b) => b.length - a.length);

    const patterns = [
        ...playerNames.map(name => `\\b${escapeRegExp(name)}\\b`),
        ...characters.map(char => `\\b${char}\\b`)
    ];

    if (patterns.length === 0) return message;

    const regex = new RegExp(`(${patterns.join('|')})`, 'g');

    const parts = message.split(regex);

    return parts.map((part, index) => {
        if (characters.includes(part as CharacterType)) {
            return <span key={index} className={characterColors[part]}>{part}</span>;
        }
        const playerIndex = players.findIndex(p => p.name === part);
        if (playerIndex !== -1) {
            const color = getPlayerColor(playerIndex).text;
            return <span key={index} className={`${color} font-bold`}>{part}</span>;
        }
        return part;
    });
};

function PlayerAvatar({
    name,
    playerIndex,
    size = "md",
    stateIcon,
}: {
    name: string;
    playerIndex: number;
    size?: "sm" | "md" | "lg";
    stateIcon?: "you" | "turn" | "target";
}) {
    const color = getPlayerColor(playerIndex);
    const sizeClass = size === "lg" ? "size-10" : size === "sm" ? "size-8" : "size-9";
    const Icon = stateIcon === "you" ? Shield : stateIcon === "turn" ? Crown : stateIcon === "target" ? Target : null;
    const iconClass = stateIcon === "target"
        ? "bg-red-500 text-white"
        : stateIcon === "turn"
            ? "bg-blue-500 text-white"
            : "bg-purple-500 text-white";

    return (
        <div className={`relative ${sizeClass} shrink-0 rounded-full ${color.bg} ${color.ring} ring-2 flex items-center justify-center text-white font-black shadow-lg`}>
            <span>{getPlayerInitial(name)}</span>
            {Icon && (
                <span className={`absolute -bottom-1 -right-1 size-4 rounded-full ${iconClass} border border-slate-950 flex items-center justify-center`}>
                    <Icon className="size-2.5" />
                </span>
            )}
        </div>
    );
}

const REACTION_EMOJIS = ["👍", "👏", "😂", "😮", "🤔", "💀", "🔥"];

function CoinBadge({ coins }: { coins: number }) {
    const [isChanging, setIsChanging] = useState(false);
    const [previousCoins, setPreviousCoins] = useState(coins);

    useEffect(() => {
        if (coins === previousCoins) return;
        setPreviousCoins(coins);
        setIsChanging(true);
        const timer = setTimeout(() => setIsChanging(false), 500);
        return () => clearTimeout(timer);
    }, [coins, previousCoins]);

    return (
        <div className={`flex items-center gap-2 bg-black/20 px-3 py-1 rounded-full border border-white/5 transition-all duration-300 ${isChanging ? "scale-110 shadow-lg shadow-yellow-500/30" : ""}`}>
            <Coins className="size-4 text-yellow-400" />
            <span className="text-xl font-bold text-yellow-400">{coins}</span>
        </div>
    );
}

function VictoryCountdown({
    winnerName,
    roomStats,
    gameState,
    onReturnToLobby,
}: {
    winnerName: string;
    roomStats: RoomStats | null;
    gameState: GameState;
    onReturnToLobby: () => void;
}) {
    const [showStats, setShowStats] = useState(false);

    useEffect(() => {
        const statsTimer = setTimeout(() => setShowStats(true), 1500);
        return () => clearTimeout(statsTimer);
    }, []);

    const sortedStats = roomStats
        ? Object.values(roomStats.playerStats).sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed)
        : [];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50">
            <div className="bg-linear-to-br from-purple-900 to-pink-900 rounded-2xl p-8 border-4 border-yellow-500 shadow-2xl text-center animate-in zoom-in duration-500 max-w-lg w-full mx-4">
                <div className="text-7xl mb-3">👑</div>
                <h2 className="text-5xl font-black mb-2 text-yellow-400 drop-shadow-lg">Victory!</h2>
                <p className="text-3xl text-white mb-2 font-bold">
                    {winnerName}
                </p>
                <p className="text-lg text-purple-200 mb-6">wins the game!</p>

                {/* Final standings */}
                <div className="bg-black/30 rounded-xl p-4 mb-4 text-left">
                    <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider mb-3">Final Standings</h3>
                    <div className="space-y-2">
                        {gameState.players.slice()
                            .sort((a, b) => {
                                if (a.id === gameState.winner) return -1;
                                if (b.id === gameState.winner) return 1;
                                const aAlive = a.cards.filter(c => !c.revealed).length;
                                const bAlive = b.cards.filter(c => !c.revealed).length;
                                return bAlive - aAlive;
                            })
                            .map((player) => {
                                const playerIndex = gameState.players.findIndex(p => p.id === player.id);
                                const color = getPlayerColor(playerIndex);
                                return (
                                <div key={player.id} className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                                    player.id === gameState.winner ? "bg-yellow-500/20" : ""
                                }`}>
                                    <div className="flex items-center gap-2">
                                        {player.id === gameState.winner && <Trophy className="size-4 text-yellow-400" />}
                                        <span className={`font-semibold ${player.id === gameState.winner ? "text-yellow-300" : color.text}`}>
                                            {player.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">
                                            {player.cards.filter(c => !c.revealed).length} card{player.cards.filter(c => !c.revealed).length !== 1 ? 's' : ''} left
                                        </span>
                                        <span className="text-xs text-amber-400 font-mono">{player.coins}¢</span>
                                    </div>
                                </div>
                            )})}
                    </div>
                </div>

                {/* Room stats leaderboard */}
                {showStats && sortedStats.length > 0 && roomStats && roomStats.totalGamesPlayed > 1 && (
                    <div className="bg-black/30 rounded-xl p-4 mb-6 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wider mb-3">
                            Leaderboard ({roomStats.totalGamesPlayed} games)
                        </h3>
                        <div className="space-y-1.5">
                            {sortedStats.map((stat, index) => {
                                const playerIndex = gameState.players.findIndex(player => player.id === stat.playerId);
                                const color = getPlayerColor(playerIndex === -1 ? index : playerIndex);
                                return (
                                <div key={stat.playerId} className="flex items-center justify-between py-1 px-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold w-5 ${index === 0 ? "text-yellow-400" : "text-slate-500"}`}>
                                            #{index + 1}
                                        </span>
                                        <span className={`font-medium ${index === 0 ? "text-yellow-300" : color.text}`}>
                                            {stat.playerName}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                        <span className="text-emerald-400 font-bold">{stat.wins}W</span>
                                        <span className="text-slate-500">{stat.gamesPlayed - stat.wins}L</span>
                                        <span className="text-slate-400 font-mono">
                                            {Math.round((stat.wins / stat.gamesPlayed) * 100)}%
                                        </span>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>
                )}

                <Button
                    onClick={onReturnToLobby}
                    className="w-full h-12 text-lg font-bold bg-yellow-600 hover:bg-yellow-500 text-white"
                >
                    Return to Lobby
                </Button>
            </div>
        </div>
    );
}

function GameLogList({ groupedLogs, players, characters }: { groupedLogs: Record<string, GameLogEntry[]>, players: Player[], characters: CharacterType[] }) {
    return (
        <div className="py-6 space-y-8">
            {Object.entries(groupedLogs).reverse().map(([turn, logs]) => (
                <div key={turn} className="relative">
                    <div className="sticky top-0 z-10 flex items-center gap-4 mb-6">
                        <div className="bg-slate-800/90 backdrop-blur text-slate-400 text-[10px] font-bold px-3 py-1 rounded-full border border-slate-700 uppercase tracking-wider shadow-sm">
                            Turn {turn}
                        </div>
                        <div className="h-px flex-1 bg-linear-to-r from-slate-800 to-transparent"></div>
                    </div>
                    <div className="space-y-1 pl-2">
                        {logs.slice().reverse().map((entry, i) => {
                            let Icon = Users;
                            let iconColor = "text-slate-500";
                            let iconBg = "bg-slate-800/50";

                            // Determine icon based on content
                            if (entry.message.includes("Game started")) {
                                Icon = Crown;
                                iconColor = "text-yellow-400";
                                iconBg = "bg-yellow-500/10";
                            } else if (entry.message.includes("eliminated")) {
                                Icon = Skull;
                                iconColor = "text-red-400";
                                iconBg = "bg-red-500/10";
                            } else if (entry.message.includes("challenges")) {
                                Icon = AlertTriangle;
                                iconColor = "text-orange-400";
                                iconBg = "bg-orange-500/10";
                            } else if (entry.message.includes("blocks")) {
                                Icon = Shield;
                                iconColor = "text-blue-400";
                                iconBg = "bg-blue-500/10";
                            } else if (entry.message.includes("income") || entry.message.includes("foreign_aid") || entry.message.includes("tax") || entry.message.includes("steal")) {
                                Icon = Coins;
                                iconColor = "text-emerald-400";
                                iconBg = "bg-emerald-500/10";
                            } else if (entry.message.includes("assassinate") || entry.message.includes("Coup")) {
                                Icon = Swords;
                                iconColor = "text-red-400";
                                iconBg = "bg-red-500/10";
                            } else if (entry.message.includes("exchange") || entry.message.includes("inquire")) {
                                Icon = RefreshCw;
                                iconColor = "text-indigo-400";
                                iconBg = "bg-indigo-500/10";
                            } else if (entry.message.includes("interrogate")) {
                                Icon = Eye;
                                iconColor = "text-emerald-400";
                                iconBg = "bg-emerald-500/10";
                            }

                            return (
                                <div key={i} className="group flex gap-4 relative pb-6 last:pb-0">
                                    {/* Timeline line */}
                                    {i !== logs.length - 1 && (
                                        <div className="absolute left-[19px] top-10 bottom-0 w-px bg-slate-800 group-last:hidden" />
                                    )}

                                    <div className={`relative z-10 shrink-0 size-10 rounded-full flex items-center justify-center border border-slate-800 ${iconBg} shadow-sm`}>
                                        <Icon className={`size-5 ${iconColor}`} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3.5 hover:bg-slate-800/40 hover:border-slate-700/60 transition-all duration-200 group-hover:shadow-md group-hover:shadow-black/20">
                                            <p className="text-sm text-slate-300 leading-relaxed wrap-break-word">
                                                {formatLogMessage(entry.message, players, characters)}
                                            </p>
                                            <p className="text-[10px] text-slate-600 mt-2 font-medium uppercase tracking-wide flex items-center gap-1">
                                                <History className="size-3" />
                                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

function DeckView({ count }: { count: number }) {
    return (
        <div className="relative w-10 h-14 md:w-12 md:h-16 group" title={`${count} cards remaining in Court Deck`}>
            {/* Stack effect layers */}
            {count > 1 && (
                <div className="absolute top-0 left-0 w-full h-full bg-slate-700 rounded border border-slate-600 translate-x-1 translate-y-1" />
            )}
            {count > 2 && (
                <div className="absolute top-0 left-0 w-full h-full bg-slate-700 rounded border border-slate-600 translate-x-0.5 translate-y-0.5" />
            )}

            {/* Top card */}
            <div className="absolute top-0 left-0 w-full h-full bg-slate-800 rounded border border-slate-600 overflow-hidden shadow-lg">
                <Image
                    src="/textures/card-back.svg"
                    alt="Deck"
                    fill
                    className="object-cover"
                />
            </div>

            {/* Count badge */}
            <div className="absolute -bottom-2 -right-2 bg-slate-900 text-slate-200 text-xs font-bold px-1.5 py-0.5 rounded-full border border-slate-700 shadow-sm z-10 min-w-6 text-center">
                {count}
            </div>
        </div>
    )
}

export function GameBoard({
    gameState,
    myPlayerId,
    isHost,
    roomStats,
    disconnectedPlayers,
    soundMuted,
    reactions,
    onAction,
    onReturnToLobby,
    onKickPlayer,
    onToggleSound,
    onReaction,
}: GameBoardProps) {
    const [showRules, setShowRules] = useState(false);
    const [selectedTargetAction, setSelectedTargetAction] = useState<ActionType | null>(null);
    const [hasSeenRoulette, setHasSeenRoulette] = useState(false);
    const [showReactions, setShowReactions] = useState(false);
    const [reactionCooldown, setReactionCooldown] = useState(false);
    const variantConfig = getVariantConfig(gameState.variant);

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const myPlayer = gameState.players.find(p => p.id === myPlayerId);
    const isMyTurn = currentPlayer.id === myPlayerId;
    const alivePlayers = gameState.players.filter(p => p.isAlive);

    // Show roulette if it's the very start of the game (Turn 1, only "Game started" log) and we haven't seen it yet
    const showRoulette = gameState.turn === 1 && gameState.log.length === 1 && !hasSeenRoulette;

    if (!myPlayer) return null;

    const handleTargetSelection = (targetId: string) => {
        if (selectedTargetAction) {
            onAction(selectedTargetAction, targetId);
            setSelectedTargetAction(null);
        }
    };

    const handleReaction = (emoji: string) => {
        if (reactionCooldown) return;
        onReaction(emoji);
        setReactionCooldown(true);
        setShowReactions(false);
        setTimeout(() => setReactionCooldown(false), 1000);
    };

    const groupedLogs = gameState.log.reduce((acc, entry) => {
        const turn = entry.turn || 1;
        if (!acc[turn]) acc[turn] = [];
        acc[turn].push(entry);
        return acc;
    }, {} as Record<number, typeof gameState.log>);

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col lg:flex-row overflow-hidden">
            <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} variant={gameState.variant} />

            {showRoulette && (
                <StartingPlayerRoulette
                    players={gameState.players}
                    startingPlayerId={currentPlayer.id}
                    onComplete={() => setHasSeenRoulette(true)}
                />
            )}

            <TargetSelectionModal
                isOpen={!!selectedTargetAction}
                onClose={() => setSelectedTargetAction(null)}
                onSelect={handleTargetSelection}
                actionType={selectedTargetAction || ''}
                players={alivePlayers.filter(p => p.id !== myPlayerId)}
            />

            {/* Main Game Area */}
            <div className="flex-1 h-screen overflow-y-auto p-4 md:p-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="max-w-5xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex justify-between items-center bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 border border-slate-700">
                        <div className="flex items-center gap-4">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-purple-400 to-pink-600">
                                    Coup — {variantConfig.label}
                                </h1>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowRules(true)}
                                className="hidden md:flex gap-2 border-purple-500/50 text-purple-300 bg-transparent hover:text-white hover:bg-purple-900/50"
                            >
                                <BookOpen className="size-4" />
                                Rules
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowRules(true)}
                                className="md:hidden text-purple-300 hover:text-white hover:bg-purple-900/50"
                            >
                                <BookOpen className="size-5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onToggleSound}
                                className="text-slate-300 hover:text-white hover:bg-slate-700/70"
                                title={soundMuted ? "Unmute sounds" : "Mute sounds"}
                            >
                                {soundMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                            </Button>
                        </div>

                        {/* Deck View - Centered on larger screens, hidden on very small if needed or adjusted */}
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center mr-4">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Deck</span>
                                <DeckView count={gameState.courtDeck.length} />
                            </div>

                            <div className="text-right">
                                <div className="flex items-center gap-2 text-slate-400 text-sm justify-end">
                                    <Users className="size-4" />
                                    <span>{alivePlayers.length} players alive</span>
                                </div>
                                <p className="text-lg font-semibold capitalize text-purple-400">
                                    {gameState.phase.replace('_', ' ')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Players Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {gameState.players.map((player, playerIndex) => {
                            const isMe = player.id === myPlayerId;
                            const isCurrentTurn = player.id === currentPlayer.id;
                            const isTargeted = gameState.pendingAction?.targetId === player.id;
                            const color = getPlayerColor(playerIndex);
                            const playerReactions = reactions.filter(reaction => reaction.playerId === player.id);
                            const avatarState = isTargeted ? "target" : isMe ? "you" : isCurrentTurn ? "turn" : undefined;

                            const isWaitingForAction = (() => {
                                if (!player.isAlive) return false;

                                switch (gameState.phase) {
                                    case 'action':
                                    case 'exchange':
                                        return player.id === currentPlayer.id;
                                    case 'lose_influence':
                                        return player.id === gameState.pendingInfluenceLoss;
                                    case 'block_window':
                                        return gameState.pendingAction?.actorId !== player.id && !gameState.passedPlayers.includes(player.id);
                                    case 'interrogate_select':
                                        return player.id === gameState.pendingInterrogate?.targetId;
                                    case 'interrogate_decision':
                                        return player.id === gameState.pendingAction?.actorId;
                                    case 'challenge_window':
                                        if (gameState.pendingBlock) {
                                            return gameState.pendingBlock.blockerId !== player.id && !gameState.passedPlayers.includes(player.id);
                                        }
                                        return gameState.pendingAction?.actorId !== player.id && !gameState.passedPlayers.includes(player.id);
                                    default:
                                        return false;
                                }
                            })();

                            return (
                                <div
                                    key={player.id}
                                    className={`rounded-lg p-4 transition-all duration-500 relative overflow-hidden ${isTargeted
                                        ? "bg-red-900/30 border-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse"
                                        : isMe
                                            ? "bg-linear-to-br from-purple-900/30 to-pink-900/30 border-2 border-purple-500/50 shadow-lg shadow-purple-500/20"
                                            : isCurrentTurn
                                                ? "bg-linear-to-br from-blue-900/30 to-cyan-900/30 border-2 border-blue-500/50 shadow-lg shadow-blue-500/20 animate-pulse"
                                                : player.isAlive
                                                    ? "bg-slate-800/50 border border-slate-700"
                                                    : "bg-slate-900/50 border border-slate-800 opacity-50 scale-[0.98]"
                                        }`}
                                >
                                    <div className={`absolute inset-y-0 left-0 w-1 ${color.accent}`} />
                                    {playerReactions.map((reaction, reactionIndex) => (
                                        <div
                                            key={reaction.id}
                                            className="absolute left-1/2 z-30 reaction-float pointer-events-none"
                                            style={{ top: `${12 + reactionIndex * 8}px` }}
                                        >
                                            <div className="rounded-full bg-slate-950/90 border border-slate-700 px-3 py-1 shadow-xl flex items-center gap-2">
                                                <span className="text-2xl leading-none">{reaction.emoji}</span>
                                                <span className="text-xs text-slate-300 font-semibold max-w-24 truncate">{reaction.playerName}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {isTargeted && (
                                        <div className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg z-20 flex items-center gap-1 animate-bounce">
                                            <Target className="size-3" />
                                            TARGETED
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <PlayerAvatar name={player.name} playerIndex={playerIndex} stateIcon={avatarState} />
                                            <div className="min-w-0">
                                                <h3 className="text-lg font-bold flex items-center gap-2">
                                                    <span className={`truncate ${color.text}`}>{player.name}</span>
                                                    {isMe && <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 shrink-0">You</span>}
                                                    {isWaitingForAction && (
                                                        <span className="flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-500/30 animate-pulse shrink-0">
                                                            <Hourglass className="size-3" />
                                                            Waiting
                                                        </span>
                                                    )}
                                                </h3>
                                                {!player.isAlive && (
                                                    <span className="text-xs text-red-400 font-semibold">Eliminated</span>
                                                )}
                                                {player.isAlive && isCurrentTurn && !isMe && (
                                                    <span className="text-xs text-blue-400">Current Turn</span>
                                                )}
                                                {isTargeted && (
                                                    <span className="text-xs text-red-400 font-bold animate-pulse">Targeted by Action</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Kick button for host */}
                                            {isHost && !isMe && player.isAlive && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onKickPlayer(player.id)}
                                                    className="size-8 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                                                    title={`Kick ${player.name}`}
                                                >
                                                    <UserX className="size-4" />
                                                </Button>
                                            )}
                                            <CoinBadge coins={player.coins} />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 justify-center">
                                        {player.cards.map((card) => (
                                            <div
                                                key={card.id}
                                                className={`w-28 h-40 rounded-lg transition-all duration-300 relative group overflow-hidden shadow-xl ${card.revealed
                                                    ? "opacity-60 grayscale"
                                                    : isMe
                                                        ? `hover:scale-105 hover:z-10 hover:shadow-purple-500/50 ring-2 ${color.ring}`
                                                        : "ring-1 ring-slate-600"
                                                    }`}
                                                title={isMe && !card.revealed ? card.character : "Hidden Card"}
                                            >
                                                {card.revealed ? (
                                                    <div className="w-full h-full relative bg-slate-900 flex flex-col items-center justify-center">
                                                        <Image
                                                            src={CHARACTER_IMAGES[card.character]}
                                                            alt={card.character}
                                                            fill
                                                            className="object-cover opacity-30"
                                                        />
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/40">
                                                            <Skull className="size-8 text-red-500 mb-1 drop-shadow-lg" />
                                                            <span className="text-xs font-bold text-red-500 bg-black/70 px-2 py-1 rounded border border-red-500/30">{card.character}</span>
                                                        </div>
                                                    </div>
                                                ) : isMe ? (
                                                    <div className="w-full h-full relative">
                                                        <Image
                                                            src={CHARACTER_IMAGES[card.character]}
                                                            alt={card.character}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                        <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-black/90 via-black/50 to-transparent p-2 pt-6">
                                                            <p className="text-center text-white font-bold text-sm shadow-black drop-shadow-md">{card.character}</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-full relative bg-slate-800">
                                                        <Image
                                                            src="/textures/card-back.svg"
                                                            alt="Hidden Card"
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Action Area / Status Messages */}
                    <div className="space-y-4">
                        {isMyTurn && gameState.phase === 'action' && myPlayer.isAlive && (
                            <div className="bg-linear-to-r from-purple-900/30 to-pink-900/30 backdrop-blur-sm rounded-lg p-6 border-2 border-purple-500/50 shadow-xl">
                                <h2 className="text-2xl font-bold mb-4 text-purple-300 flex items-center gap-2">
                                    <Crown className="size-6" />
                                    Choose Your Action
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {/* Basic Actions */}
                                    <Button
                                        onClick={() => onAction('income')}
                                        className="h-auto py-4 flex flex-col items-start bg-green-600 hover:bg-green-700 transition-all hover:scale-105"
                                        disabled={myPlayer.coins >= 10}
                                    >
                                        <span className="text-lg font-bold">{variantConfig.actionUi.income.label}</span>
                                        <span className="text-xs opacity-80">{variantConfig.actionUi.income.description}</span>
                                    </Button>

                                    <Button
                                        onClick={() => onAction('foreign_aid')}
                                        className="h-auto py-4 flex flex-col items-start bg-blue-600 hover:bg-blue-700 transition-all hover:scale-105"
                                        disabled={myPlayer.coins >= 10}
                                    >
                                        <span className="text-lg font-bold">{variantConfig.actionUi.foreign_aid.label}</span>
                                        <span className="text-xs opacity-80">{variantConfig.actionUi.foreign_aid.description}</span>
                                    </Button>

                                    {/* Character Actions */}
                                    {variantConfig.actionGroups.character.map((action) => (
                                        <Button
                                            key={action}
                                            onClick={() => onAction(action)}
                                            className={`h-auto py-4 flex flex-col items-start transition-all hover:scale-105 ${action === 'tax'
                                                ? 'bg-purple-600 hover:bg-purple-700'
                                                : action === 'interrogate'
                                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                                    : action === 'inquire'
                                                        ? 'bg-indigo-600 hover:bg-indigo-700'
                                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                                }`}
                                            disabled={myPlayer.coins >= 10}
                                        >
                                            <span className="text-lg font-bold">{variantConfig.actionUi[action].label}</span>
                                            <span className="text-xs opacity-80">{variantConfig.actionUi[action].description}</span>
                                        </Button>
                                    ))}
                                </div>

                                {/* Targeted Actions */}
                                {alivePlayers.length > 1 && (
                                    <div className="mt-6 space-y-4">
                                        <h3 className="text-lg font-semibold text-purple-300 border-b border-purple-500/30 pb-2">Targeted Actions</h3>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {variantConfig.actionGroups.targeted.map((action) => {
                                                if (action === 'steal') {
                                                    return (
                                                        <Button
                                                            key={action}
                                                            onClick={() => setSelectedTargetAction('steal')}
                                                            className="h-auto py-4 flex flex-col items-start bg-cyan-900/30 border border-cyan-500 hover:bg-cyan-800 hover:text-white transition-colors"
                                                            disabled={myPlayer.coins >= 10}
                                                        >
                                                            <span className="text-lg font-bold text-cyan-400">{variantConfig.actionUi.steal.label}</span>
                                                            <span className="text-xs opacity-80 text-left">{variantConfig.actionUi.steal.description}</span>
                                                        </Button>
                                                    );
                                                }

                                                if (action === 'assassinate') {
                                                    return (
                                                        <Button
                                                            key={action}
                                                            onClick={() => setSelectedTargetAction('assassinate')}
                                                            className="h-auto py-4 flex flex-col items-start bg-red-900/30 border border-red-500 hover:bg-red-800 hover:text-white transition-colors"
                                                            disabled={myPlayer.coins >= 10 || myPlayer.coins < 3}
                                                        >
                                                            <span className="text-lg font-bold text-red-400">{variantConfig.actionUi.assassinate.label}</span>
                                                            <span className="text-xs opacity-80 text-left">{variantConfig.actionUi.assassinate.description}</span>
                                                        </Button>
                                                    );
                                                }

                                                if (action === 'interrogate') {
                                                    return (
                                                        <Button
                                                            key={action}
                                                            onClick={() => setSelectedTargetAction('interrogate')}
                                                            className="h-auto py-4 flex flex-col items-start bg-emerald-900/30 border border-emerald-500 hover:bg-emerald-800 hover:text-white transition-colors"
                                                            disabled={myPlayer.coins >= 10}
                                                        >
                                                            <span className="text-lg font-bold text-emerald-400">{variantConfig.actionUi.interrogate.label}</span>
                                                            <span className="text-xs opacity-80 text-left">{variantConfig.actionUi.interrogate.description}</span>
                                                        </Button>
                                                    );
                                                }

                                                return (
                                                    <Button
                                                        key={action}
                                                        onClick={() => setSelectedTargetAction('coup')}
                                                        className={`h-auto py-4 flex flex-col items-start border border-orange-500 transition-colors ${myPlayer.coins >= 10
                                                            ? "bg-orange-600 hover:bg-orange-700 text-white animate-pulse"
                                                            : "bg-orange-900/30 hover:bg-orange-800 hover:text-white"
                                                            }`}
                                                        disabled={myPlayer.coins < 7}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg font-bold text-orange-400">{variantConfig.actionUi.coup.label}</span>
                                                            {myPlayer.coins >= 10 && (
                                                                <span className="text-xs bg-yellow-500 text-black px-1 rounded font-bold">REQUIRED</span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs opacity-80 text-left">{variantConfig.actionUi.coup.description}</span>
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Waiting Message */}
                        {!isMyTurn && myPlayer.isAlive && gameState.phase === 'action' && (
                            <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-8 text-center border border-slate-700 shadow-lg">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="size-12 rounded-full bg-slate-700 flex items-center justify-center animate-pulse">
                                        <Users className="size-6 text-slate-400" />
                                    </div>
                                    <p className="text-xl text-slate-300">
                                        Waiting for <span className="font-bold text-white text-2xl">{currentPlayer.name}</span> to take their turn...
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Waiting for Influence Loss */}
                        {gameState.phase === 'lose_influence' && gameState.pendingInfluenceLoss !== myPlayerId && myPlayer.isAlive && (
                            <div className="bg-red-900/20 backdrop-blur-sm rounded-lg p-8 text-center border-2 border-red-500/50 shadow-lg animate-pulse">
                                <div className="flex flex-col items-center gap-3">
                                    <Skull className="size-12 text-red-400" />
                                    <p className="text-xl text-red-300">
                                        Waiting for{" "}
                                        <span className="font-bold text-white text-2xl">
                                            {gameState.players.find(p => p.id === gameState.pendingInfluenceLoss)?.name}
                                        </span>
                                        {" "}to choose a card to reveal...
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Winner Display */}
                    {gameState.winner && (
                        <VictoryCountdown
                            winnerName={gameState.players.find(p => p.id === gameState.winner)?.name || "Unknown Player"}
                            roomStats={roomStats}
                            gameState={gameState}
                            onReturnToLobby={onReturnToLobby}
                        />
                    )}
                </div>
            </div>

            {/* Right Sidebar (Desktop) */}
            <div className="hidden lg:flex w-80 xl:w-96 flex-col border-l border-slate-800 bg-slate-900/50 backdrop-blur-sm h-screen overflow-hidden">
                <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="bg-purple-500/20 p-2.5 rounded-xl border border-purple-500/20">
                            <History className="size-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-purple-100 text-xl font-bold">Game Log</h2>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-0.5">History & Events</p>
                        </div>
                    </div>
                </div>
                <ScrollArea className="flex-1 px-6 h-full">
                    <GameLogList groupedLogs={groupedLogs} players={gameState.players} characters={variantConfig.characters} />
                </ScrollArea>
            </div>

            {/* Emoji Reactions */}
            <div className="fixed bottom-4 left-4 z-50">
                <div className="hidden lg:flex items-center gap-2 rounded-full bg-slate-900/90 border border-slate-700 p-2 shadow-xl backdrop-blur-sm">
                    {REACTION_EMOJIS.map(emoji => (
                        <Button
                            key={emoji}
                            variant="ghost"
                            size="icon"
                            onClick={() => handleReaction(emoji)}
                            disabled={reactionCooldown}
                            className="size-10 rounded-full text-xl hover:bg-slate-700 disabled:opacity-50"
                        >
                            {emoji}
                        </Button>
                    ))}
                </div>

                <div className="lg:hidden flex items-center gap-2">
                    {showReactions && (
                        <div className="flex items-center gap-1 rounded-full bg-slate-900/95 border border-slate-700 p-2 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-left-2">
                            {REACTION_EMOJIS.map(emoji => (
                                <Button
                                    key={emoji}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleReaction(emoji)}
                                    disabled={reactionCooldown}
                                    className="size-9 rounded-full text-lg hover:bg-slate-700 disabled:opacity-50"
                                >
                                    {emoji}
                                </Button>
                            ))}
                        </div>
                    )}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowReactions(prev => !prev)}
                        disabled={reactionCooldown}
                        className="rounded-full h-14 w-14 shadow-xl bg-slate-800 border-amber-500 text-amber-400 hover:bg-slate-700 hover:text-amber-300 disabled:opacity-50"
                    >
                        <SmilePlus className="size-6" />
                    </Button>
                </div>
            </div>

            {/* Mobile Toggle (Sheet) */}
            <div className="lg:hidden">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="fixed bottom-4 right-4 z-50 rounded-full h-14 w-14 shadow-xl bg-slate-800 border-purple-500 text-purple-400 hover:bg-slate-700 hover:text-purple-300"
                        >
                            <History className="size-6" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent className="bg-slate-950 border-l-slate-800 text-slate-200 w-[400px] sm:w-[540px] p-0 flex flex-col shadow-2xl">
                        <SheetHeader className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-500/20 p-2.5 rounded-xl border border-purple-500/20">
                                    <History className="size-5 text-purple-400" />
                                </div>
                                <div>
                                    <SheetTitle className="text-purple-100 text-xl">Game Log</SheetTitle>
                                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-0.5">History & Events</p>
                                </div>
                            </div>
                        </SheetHeader>
                        <ScrollArea className="flex-1 px-6">
                            <GameLogList groupedLogs={groupedLogs} players={gameState.players} characters={variantConfig.characters} />
                        </ScrollArea>
                    </SheetContent>
                </Sheet>
            </div>
        </div>
    );
}
