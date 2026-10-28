"use client";

import { usePartyCoup } from "@/lib/usePartyKit";
import { normalizeVariant, VariantKey } from "@/lib/variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Copy, CheckCheck, ArrowLeft, Trophy, BarChart3 } from "lucide-react";
import { GamePlay } from "@/components/game/game-play";
import { getPlayerColor, getPlayerInitial } from "@/lib/player-colors";

interface CoupGameClientProps {
    roomCode: string;
    variant: VariantKey | string;
}

export function CoupGameClient({ roomCode, variant }: CoupGameClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const action = searchParams.get("action");
    const normalizedVariant = normalizeVariant(variant);
    const basePath = `/${normalizedVariant}`;
    const [playerName, setPlayerName] = useState("");
    const [hasJoined, setHasJoined] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState("");

    const {
        gameState,
        players,
        isConnected,
        error,
        hostId,
        isHost,
        playerId,
        roomStats,
        disconnectedPlayers,
        reactions,
        joinGame,
        startGame,
        kickPlayer,
        performAction,
        blockAction,
        passBlock,
        challengeAction,
        passChallenge,
        exchangeCards,
        interrogateSelect,
        interrogateDecision,
        loseInfluence,
        sendReaction,
        returnToLobby,
    } = usePartyCoup({
        roomCode,
        variant: normalizedVariant,
        action: action || undefined,
        onKicked: () => router.push(`${basePath}/join`),
    });

    // Auto-join for reconnecting players
    // If we receive a gameState without having joined, it means we're reconnecting
    useEffect(() => {
        if (gameState && !hasJoined) {
            // Check if our playerId is in the game
            const isInGame = gameState.players.some(p => p.id === playerId);
            if (isInGame) {
                setHasJoined(true);
            }
        }
    }, [gameState, hasJoined, playerId]);

    const handleCopyCode = () => {
        navigator.clipboard.writeText(roomCode.toUpperCase());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleJoin = () => {
        if (playerName.trim()) {
            joinGame(playerName);
            setHasJoined(true);
        }
    };

    const handleChangeName = () => {
        if (newName.trim()) {
            joinGame(newName);
            setPlayerName(newName);
            setIsEditingName(false);
            setNewName("");
        }
    };

    // Show connection status
    if (!isConnected) {
        if (error) {
            return (
                <div className="flex min-h-screen items-center justify-center p-4 bg-slate-950 text-slate-50">
                    <div className="text-center space-y-4">
                        <h1 className="text-2xl font-bold text-destructive">Connection Error</h1>
                        <p className="text-lg">{error}</p>
                        <Button onClick={() => router.push(`${basePath}/join`)}>Go Back</Button>
                    </div>
                </div>
            );
        }
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
                <div className="text-center">
                    <p className="text-xl">Connecting to game server...</p>
                </div>
            </div>
        );
    }
    // Show join screen if player hasn't joined yet
    if (!hasJoined) {
        return (
            <div className="flex min-h-screen items-center justify-center p-4 bg-slate-950 text-slate-50">
                <div className="w-full max-w-xl space-y-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`${basePath}/join`)}
                        className="gap-2 text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        <ArrowLeft className="size-4" />
                        Join Different Game
                    </Button>

                    <Card className="w-full bg-slate-900/50 border-slate-800 shadow-2xl backdrop-blur-sm p-6">
                        <CardHeader className="text-center space-y-6 pb-6">
                            <CardTitle className="text-4xl font-bold text-amber-500">Join Game</CardTitle>
                            <div className="flex items-center justify-center gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                <p className="text-6xl font-black font-mono tracking-widest text-amber-100 drop-shadow-md">
                                    {roomCode.toUpperCase()}
                                </p>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleCopyCode}
                                    className="text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                                >
                                    {copied ? <CheckCheck className="size-6" /> : <Copy className="size-6" />}
                                </Button>
                            </div>
                            <p className="text-slate-400">
                                Share this code with your friends
                            </p>
                        </CardHeader>

                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Input
                                    placeholder="Enter your name"
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                                    className="text-center text-xl h-14 bg-slate-950/50 border-slate-700 focus-visible:ring-amber-500/50 text-amber-100 placeholder:text-slate-700"
                                    maxLength={18}
                                />
                            </div>
                            <Button
                                onClick={handleJoin}
                                className="w-full h-14 text-lg font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all"
                                disabled={!playerName.trim()}
                            >
                                Join Game
                            </Button>

                            {error && (
                                <div className="p-4 bg-red-900/20 border border-red-900/50 text-red-400 rounded-lg text-center text-sm font-medium">
                                    {error}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    // Show lobby if game hasn't started
    if (!gameState) {
        return (
            <div className="flex min-h-screen items-center justify-center p-4 bg-slate-950 text-slate-50">
                <div className="w-full max-w-3xl space-y-4">
                    <Button
                        variant="ghost"
                        onClick={() => router.push(basePath)}
                        className="gap-2 text-slate-400 hover:text-white hover:bg-slate-800 self-start"
                    >
                        <ArrowLeft className="size-4" />
                        Back to Menu
                    </Button>
                    <Card className="w-full bg-slate-900/50 border-slate-800 shadow-2xl backdrop-blur-sm">
                        <CardHeader className="text-center space-y-6 pb-8 border-b border-slate-800">
                            <div className="flex flex-col items-center gap-4">
                                <div className="flex items-center justify-center gap-4 bg-slate-950/50 px-8 py-4 rounded-2xl border border-slate-800 shadow-inner">
                                    <h1 className="text-7xl font-black font-mono tracking-widest text-amber-100 drop-shadow-lg">
                                        {roomCode.toUpperCase()}
                                    </h1>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleCopyCode}
                                        className="text-slate-400 hover:text-amber-400 hover:bg-slate-800 h-12 w-12"
                                    >
                                        {copied ? <CheckCheck className="size-8" /> : <Copy className="size-8" />}
                                    </Button>
                                </div>
                                <p className="text-slate-400 font-medium uppercase tracking-wide text-sm">Lobby Access Code</p>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-8 pt-8">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-3 text-amber-500">
                                        <Users className="size-6" />
                                        <h2 className="text-xl font-bold uppercase tracking-wide">Players</h2>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setIsEditingName(true);
                                            setNewName(playerName);
                                        }}
                                        className="border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                                    >
                                        Change Name
                                    </Button>
                                </div>

                                {isEditingName && (
                                    <div className="space-y-3 p-4 bg-slate-950/50 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-top-2">
                                        <Input
                                            placeholder="Enter new name"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleChangeName();
                                                if (e.key === "Escape") {
                                                    setIsEditingName(false);
                                                    setNewName("");
                                                }
                                            }}
                                            className="h-10 bg-slate-900 border-slate-700 text-white"
                                            autoFocus
                                            maxLength={18}
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleChangeName}
                                                size="sm"
                                                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
                                                disabled={!newName.trim()}
                                            >
                                                Update
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    setIsEditingName(false);
                                                    setNewName("");
                                                }}
                                                variant="outline"
                                                size="sm"
                                                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3 min-h-60">
                                    {players.map((player, index) => {
                                        const color = getPlayerColor(index);
                                        return (
                                            <div
                                                key={player.id}
                                                className="flex items-center justify-between gap-4 p-4 bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/50 rounded-xl transition-all group relative overflow-hidden"
                                            >
                                                <div className={`absolute inset-y-0 left-0 w-1 ${color.accent}`} />
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${color.bg} ${color.ring} ring-2 text-white font-black border border-slate-900 shadow-sm shrink-0`}>
                                                        {getPlayerInitial(player.name)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className={`text-xl font-bold truncate ${color.text}`}>{player.name}</span>
                                                        {player.id === hostId && (
                                                            <span className="ml-3 text-xs font-bold bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full border border-amber-500/30 uppercase tracking-wider">
                                                                Host
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {isHost && player.id !== hostId && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => kickPlayer(player.id)}
                                                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 opacity-100 transition-opacity shrink-0"
                                                    >
                                                        Kick
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {players.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-60 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                                            <Users className="size-12 mb-4 opacity-20" />
                                            <p className="text-lg font-medium">Waiting for players to join...</p>
                                        </div>
                                    )}

                                    {players.length > 0 && players.length < 6 && (
                                        <div className="flex items-center gap-4 p-4 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20 opacity-60">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 text-slate-600 font-bold">
                                                {players.length + 1}
                                            </div>
                                            <span className="text-slate-500 font-medium italic">Waiting for player...</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {roomStats && roomStats.totalGamesPlayed > 0 && (
                                <div className="space-y-4 pt-6 border-t border-slate-800">
                                    <div className="flex items-center gap-3 px-2">
                                        <div className="flex items-center gap-2 text-purple-400">
                                            <BarChart3 className="size-5" />
                                            <h2 className="text-lg font-bold uppercase tracking-wide">Room Stats</h2>
                                        </div>
                                        <span className="text-xs text-slate-500 font-medium">
                                            {roomStats.totalGamesPlayed} game{roomStats.totalGamesPlayed !== 1 ? 's' : ''} played
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {Object.values(roomStats.playerStats)
                                            .sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed)
                                            .map((stat, index) => {
                                                const playerIndex = players.findIndex(player => player.id === stat.playerId);
                                                const color = getPlayerColor(playerIndex === -1 ? index : playerIndex);
                                                return (
                                                    <div
                                                        key={stat.playerId}
                                                        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${index === 0 && stat.wins > 0
                                                            ? "bg-amber-900/20 border-amber-700/50"
                                                            : "bg-slate-800/30 border-slate-700/30"
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            {index === 0 && stat.wins > 0 && (
                                                                <Trophy className="size-4 text-amber-400 shrink-0" />
                                                            )}
                                                            <span className={`font-semibold truncate ${index === 0 && stat.wins > 0 ? "text-amber-200" : color.text}`}>
                                                                {stat.playerName}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-4 text-sm shrink-0">
                                                            <span className="text-emerald-400 font-bold">{stat.wins}W</span>
                                                            <span className="text-slate-500">{stat.gamesPlayed}GP</span>
                                                            <span className="text-slate-400 font-mono text-xs">
                                                                {stat.gamesPlayed > 0 ? Math.round((stat.wins / stat.gamesPlayed) * 100) : 0}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4 pt-6 border-t border-slate-800">
                                <Button
                                    onClick={startGame}
                                    className={`w-full h-16 text-xl font-bold uppercase tracking-wider transition-all ${players.length < 2 || !isHost
                                        ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                        : "bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow-lg hover:scale-[1.02]"
                                        }`}
                                    disabled={players.length < 2 || !isHost}
                                    size="lg"
                                >
                                    {players.length < 2 ? "Waiting for Players..." : isHost ? "Start Game" : "Waiting for Host..."}
                                </Button>
                                <p className="text-sm text-center text-slate-500 font-medium">
                                    {players.length < 2
                                        ? "Need at least 2 players to start"
                                        : !isHost
                                            ? "Only the host can start the game"
                                            : `${players.length} player${players.length !== 1 ? 's' : ''} ready • 2-6 players`
                                    }
                                </p>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-900/20 border border-red-900/50 text-red-400 rounded-lg text-center text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
                                    {error}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    // Show game UI
    return (
        <GamePlay
            gameState={gameState}
            myPlayerId={playerId}
            isHost={isHost}
            roomStats={roomStats}
            disconnectedPlayers={disconnectedPlayers}
            reactions={reactions}
            onAction={performAction}
            onBlock={blockAction}
            onPassBlock={passBlock}
            onChallenge={challengeAction}
            onPassChallenge={passChallenge}
            onExchangeCards={exchangeCards}
            onInterrogateSelect={interrogateSelect}
            onInterrogateDecision={interrogateDecision}
            onLoseInfluence={loseInfluence}
            onReturnToLobby={returnToLobby}
            onKickPlayer={kickPlayer}
            onReaction={sendReaction}
            error={error}
        />
    );
}
