"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import PartySocket from "partysocket";
import type { GameState, ActionRequest, BlockRequest, ChallengeRequest } from "./game-logic";
import { normalizeVariant, VariantKey } from "./variants";

interface PlayerConnection {
    id: string;
    name: string;
}

type ServerMessage =
    | { type: "state"; payload: GameState }
    | { type: "waiting"; payload: { players: PlayerConnection[]; hostId: string | null } }
    | { type: "players-updated"; payload: { players: PlayerConnection[]; hostId: string | null } }
    | { type: "game-started"; payload: { gameState: GameState } }
    | { type: "kicked"; payload: { message: string } }
    | { type: "error"; payload: { message: string } };

interface UsePartyCoupParams {
    roomCode: string;
    variant?: VariantKey | string;
    action?: string;
    onKicked?: () => void;
}

interface UsePartyCoupReturn {
    gameState: GameState | null;
    players: PlayerConnection[];
    isConnected: boolean;
    error: string | null;
    hostId: string | null;
    isHost: boolean;
    playerId: string;
    joinGame: (playerName: string) => void;
    startGame: () => void;
    kickPlayer: (playerId: string) => void;
    performAction: (action: ActionRequest) => void;
    blockAction: (block: BlockRequest) => void;
    passBlock: () => void;
    challengeAction: (challenge: ChallengeRequest) => void;
    passChallenge: () => void;
    exchangeCards: (keptCardIds: string[]) => void;
    interrogateSelect: (cardId: string) => void;
    interrogateDecision: (decision: "keep" | "replace") => void;
    loseInfluence: (cardId: string) => void;
    returnToLobby: () => void;
}

export function usePartyCoup(params: string | UsePartyCoupParams): UsePartyCoupReturn {
    const roomCode = typeof params === 'string' ? params : params.roomCode;
    const variant = typeof params === 'string' ? undefined : params.variant;
    const action = typeof params === 'string' ? undefined : params.action;
    const onKicked = typeof params === 'string' ? undefined : params.onKicked;
    const normalizedVariant = variant ? normalizeVariant(variant) : undefined;
    const roomId = normalizedVariant ? `${normalizedVariant}-${roomCode}` : roomCode;

    const [gameState, setGameState] = useState<GameState | null>(null);
    const [players, setPlayers] = useState<PlayerConnection[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hostId, setHostId] = useState<string | null>(null);
    const socketRef = useRef<PartySocket | null>(null);
    const [playerId] = useState<string>(() => {
        if (typeof window === 'undefined') return "";
        const id = crypto.randomUUID();
        sessionStorage.setItem("coup_player_id", id);
        sessionStorage.setItem("coup_tab_id", crypto.randomUUID());
        return id;
    });

    // Use ref to store the latest callback without triggering re-renders
    const onKickedRef = useRef(onKicked);
    useEffect(() => {
        onKickedRef.current = onKicked;
    }, [onKicked]);

    useEffect(() => {
        if (!playerId) return;

        // Create PartySocket connection
        const socket = new PartySocket({
            host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
            room: roomId,
            query: {
                ...(action ? { action } : {}),
                ...(normalizedVariant ? { variant: normalizedVariant } : {}),
                playerId
            },
        });

        socketRef.current = socket;

        socket.addEventListener("open", () => {
            console.log("Connected to PartyKit server");
            setIsConnected(true);
            setError(null);
        });

        socket.addEventListener("message", (event) => {
            try {
                const message = JSON.parse(event.data) as ServerMessage;

                switch (message.type) {
                    case "state":
                        setGameState(message.payload);
                        // Clear any error when we receive valid game state
                        setError(null);
                        break;

                    case "waiting":
                        setPlayers(message.payload.players);
                        setHostId(message.payload.hostId);
                        break;

                    case "players-updated":
                        setPlayers(message.payload.players);
                        setHostId(message.payload.hostId);
                        break;

                    case "kicked":
                        setError(message.payload.message);
                        socket.close();
                        onKickedRef.current?.();
                        break;

                    case "game-started":
                        setGameState(message.payload.gameState);
                        setPlayers([]);
                        break;

                    case "error":
                        setError(message.payload.message);
                        break;
                }
            } catch (err) {
                console.error("Error parsing message:", err);
            }
        });

        socket.addEventListener("error", (event) => {
            console.error("PartyKit error:", event);
            setError("Connection error occurred");
            setIsConnected(false);
        });

        socket.addEventListener("close", () => {
            console.log("Disconnected from PartyKit server");
            setIsConnected(false);
        });

        // Cleanup on unmount
        return () => {
            socket.close();
            socketRef.current = null;
        };
    }, [roomId, playerId, action, normalizedVariant]);

    const sendMessage = useCallback((message: object) => {
        if (socketRef.current && isConnected) {
            socketRef.current.send(JSON.stringify(message));
        }
    }, [isConnected]);

    const joinGame = useCallback((playerName: string) => {
        sendMessage({ type: "join", payload: { playerName } });
    }, [sendMessage]);

    const startGame = useCallback(() => {
        sendMessage({ type: "start-game" });
    }, [sendMessage]);

    const kickPlayer = useCallback((playerId: string) => {
        sendMessage({ type: "kick-player", payload: { playerId } });
    }, [sendMessage]);

    const performAction = useCallback((action: ActionRequest) => {
        sendMessage({ type: "action", payload: action });
    }, [sendMessage]);

    const blockAction = useCallback((block: BlockRequest) => {
        sendMessage({ type: "block", payload: block });
    }, [sendMessage]);

    const passBlock = useCallback(() => {
        sendMessage({ type: "pass-block" });
    }, [sendMessage]);

    const challengeAction = useCallback((challenge: ChallengeRequest) => {
        sendMessage({ type: "challenge", payload: challenge });
    }, [sendMessage]);

    const passChallenge = useCallback(() => {
        sendMessage({ type: "pass-challenge" });
    }, [sendMessage]);

    const exchangeCards = useCallback((keptCardIds: string[]) => {
        sendMessage({ type: "exchange", payload: { keptCardIds } });
    }, [sendMessage]);

    const interrogateSelect = useCallback((cardId: string) => {
        sendMessage({ type: "interrogate-select", payload: { cardId } });
    }, [sendMessage]);

    const interrogateDecision = useCallback((decision: "keep" | "replace") => {
        sendMessage({ type: "interrogate-decision", payload: { decision } });
    }, [sendMessage]);

    const loseInfluence = useCallback((cardId: string) => {
        sendMessage({ type: "lose-influence", payload: { cardId } });
    }, [sendMessage]);

    const returnToLobby = useCallback(() => {
        sendMessage({ type: "return-to-lobby" });
    }, [sendMessage]);

    return {
        gameState,
        players,
        isConnected,
        error,
        hostId,
        isHost: hostId === playerId,
        playerId,
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
        returnToLobby,
    };
}
