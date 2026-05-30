import useSound from 'use-sound';
import { useEffect, useRef } from 'react';
import { GameState } from '@/lib/game-logic';

export function useGameSounds(gameState: GameState | null, myPlayerId: string, muted: boolean) {
    const [playIncome] = useSound('/sounds/income.wav', { volume: 0.6 });
    const [playForeignAid] = useSound('/sounds/foreign-aid.wav', { volume: 0.6 });
    const [playTax] = useSound('/sounds/tax.wav', { volume: 0.6 });
    const [playCoup] = useSound('/sounds/coup.wav', { volume: 0.7 });
    const [playAssassinate] = useSound('/sounds/assassinate.wav', { volume: 0.7 });
    const [playSteal] = useSound('/sounds/steal.wav', { volume: 0.6 });
    const [playExchange] = useSound('/sounds/exchange.wav', { volume: 0.55 });
    const [playInterrogate] = useSound('/sounds/interrogate.wav', { volume: 0.6 });
    const [playInquire] = useSound('/sounds/inquire.wav', { volume: 0.55 });
    const [playBlock] = useSound('/sounds/block-action.wav', { volume: 0.65 });
    const [playChallenge] = useSound('/sounds/challenge-action.wav', { volume: 0.7 });
    const [playLoseInfluence] = useSound('/sounds/lose-influence.wav', { volume: 0.7 });
    const [playGameOver] = useSound('/sounds/game-over.wav', { volume: 0.75 });

    const lastLogTimestampRef = useRef<number>(0);
    const lastTurnRef = useRef<number>(0);

    useEffect(() => {
        if (!gameState) return;

        // Handle Turn Change (Update ref but no sound)
        if (gameState.turn !== lastTurnRef.current) {
            lastTurnRef.current = gameState.turn;
        }

        // Handle Action Sounds from Logs
        const newLogs = gameState.log.filter(log => log.timestamp > lastLogTimestampRef.current);

        if (newLogs.length > 0) {
            lastLogTimestampRef.current = newLogs[newLogs.length - 1].timestamp;

            if (muted) return;

            newLogs.forEach(log => {
                if (log.message.includes('wins!')) {
                    playGameOver();
                    return;
                }

                if (log.message.includes('challenges')) {
                    playChallenge();
                    return;
                }

                if (log.message.includes(' to block') || log.message.includes('block succeeds')) {
                    playBlock();
                    return;
                }

                if (
                    log.message.includes('loses influence') ||
                    log.message.includes('is eliminated')
                ) {
                    playLoseInfluence();
                    return;
                }

                switch (log.actionType) {
                    case 'income':
                        playIncome();
                        break;
                    case 'foreign_aid':
                        playForeignAid();
                        break;
                    case 'tax':
                        playTax();
                        break;
                    case 'coup':
                        playCoup();
                        break;
                    case 'assassinate':
                        playAssassinate();
                        break;
                    case 'steal':
                        playSteal();
                        break;
                    case 'exchange':
                        playExchange();
                        break;
                    case 'interrogate':
                        playInterrogate();
                        break;
                    case 'inquire':
                        playInquire();
                        break;
                }
            });
        }
    }, [
        gameState,
        myPlayerId,
        muted,
        playIncome,
        playForeignAid,
        playTax,
        playCoup,
        playAssassinate,
        playSteal,
        playExchange,
        playInterrogate,
        playInquire,
        playBlock,
        playChallenge,
        playLoseInfluence,
        playGameOver
    ]);
}
