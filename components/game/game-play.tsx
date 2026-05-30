"use client";

import { useCallback, useEffect, useState } from "react";
import { GameBoard } from "./game-board";
import { BlockChallengePanel } from "./block-challenge-panel";
import { CardSelector } from "./card-selector";
import { GameState, ActionType, CharacterType, ActionRequest, BlockRequest, ChallengeRequest, Card } from "@/lib/game-logic";
import type { PlayerReaction, RoomStats } from "@/lib/usePartyKit";
import { useGameSounds } from "@/hooks/use-game-sounds";
import Image from "next/image";
import { CHARACTER_IMAGES } from "@/lib/variants";

interface DisconnectedPlayerInfo {
    playerId: string;
    disconnectedAt: number;
    gracePeriodMs: number;
}

interface GamePlayProps {
    gameState: GameState;
    myPlayerId: string;
    isHost: boolean;
    roomStats: RoomStats | null;
    disconnectedPlayers: Map<string, DisconnectedPlayerInfo>;
    reactions: PlayerReaction[];
    onReaction: (emoji: string) => void;
    onAction: (action: ActionRequest) => void;
    onBlock: (block: BlockRequest) => void;
    onPassBlock: () => void;
    onChallenge: (challenge: ChallengeRequest) => void;
    onPassChallenge: () => void;
    onExchangeCards: (keptCardIds: string[]) => void;
    onInterrogateSelect: (cardId: string) => void;
    onInterrogateDecision: (decision: "keep" | "replace") => void;
    onLoseInfluence: (cardId: string) => void;
    onReturnToLobby: () => void;
    onKickPlayer: (playerId: string) => void;
    error?: string | null;
}

function InterrogateDecisionModal({
    card,
    targetName,
    onKeep,
    onReplace,
}: {
    card: Card | null;
    targetName: string;
    onKeep: () => void;
    onReplace: () => void;
}) {
    if (!card) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-linear-to-br from-slate-800 to-slate-900 border-2 border-purple-500 max-w-xl w-full rounded-xl p-6 space-y-6">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-purple-300">Interrogate Decision</h2>
                    <p className="text-slate-300">
                        {targetName} revealed a card. Choose whether they keep it or replace it from the deck.
                    </p>
                </div>
                <div className="flex justify-center">
                    <div className="w-40 h-56 relative rounded-lg overflow-hidden border border-slate-600 shadow-xl">
                        <Image src={CHARACTER_IMAGES[card.character]} alt={card.character} fill className="object-cover" />
                        <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-black/90 via-black/50 to-transparent p-2 pt-8">
                            <p className="text-center text-white font-bold text-sm shadow-black drop-shadow-md">{card.character}</p>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        onClick={onKeep}
                        className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                        Keep Card
                    </button>
                    <button
                        onClick={onReplace}
                        className="h-12 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold"
                    >
                        Replace Card
                    </button>
                </div>
                <p className="text-xs text-slate-400">If the deck is empty, replace will keep the card.</p>
            </div>
        </div>
    );
}

export function GamePlay({
    gameState,
    myPlayerId,
    isHost,
    roomStats,
    disconnectedPlayers,
    onAction,
    onBlock,
    onPassBlock,
    onChallenge,
    onPassChallenge,
    onExchangeCards,
    onInterrogateSelect,
    onInterrogateDecision,
    onLoseInfluence,
    onReturnToLobby,
    onKickPlayer,
    reactions,
    onReaction,
    error,
}: GamePlayProps) {
    const [soundMuted, setSoundMuted] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("coup_sound_muted");
        setSoundMuted(saved === "true");
    }, []);

    const handleToggleSound = useCallback(() => {
        setSoundMuted(prev => {
            const next = !prev;
            localStorage.setItem("coup_sound_muted", String(next));
            return next;
        });
    }, []);

    // Initialize game sounds
    useGameSounds(gameState, myPlayerId, soundMuted);

    // Find my player ID from the player name
    const myPlayer = myPlayerId ? gameState.players.find(p => p.id === myPlayerId) : null;

    const handleAction = useCallback((action: ActionType, targetId?: string) => {
        if (!myPlayerId) return;
        onAction({
            type: action,
            actorId: myPlayerId,
            targetId,
        });
    }, [myPlayerId, onAction]);

    const handleBlock = useCallback((character: CharacterType) => {
        if (!myPlayerId || !gameState.pendingAction) return;
        onBlock({
            type: `block_${gameState.pendingAction.type}` as 'block_foreign_aid' | 'block_assassinate' | 'block_steal',
            blockerId: myPlayerId,
            claimedCharacter: character,
            targetActionId: gameState.pendingAction.actorId,
        });
    }, [myPlayerId, gameState.pendingAction, onBlock]);

    const handleChallenge = useCallback((targetPlayerId: string, character: CharacterType) => {
        if (!myPlayerId) return;
        onChallenge({
            challengerId: myPlayerId,
            targetPlayerId,
            claimedCharacter: character,
            isBlockChallenge: !!gameState.pendingBlock,
        });
    }, [myPlayerId, gameState.pendingBlock, onChallenge]);

    // Check if player needs to lose influence
    const needsToLoseInfluence = myPlayer &&
        gameState.phase === 'lose_influence' &&
        gameState.pendingInfluenceLoss === myPlayerId &&
        myPlayer.cards.filter(c => !c.revealed).length > 0;

    // Determine reason for influence loss
    let loseInfluenceDescription = "Choose one of your cards to reveal.";
    if (needsToLoseInfluence) {
        if (gameState.pendingChallenge) {
            if (gameState.pendingChallenge.challengerId === myPlayerId) {
                const targetName = gameState.players.find(p => p.id === gameState.pendingChallenge?.targetPlayerId)?.name;
                loseInfluenceDescription = `Your challenge against ${targetName} failed! You must lose an influence.`;
            } else {
                const challengerName = gameState.players.find(p => p.id === gameState.pendingChallenge?.challengerId)?.name;
                loseInfluenceDescription = `You were successfully challenged by ${challengerName}! You must lose an influence.`;
            }
        } else if (gameState.pendingAction) {
            const actorName = gameState.players.find(p => p.id === gameState.pendingAction?.actorId)?.name;
            if (gameState.pendingAction.type === 'coup') {
                loseInfluenceDescription = `You were Couped by ${actorName}! You must lose an influence.`;
            } else if (gameState.pendingAction.type === 'assassinate') {
                loseInfluenceDescription = `You were Assassinated by ${actorName}! You must lose an influence.`;
            }
        }
    }

    // Check if player needs to exchange cards (Ambassador)
    const needsToExchange = myPlayer &&
        gameState.phase === 'exchange' &&
        gameState.pendingExchangeCards &&
        myPlayerId === gameState.pendingAction?.actorId;

    const needsToSelectInterrogate = myPlayer &&
        gameState.phase === 'interrogate_select' &&
        gameState.pendingInterrogate?.targetId === myPlayerId;

    const needsToDecideInterrogate = myPlayer &&
        gameState.phase === 'interrogate_decision' &&
        gameState.pendingAction?.actorId === myPlayerId;

    const interrogateTarget = gameState.pendingInterrogate?.targetId
        ? gameState.players.find(p => p.id === gameState.pendingInterrogate?.targetId)
        : null;

    const interrogateCard = interrogateTarget && gameState.pendingInterrogate?.selectedCardId
        ? interrogateTarget.cards.find(c => c.id === gameState.pendingInterrogate?.selectedCardId) || null
        : null;

    if (!myPlayerId) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-xl text-muted-foreground">Loading game...</p>
            </div>
        );
    }

    return (
        <div className="relative">
            <GameBoard
                gameState={gameState}
                myPlayerId={myPlayerId}
                isHost={isHost}
                roomStats={roomStats}
                disconnectedPlayers={disconnectedPlayers}
                soundMuted={soundMuted}
                reactions={reactions}
                onAction={handleAction}
                onReturnToLobby={onReturnToLobby}
                onKickPlayer={onKickPlayer}
                onToggleSound={handleToggleSound}
                onReaction={onReaction}
            />

            {/* Block/Challenge Panel - Overlay */}
            {(gameState.phase === 'block_window' || gameState.phase === 'challenge_window') && (
                <div className="fixed bottom-4 left-4 right-4 z-40 max-w-2xl mx-auto">
                    <BlockChallengePanel
                        gameState={gameState}
                        myPlayerId={myPlayerId}
                        onBlock={handleBlock}
                        onChallenge={handleChallenge}
                        onPass={() => {
                            if (gameState.phase === 'block_window') {
                                onPassBlock();
                            } else {
                                onPassChallenge();
                            }
                        }}
                    />
                </div>
            )}

            {/* Card Exchange Modal */}
            {needsToExchange && gameState.pendingExchangeCards && (
                <CardSelector
                    cards={[...myPlayer!.cards, ...gameState.pendingExchangeCards]}
                    title="Exchange Cards"
                    description={`Choose ${myPlayer!.cards.filter(c => !c.revealed).length} cards to keep. The rest will be returned to the deck.`}
                    selectCount={myPlayer!.cards.filter(c => !c.revealed).length}
                    onConfirm={onExchangeCards}
                />
            )}

            {/* Interrogate Selection (Target) */}
            {needsToSelectInterrogate && (
                <CardSelector
                    cards={myPlayer!.cards}
                    title="Interrogate"
                    description="Select a card to reveal to the Inquisitor."
                    selectCount={1}
                    onConfirm={(cardIds) => onInterrogateSelect(cardIds[0])}
                />
            )}

            {/* Interrogate Decision (Actor) */}
            {needsToDecideInterrogate && interrogateTarget && (
                <InterrogateDecisionModal
                    card={interrogateCard}
                    targetName={interrogateTarget.name}
                    onKeep={() => onInterrogateDecision("keep")}
                    onReplace={() => onInterrogateDecision("replace")}
                />
            )}

            {/* Lose Influence Modal */}
            {needsToLoseInfluence && (
                <CardSelector
                    key={`lose-influence-${myPlayer!.cards.filter(c => !c.revealed).length}`}
                    cards={myPlayer!.cards}
                    title="Lose Influence"
                    description={loseInfluenceDescription}
                    selectCount={1}
                    onConfirm={(cardIds) => onLoseInfluence(cardIds[0])}
                />
            )}

            {/* Error Display */}
            {error && (
                <div className="fixed top-4 right-4 z-50 p-4 bg-red-900 text-white rounded-lg shadow-lg max-w-md">
                    {error}
                </div>
            )}
        </div>
    );
}
