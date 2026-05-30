/**
 * Coup Game Logic Tests
 * Comprehensive test suite for game mechanics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    initializeGame,
    performAction,
    blockAction,
    challengeAction,
    passChallenge,
    passBlock,
    loseInfluence,
    exchangeCards,
    getCurrentPlayer,
    getPlayer,
    getAlivePlayers,
    getPlayerInfluence,
    eliminatePlayer,
    GameState,
    Player,
    Card,
    ActionRequest,
    ChallengeRequest,
} from './game-logic';

// ============================================================================
// HELPER FUNCTIONS FOR TESTS
// ============================================================================

function createTestGame(numPlayers: number = 2): GameState {
    const players = Array.from({ length: numPlayers }, (_, i) => ({
        id: `player-${i + 1}`,
        name: `Player ${i + 1}`,
    }));
    return initializeGame(players, 'standard');
}

function setPlayerCards(state: GameState, playerId: string, characters: string[]): void {
    const player = getPlayer(state, playerId);
    if (!player) return;
    
    // Clear existing cards
    player.cards = characters.map((char, i) => ({
        id: `${playerId}-card-${i}`,
        character: char as Card['character'],
        revealed: false,
    }));
}

function givePlayerCoins(state: GameState, playerId: string, coins: number): void {
    const player = getPlayer(state, playerId);
    if (player) {
        player.coins = coins;
    }
}

function setCurrentPlayer(state: GameState, playerId: string): void {
    const index = state.players.findIndex(p => p.id === playerId);
    if (index !== -1) {
        state.currentPlayerIndex = index;
    }
}

// ============================================================================
// INITIALIZATION TESTS
// ============================================================================

describe('Game Initialization', () => {
    it('should create a game with correct number of players', () => {
        const state = createTestGame(3);
        expect(state.players.length).toBe(3);
    });

    it('should give each player 2 cards', () => {
        const state = createTestGame(2);
        state.players.forEach(player => {
            expect(player.cards.length).toBe(2);
        });
    });

    it('should give each player 2 coins', () => {
        const state = createTestGame(2);
        state.players.forEach(player => {
            expect(player.coins).toBe(2);
        });
    });

    it('should start in action phase', () => {
        const state = createTestGame(2);
        expect(state.phase).toBe('action');
    });

    it('should throw error for less than 2 players', () => {
        expect(() => createTestGame(1)).toThrow('Game requires 2-6 players');
    });

    it('should throw error for more than 6 players', () => {
        expect(() => createTestGame(7)).toThrow('Game requires 2-6 players');
    });
});

// ============================================================================
// BASIC ACTIONS TESTS
// ============================================================================

describe('Basic Actions', () => {
    let state: GameState;

    beforeEach(() => {
        state = createTestGame(2);
    });

    describe('Income', () => {
        it('should give 1 coin to the player', () => {
            const currentPlayer = getCurrentPlayer(state);
            const initialCoins = currentPlayer.coins;

            state = performAction(state, {
                type: 'income',
                actorId: currentPlayer.id,
            });

            expect(currentPlayer.coins).toBe(initialCoins + 1);
        });

        it('should advance to next player turn', () => {
            const currentPlayer = getCurrentPlayer(state);
            state = performAction(state, {
                type: 'income',
                actorId: currentPlayer.id,
            });

            expect(getCurrentPlayer(state).id).not.toBe(currentPlayer.id);
        });
    });

    describe('Foreign Aid', () => {
        it('should move to block window', () => {
            const currentPlayer = getCurrentPlayer(state);
            state = performAction(state, {
                type: 'foreign_aid',
                actorId: currentPlayer.id,
            });

            expect(state.phase).toBe('block_window');
        });

        it('should give 2 coins if unblocked', () => {
            const currentPlayer = getCurrentPlayer(state);
            const initialCoins = currentPlayer.coins;
            
            state = performAction(state, {
                type: 'foreign_aid',
                actorId: currentPlayer.id,
            });

            // Other player passes
            const otherPlayer = state.players.find(p => p.id !== currentPlayer.id)!;
            state = passBlock(state, otherPlayer.id);

            expect(currentPlayer.coins).toBe(initialCoins + 2);
        });
    });

    describe('Coup', () => {
        it('should require 7 coins', () => {
            const currentPlayer = getCurrentPlayer(state);
            currentPlayer.coins = 6;

            expect(() => {
                performAction(state, {
                    type: 'coup',
                    actorId: currentPlayer.id,
                    targetId: state.players.find(p => p.id !== currentPlayer.id)!.id,
                });
            }).toThrow('Not enough coins');
        });

        it('should deduct 7 coins and force target to lose influence', () => {
            const currentPlayer = getCurrentPlayer(state);
            currentPlayer.coins = 7;
            const target = state.players.find(p => p.id !== currentPlayer.id)!;

            state = performAction(state, {
                type: 'coup',
                actorId: currentPlayer.id,
                targetId: target.id,
            });

            expect(currentPlayer.coins).toBe(0);
            expect(state.phase).toBe('lose_influence');
            expect(state.pendingInfluenceLoss).toBe(target.id);
        });

        it('should be mandatory with 10+ coins', () => {
            const currentPlayer = getCurrentPlayer(state);
            currentPlayer.coins = 10;

            expect(() => {
                performAction(state, {
                    type: 'income',
                    actorId: currentPlayer.id,
                });
            }).toThrow('Must coup with 10 or more coins');
        });
    });
});

// ============================================================================
// CHARACTER ACTIONS TESTS
// ============================================================================

describe('Character Actions', () => {
    let state: GameState;

    beforeEach(() => {
        state = createTestGame(2);
    });

    describe('Tax (Duke)', () => {
        it('should move to challenge window with claimed Duke', () => {
            const currentPlayer = getCurrentPlayer(state);
            state = performAction(state, {
                type: 'tax',
                actorId: currentPlayer.id,
            });

            expect(state.phase).toBe('challenge_window');
            expect(state.pendingAction?.claimedCharacter).toBe('Duke');
        });

        it('should give 3 coins if unchallenged', () => {
            const currentPlayer = getCurrentPlayer(state);
            const initialCoins = currentPlayer.coins;
            
            state = performAction(state, {
                type: 'tax',
                actorId: currentPlayer.id,
            });

            // Other player passes challenge
            const otherPlayer = state.players.find(p => p.id !== currentPlayer.id)!;
            state = passChallenge(state, otherPlayer.id);

            expect(currentPlayer.coins).toBe(initialCoins + 3);
        });
    });

    describe('Assassinate (Assassin)', () => {
        it('should require 3 coins', () => {
            const currentPlayer = getCurrentPlayer(state);
            currentPlayer.coins = 2;
            const target = state.players.find(p => p.id !== currentPlayer.id)!;

            expect(() => {
                performAction(state, {
                    type: 'assassinate',
                    actorId: currentPlayer.id,
                    targetId: target.id,
                });
            }).toThrow('Not enough coins');
        });

        it('should deduct 3 coins and move to challenge window', () => {
            const currentPlayer = getCurrentPlayer(state);
            currentPlayer.coins = 3;
            const target = state.players.find(p => p.id !== currentPlayer.id)!;

            state = performAction(state, {
                type: 'assassinate',
                actorId: currentPlayer.id,
                targetId: target.id,
            });

            expect(currentPlayer.coins).toBe(0);
            expect(state.phase).toBe('challenge_window');
        });
    });

    describe('Steal (Captain)', () => {
        it('should move to challenge window', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;

            state = performAction(state, {
                type: 'steal',
                actorId: currentPlayer.id,
                targetId: target.id,
            });

            expect(state.phase).toBe('challenge_window');
            expect(state.pendingAction?.claimedCharacter).toBe('Captain');
        });

        it('should steal up to 2 coins if successful', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;
            target.coins = 5;
            const initialActorCoins = currentPlayer.coins;

            state = performAction(state, {
                type: 'steal',
                actorId: currentPlayer.id,
                targetId: target.id,
            });

            // Pass challenge
            state = passChallenge(state, target.id);
            // Pass block
            state = passBlock(state, target.id);

            expect(currentPlayer.coins).toBe(initialActorCoins + 2);
            expect(target.coins).toBe(3);
        });

        it('should only steal available coins if target has less than 2', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;
            target.coins = 1;
            const initialActorCoins = currentPlayer.coins;

            state = performAction(state, {
                type: 'steal',
                actorId: currentPlayer.id,
                targetId: target.id,
            });

            // Pass challenge
            state = passChallenge(state, target.id);
            // Pass block
            state = passBlock(state, target.id);

            expect(currentPlayer.coins).toBe(initialActorCoins + 1);
            expect(target.coins).toBe(0);
        });
    });
});

// ============================================================================
// CHALLENGE TESTS
// ============================================================================

describe('Challenge System', () => {
    let state: GameState;

    beforeEach(() => {
        state = createTestGame(2);
    });

    describe('Successful Challenge (Target does NOT have the card)', () => {
        it('should make target lose influence when caught bluffing', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;
            
            // Give current player cards that are NOT Duke
            setPlayerCards(state, currentPlayer.id, ['Assassin', 'Captain']);
            
            // Player claims Duke for Tax
            state = performAction(state, {
                type: 'tax',
                actorId: currentPlayer.id,
            });

            // Target challenges
            state = challengeAction(state, {
                challengerId: target.id,
                targetPlayerId: currentPlayer.id,
                claimedCharacter: 'Duke',
                isBlockChallenge: false,
            });

            // Current player must lose influence
            expect(state.phase).toBe('lose_influence');
            expect(state.pendingInfluenceLoss).toBe(currentPlayer.id);
        });
    });

    describe('Failed Challenge (Target HAS the card)', () => {
        it('should make challenger lose influence when wrong', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;
            
            // Give current player a Duke
            setPlayerCards(state, currentPlayer.id, ['Duke', 'Captain']);
            
            // Player claims Duke for Tax
            state = performAction(state, {
                type: 'tax',
                actorId: currentPlayer.id,
            });

            // Target challenges (wrongly)
            state = challengeAction(state, {
                challengerId: target.id,
                targetPlayerId: currentPlayer.id,
                claimedCharacter: 'Duke',
                isBlockChallenge: false,
            });

            // Challenger (target) must lose influence
            expect(state.phase).toBe('lose_influence');
            expect(state.pendingInfluenceLoss).toBe(target.id);
        });

        it('should give challenged player a new card after revealing', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;
            
            // Give current player a Duke
            setPlayerCards(state, currentPlayer.id, ['Duke', 'Captain']);
            const initialCardCount = currentPlayer.cards.length;
            
            // Player claims Duke for Tax
            state = performAction(state, {
                type: 'tax',
                actorId: currentPlayer.id,
            });

            // Target challenges (wrongly)
            state = challengeAction(state, {
                challengerId: target.id,
                targetPlayerId: currentPlayer.id,
                claimedCharacter: 'Duke',
                isBlockChallenge: false,
            });

            // Current player should still have 2 cards (Duke was swapped)
            expect(currentPlayer.cards.filter(c => !c.revealed).length).toBe(initialCardCount);
        });
    });
});

// ============================================================================
// BUG FIX TEST: ASSASSINATION CHALLENGE WITH 1 CARD
// ============================================================================

describe('Bug Fix: Assassination Challenge with 1 Card', () => {
    let state: GameState;

    beforeEach(() => {
        state = createTestGame(3); // 3 players so game doesn't end immediately
    });

    it('should NOT hang when target challenges assassination and loses with 1 card', () => {
        // Setup: Player 1 (assassin) will assassinate Player 2 (has 1 card)
        const player1 = state.players[0];
        const player2 = state.players[1];
        const player3 = state.players[2];

        // Set player 1 as current player with Assassin
        setCurrentPlayer(state, player1.id);
        setPlayerCards(state, player1.id, ['Assassin', 'Duke']);
        givePlayerCoins(state, player1.id, 3);

        // Player 2 has only 1 card (simulate having lost one already)
        setPlayerCards(state, player2.id, ['Captain']);
        
        // Player 3 has 2 cards
        setPlayerCards(state, player3.id, ['Contessa', 'Ambassador']);

        // Player 1 assassinates Player 2
        state = performAction(state, {
            type: 'assassinate',
            actorId: player1.id,
            targetId: player2.id,
        });

        expect(state.phase).toBe('challenge_window');

        // Player 2 challenges (wrongly - Player 1 actually has Assassin)
        state = challengeAction(state, {
            challengerId: player2.id,
            targetPlayerId: player1.id,
            claimedCharacter: 'Assassin',
            isBlockChallenge: false,
        });

        // Player 2 must lose influence (challenge failed)
        expect(state.phase).toBe('lose_influence');
        expect(state.pendingInfluenceLoss).toBe(player2.id);

        // Player 2 loses their only card
        const cardToLose = player2.cards.find(c => !c.revealed)!;
        loseInfluence(state, player2.id, cardToLose.id);

        // Player 2 is eliminated after losing their only card
        expect(player2.isAlive).toBe(false);
        
        // With 3 players and 1 eliminated, game continues
        expect(getAlivePlayers(state).length).toBe(2);

        // The target is dead, so block_window would hang (nobody can respond).
        // The game should skip block_window and move to the next turn.
        expect(state.phase).not.toBe('lose_influence');
        expect(state.phase).not.toBe('block_window');
        expect(state.phase).toBe('action');
    });

    it('should end game when assassination challenge leaves only 1 player alive', () => {
        // Setup: 2 player game
        state = createTestGame(2);
        const player1 = state.players[0];
        const player2 = state.players[1];

        // Set player 1 as current player with Assassin
        setCurrentPlayer(state, player1.id);
        setPlayerCards(state, player1.id, ['Assassin', 'Duke']);
        givePlayerCoins(state, player1.id, 3);

        // Player 2 has only 1 card
        setPlayerCards(state, player2.id, ['Captain']);

        // Player 1 assassinates Player 2
        state = performAction(state, {
            type: 'assassinate',
            actorId: player1.id,
            targetId: player2.id,
        });

        // Player 2 challenges (wrongly)
        state = challengeAction(state, {
            challengerId: player2.id,
            targetPlayerId: player1.id,
            claimedCharacter: 'Assassin',
            isBlockChallenge: false,
        });

        // Player 2 loses their only card
        const cardToLose = player2.cards.find(c => !c.revealed)!;
        loseInfluence(state, player2.id, cardToLose.id);

        // Game should be over
        expect(state.phase).toBe('game_over');
        expect(state.winner).toBe(player1.id);
    });

    it('should proceed to block window if target survives the challenge', () => {
        // Setup: Target has 2 cards and loses 1 from failed challenge
        const player1 = state.players[0];
        const player2 = state.players[1];

        setCurrentPlayer(state, player1.id);
        setPlayerCards(state, player1.id, ['Assassin', 'Duke']);
        givePlayerCoins(state, player1.id, 3);

        // Player 2 has 2 cards
        setPlayerCards(state, player2.id, ['Captain', 'Ambassador']);

        // Player 1 assassinates Player 2
        state = performAction(state, {
            type: 'assassinate',
            actorId: player1.id,
            targetId: player2.id,
        });

        // Player 2 challenges (wrongly)
        state = challengeAction(state, {
            challengerId: player2.id,
            targetPlayerId: player1.id,
            claimedCharacter: 'Assassin',
            isBlockChallenge: false,
        });

        // Player 2 loses one card from failed challenge
        const cardToLose = player2.cards.find(c => !c.revealed)!;
        loseInfluence(state, player2.id, cardToLose.id);

        // Player 2 is still alive
        expect(player2.isAlive).toBe(true);
        expect(getPlayerInfluence(player2)).toBe(1);

        // Now game should be in block_window, waiting for Player 2 to block or pass
        expect(state.phase).toBe('block_window');
    });
});

// ============================================================================
// BLOCKING TESTS
// ============================================================================

describe('Blocking System', () => {
    let state: GameState;

    beforeEach(() => {
        state = createTestGame(2);
    });

    describe('Block Foreign Aid with Duke', () => {
        it('should allow blocking foreign aid', () => {
            const currentPlayer = getCurrentPlayer(state);
            const blocker = state.players.find(p => p.id !== currentPlayer.id)!;

            state = performAction(state, {
                type: 'foreign_aid',
                actorId: currentPlayer.id,
            });

            state = blockAction(state, {
                type: 'block_foreign_aid',
                blockerId: blocker.id,
                claimedCharacter: 'Duke',
                targetActionId: state.pendingAction!.type,
            });

            expect(state.phase).toBe('challenge_window');
            expect(state.pendingBlock?.claimedCharacter).toBe('Duke');
        });

        it('should cancel action if block unchallenged', () => {
            const currentPlayer = getCurrentPlayer(state);
            const blocker = state.players.find(p => p.id !== currentPlayer.id)!;
            const initialCoins = currentPlayer.coins;

            state = performAction(state, {
                type: 'foreign_aid',
                actorId: currentPlayer.id,
            });

            state = blockAction(state, {
                type: 'block_foreign_aid',
                blockerId: blocker.id,
                claimedCharacter: 'Duke',
                targetActionId: state.pendingAction!.type,
            });

            // Actor passes on challenging the block
            state = passChallenge(state, currentPlayer.id);

            // Coins should not have increased
            expect(currentPlayer.coins).toBe(initialCoins);
            expect(state.phase).toBe('action');
        });
    });

    describe('Block Assassination with Contessa', () => {
        it('should allow target to block with Contessa', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;
            givePlayerCoins(state, currentPlayer.id, 3);

            state = performAction(state, {
                type: 'assassinate',
                actorId: currentPlayer.id,
                targetId: target.id,
            });

            // Pass the challenge phase
            state = passChallenge(state, target.id);

            // Now in block window
            expect(state.phase).toBe('block_window');

            state = blockAction(state, {
                type: 'block_assassinate',
                blockerId: target.id,
                claimedCharacter: 'Contessa',
                targetActionId: state.pendingAction!.type,
            });

            expect(state.pendingBlock?.claimedCharacter).toBe('Contessa');
        });
    });

    describe('Block Steal', () => {
        it('should allow blocking steal with Captain', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;

            state = performAction(state, {
                type: 'steal',
                actorId: currentPlayer.id,
                targetId: target.id,
            });

            // Pass challenge
            state = passChallenge(state, target.id);

            state = blockAction(state, {
                type: 'block_steal',
                blockerId: target.id,
                claimedCharacter: 'Captain',
                targetActionId: state.pendingAction!.type,
            });

            expect(state.pendingBlock?.claimedCharacter).toBe('Captain');
        });

        it('should allow blocking steal with Ambassador', () => {
            const currentPlayer = getCurrentPlayer(state);
            const target = state.players.find(p => p.id !== currentPlayer.id)!;

            state = performAction(state, {
                type: 'steal',
                actorId: currentPlayer.id,
                targetId: target.id,
            });

            // Pass challenge
            state = passChallenge(state, target.id);

            state = blockAction(state, {
                type: 'block_steal',
                blockerId: target.id,
                claimedCharacter: 'Ambassador',
                targetActionId: state.pendingAction!.type,
            });

            expect(state.pendingBlock?.claimedCharacter).toBe('Ambassador');
        });
    });
});

// ============================================================================
// INFLUENCE LOSS TESTS
// ============================================================================

describe('Influence Loss', () => {
    let state: GameState;

    beforeEach(() => {
        state = createTestGame(2);
    });

    it('should reveal the specified card', () => {
        const player = state.players[0];
        const cardId = player.cards[0].id;

        state.pendingInfluenceLoss = player.id;
        state.phase = 'lose_influence';

        loseInfluence(state, player.id, cardId);

        const card = player.cards.find(c => c.id === cardId);
        expect(card?.revealed).toBe(true);
    });

    it('should eliminate player when all cards revealed', () => {
        const player = state.players[0];
        // Reveal first card
        player.cards[0].revealed = true;
        
        state.pendingInfluenceLoss = player.id;
        state.phase = 'lose_influence';

        // Lose second card
        loseInfluence(state, player.id, player.cards[1].id);

        expect(player.isAlive).toBe(false);
    });

    it('should declare winner when only one player remains', () => {
        const player1 = state.players[0];
        const player2 = state.players[1];

        // Player 2 has only 1 card
        player2.cards = [player2.cards[0]];

        state.pendingInfluenceLoss = player2.id;
        state.phase = 'lose_influence';

        loseInfluence(state, player2.id, player2.cards[0].id);

        expect(state.phase).toBe('game_over');
        expect(state.winner).toBe(player1.id);
    });
});

// ============================================================================
// EXCHANGE TESTS
// ============================================================================

describe('Exchange Action', () => {
    let state: GameState;

    beforeEach(() => {
        state = createTestGame(2);
    });

    it('should enter exchange phase after unchallenged exchange', () => {
        const currentPlayer = getCurrentPlayer(state);

        state = performAction(state, {
            type: 'exchange',
            actorId: currentPlayer.id,
        });

        // Pass challenge
        const otherPlayer = state.players.find(p => p.id !== currentPlayer.id)!;
        state = passChallenge(state, otherPlayer.id);

        expect(state.phase).toBe('exchange');
        expect(state.pendingExchangeCards).not.toBeNull();
    });

    it('should allow player to select cards to keep', () => {
        const currentPlayer = getCurrentPlayer(state);

        state = performAction(state, {
            type: 'exchange',
            actorId: currentPlayer.id,
        });

        // Pass challenge
        const otherPlayer = state.players.find(p => p.id !== currentPlayer.id)!;
        state = passChallenge(state, otherPlayer.id);

        // Player must keep same number of cards as their current influence
        const influence = getPlayerInfluence(currentPlayer);
        const allCards = [...currentPlayer.cards.filter(c => !c.revealed), ...(state.pendingExchangeCards || [])];
        const keptCardIds = allCards.slice(0, influence).map(c => c.id);

        state = exchangeCards(state, currentPlayer.id, keptCardIds);

        expect(state.phase).toBe('action');
        expect(getPlayerInfluence(currentPlayer)).toBe(influence);
    });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
    it('should handle multiple players passing challenge', () => {
        const state = createTestGame(4);
        const currentPlayer = getCurrentPlayer(state);

        state.currentPlayerIndex = 0;
        const player = state.players[0];

        const newState = performAction(state, {
            type: 'tax',
            actorId: player.id,
        });

        // All other players pass
        let finalState = newState;
        for (let i = 1; i < 4; i++) {
            finalState = passChallenge(finalState, state.players[i].id);
        }

        // Action should resolve
        expect(player.coins).toBe(2 + 3); // Initial 2 + 3 from tax
    });

    it('should not allow self-targeting', () => {
        const state = createTestGame(2);
        const currentPlayer = getCurrentPlayer(state);

        expect(() => {
            performAction(state, {
                type: 'steal',
                actorId: currentPlayer.id,
                targetId: currentPlayer.id,
            });
        }).toThrow('Cannot target yourself');
    });

    it('should not allow targeting eliminated players', () => {
        const state = createTestGame(3);
        const currentPlayer = getCurrentPlayer(state);
        const target = state.players.find(p => p.id !== currentPlayer.id)!;

        // Eliminate target
        target.isAlive = false;
        target.cards.forEach(c => c.revealed = true);

        expect(() => {
            performAction(state, {
                type: 'steal',
                actorId: currentPlayer.id,
                targetId: target.id,
            });
        }).toThrow('Invalid target');
    });
});

// ============================================================================
// STEAL TARGET ELIMINATION DURING CHALLENGE
// ============================================================================

describe('Steal with Target Elimination During Challenge', () => {
    it('should handle when steal target dies from failed challenge', () => {
        const state = createTestGame(3);
        const player1 = state.players[0];
        const player2 = state.players[1];
        const player3 = state.players[2];

        setCurrentPlayer(state, player1.id);
        setPlayerCards(state, player1.id, ['Captain', 'Duke']);
        
        // Player 2 has only 1 card
        setPlayerCards(state, player2.id, ['Ambassador']);
        givePlayerCoins(state, player2.id, 5);

        // Player 1 steals from Player 2
        let newState = performAction(state, {
            type: 'steal',
            actorId: player1.id,
            targetId: player2.id,
        });

        // Player 2 challenges (wrongly - Player 1 has Captain)
        newState = challengeAction(newState, {
            challengerId: player2.id,
            targetPlayerId: player1.id,
            claimedCharacter: 'Captain',
            isBlockChallenge: false,
        });

        // Player 2 loses their only card
        const cardToLose = player2.cards.find(c => !c.revealed)!;
        loseInfluence(newState, player2.id, cardToLose.id);

        // Player 2 is eliminated
        expect(player2.isAlive).toBe(false);

        // The target is dead, so block_window would hang. Game should skip it.
        expect(newState.phase).not.toBe('block_window');
        expect(newState.phase).toBe('action');
    });
});

// ============================================================================
// PLAYER DISCONNECTION/RECONNECTION TESTS
// ============================================================================

describe('Player Disconnection and Elimination', () => {
    let state: GameState;

    beforeEach(() => {
        state = createTestGame(4);
    });

    describe('eliminatePlayer function', () => {
        it('should eliminate a player and reveal all their cards', () => {
            const player = state.players[1];
            expect(player.isAlive).toBe(true);
            expect(player.cards.some(c => !c.revealed)).toBe(true);

            const newState = eliminatePlayer(state, player.id);

            expect(player.isAlive).toBe(false);
            expect(player.cards.every(c => c.revealed)).toBe(true);
        });

        it('should declare winner when only one player remains after elimination', () => {
            // Start with 2 players
            const twoPlayerState = createTestGame(2);
            const player1 = twoPlayerState.players[0];
            const player2 = twoPlayerState.players[1];

            const newState = eliminatePlayer(twoPlayerState, player2.id);

            expect(newState.phase).toBe('game_over');
            expect(newState.winner).toBe(player1.id);
        });

        it('should not eliminate an already dead player', () => {
            const player = state.players[1];
            
            // First elimination
            let newState = eliminatePlayer(state, player.id);
            expect(player.isAlive).toBe(false);

            // Try to eliminate again - should not cause issues
            newState = eliminatePlayer(newState, player.id);
            expect(player.isAlive).toBe(false);
            expect(newState.phase).not.toBe('game_over'); // Game should continue with other players
        });

        it('should handle elimination when it is the disconnected players turn', () => {
            // Set player 1 as current player
            setCurrentPlayer(state, state.players[0].id);
            const currentPlayer = getCurrentPlayer(state);

            // Eliminate current player (simulating disconnect timeout)
            const newState = eliminatePlayer(state, currentPlayer.id);

            expect(currentPlayer.isAlive).toBe(false);
            // Turn should move to next player
            expect(newState.phase).toBe('action');
            expect(getCurrentPlayer(newState).id).not.toBe(currentPlayer.id);
        });

        it('should handle elimination when player is the target of pending action', () => {
            const actor = state.players[0];
            const target = state.players[1];

            setCurrentPlayer(state, actor.id);
            givePlayerCoins(state, actor.id, 3);

            // Start an assassination
            let newState = performAction(state, {
                type: 'assassinate',
                actorId: actor.id,
                targetId: target.id,
            });

            expect(newState.pendingAction?.targetId).toBe(target.id);

            // Target disconnects (simulating timeout)
            newState = eliminatePlayer(newState, target.id);

            // Action should be cancelled, turn should end
            expect(target.isAlive).toBe(false);
            expect(newState.pendingAction).toBeNull();
        });

        it('should handle elimination when player has a pending block', () => {
            const actor = state.players[0];
            const blocker = state.players[1];

            setCurrentPlayer(state, actor.id);

            // Start foreign aid
            let newState = performAction(state, {
                type: 'foreign_aid',
                actorId: actor.id,
            });

            // Blocker blocks with Duke
            newState = blockAction(newState, {
                type: 'block_foreign_aid',
                blockerId: blocker.id,
                claimedCharacter: 'Duke',
                targetActionId: 'foreign_aid',
            });

            expect(newState.pendingBlock?.blockerId).toBe(blocker.id);

            // Blocker disconnects
            newState = eliminatePlayer(newState, blocker.id);

            // Block should be cancelled, action should resolve
            expect(blocker.isAlive).toBe(false);
            expect(newState.pendingBlock).toBeNull();
        });

        it('should handle elimination during challenge window', () => {
            const actor = state.players[0];
            const challenger = state.players[1];

            setCurrentPlayer(state, actor.id);

            // Actor claims Duke for tax
            let newState = performAction(state, {
                type: 'tax',
                actorId: actor.id,
            });

            expect(newState.phase).toBe('challenge_window');

            // Challenger disconnects before challenging
            newState = eliminatePlayer(newState, challenger.id);

            expect(challenger.isAlive).toBe(false);
            // Game should continue - other players can still challenge or pass
        });

        it('should handle elimination when player is supposed to lose influence', () => {
            const player1 = state.players[0];
            const player2 = state.players[1];

            setCurrentPlayer(state, player1.id);
            givePlayerCoins(state, player1.id, 7);

            // Coup player 2
            let newState = performAction(state, {
                type: 'coup',
                actorId: player1.id,
                targetId: player2.id,
            });

            expect(newState.phase).toBe('lose_influence');
            expect(newState.pendingInfluenceLoss).toBe(player2.id);

            // Player 2 disconnects while needing to choose a card
            newState = eliminatePlayer(newState, player2.id);

            expect(player2.isAlive).toBe(false);
            expect(newState.pendingInfluenceLoss).toBeNull();
            // Game should continue
            expect(newState.phase).toBe('action');
        });
    });

    describe('Game continuity after disconnection', () => {
        it('should continue game with remaining players after elimination', () => {
            const initialAliveCount = getAlivePlayers(state).length;
            expect(initialAliveCount).toBe(4);

            // Eliminate one player
            let newState = eliminatePlayer(state, state.players[1].id);
            expect(getAlivePlayers(newState).length).toBe(3);

            // Game should still be playable
            expect(newState.phase).not.toBe('game_over');

            // Eliminate another
            newState = eliminatePlayer(newState, state.players[2].id);
            expect(getAlivePlayers(newState).length).toBe(2);

            // Game should still be playable with 2 players
            expect(newState.phase).not.toBe('game_over');
        });

        it('should handle multiple rapid disconnections', () => {
            // Simulate multiple players disconnecting rapidly
            let newState = eliminatePlayer(state, state.players[1].id);
            newState = eliminatePlayer(newState, state.players[2].id);

            expect(getAlivePlayers(newState).length).toBe(2);
            expect(newState.phase).not.toBe('game_over');

            // Eliminate one more - should end game
            newState = eliminatePlayer(newState, state.players[3].id);

            expect(getAlivePlayers(newState).length).toBe(1);
            expect(newState.phase).toBe('game_over');
            expect(newState.winner).toBe(state.players[0].id);
        });

        it('should preserve game state for reconnecting players', () => {
            // This tests that game state remains consistent
            const player = state.players[0];
            const initialCoins = player.coins;
            const initialCards = player.cards.length;

            // Simulate some game actions
            setCurrentPlayer(state, player.id);
            let newState = performAction(state, {
                type: 'income',
                actorId: player.id,
            });

            // Player's state should be updated
            expect(player.coins).toBe(initialCoins + 1);
            expect(player.cards.length).toBe(initialCards);

            // If player reconnects, they should see the same state
            // (In real scenario, server sends current state on reconnect)
            expect(newState.players.find(p => p.id === player.id)?.coins).toBe(initialCoins + 1);
        });
    });

    describe('Turn management after disconnection', () => {
        it('should skip eliminated players in turn order', () => {
            // Set up turn order: player 0 -> 1 -> 2 -> 3
            state.currentPlayerIndex = 0;

            // Eliminate player 1 and 2
            let newState = eliminatePlayer(state, state.players[1].id);
            newState = eliminatePlayer(newState, state.players[2].id);

            // Current player (0) takes action
            setCurrentPlayer(newState, state.players[0].id);
            newState = performAction(newState, {
                type: 'income',
                actorId: state.players[0].id,
            });

            // Next turn should be player 3 (skipping dead players 1 and 2)
            expect(getCurrentPlayer(newState).id).toBe(state.players[3].id);
        });

        it('should handle elimination of current player mid-turn', () => {
            setCurrentPlayer(state, state.players[0].id);
            const currentPlayer = getCurrentPlayer(state);

            // Current player disconnects
            const newState = eliminatePlayer(state, currentPlayer.id);

            // Turn should advance to next alive player
            const nextPlayer = getCurrentPlayer(newState);
            expect(nextPlayer.id).not.toBe(currentPlayer.id);
            expect(nextPlayer.isAlive).toBe(true);
        });
    });
});

// ============================================================================
// RECONNECTION GRACE PERIOD BEHAVIOR TESTS
// ============================================================================

describe('Reconnection Grace Period Behavior', () => {
    /**
     * Note: The actual 60-second timer is handled by the PartyKit server.
     * These tests verify that the game logic correctly handles the scenarios
     * that occur during the reconnection grace period.
     */

    it('should allow game to continue if player reconnects before elimination', () => {
        const state = createTestGame(3);
        const player = state.players[1];

        // Player is alive before any action
        expect(player.isAlive).toBe(true);

        // If player reconnects within grace period, no elimination occurs
        // Game state remains unchanged
        expect(getAlivePlayers(state).length).toBe(3);
        expect(state.phase).toBe('action');
    });

    it('should correctly eliminate player after grace period expires', () => {
        const state = createTestGame(3);
        const player = state.players[1];

        // Simulate grace period expiring (server calls eliminatePlayer)
        const newState = eliminatePlayer(state, player.id);

        expect(player.isAlive).toBe(false);
        expect(getAlivePlayers(newState).length).toBe(2);
    });

    it('should handle reconnection during pending action phase', () => {
        const state = createTestGame(3);
        const actor = state.players[0];
        const target = state.players[1];

        setCurrentPlayer(state, actor.id);
        givePlayerCoins(state, actor.id, 3);

        // Start assassination
        const newState = performAction(state, {
            type: 'assassinate',
            actorId: actor.id,
            targetId: target.id,
        });

        // Target is temporarily disconnected but reconnects within grace period
        // Game state should remain unchanged - target can still respond
        expect(newState.pendingAction?.targetId).toBe(target.id);
        expect(newState.phase).toBe('challenge_window');
        expect(target.isAlive).toBe(true);
    });

    it('should handle multiple disconnections and reconnections', () => {
        const state = createTestGame(4);

        // Simulate: Player 1 disconnects, Player 2 disconnects, Player 1 reconnects
        // Only Player 2 should be eliminated when their grace period expires

        // Player 1 reconnects (no elimination)
        expect(state.players[0].isAlive).toBe(true);

        // Player 2's grace period expires
        let newState = eliminatePlayer(state, state.players[1].id);
        expect(state.players[1].isAlive).toBe(false);
        expect(getAlivePlayers(newState).length).toBe(3);

        // Game continues with remaining players
        expect(newState.phase).not.toBe('game_over');
    });
});

// ============================================================================
// KICKED PLAYER PENDING TASK BUG TESTS
// ============================================================================
describe('Kicked player with pending task', () => {
    it('should advance past challenge_window when a non-actor player who has not passed is kicked', () => {
        // 3-player game: player1 does tax (claims Duke), player2 and player3 can challenge
        // player3 has not passed yet, then gets kicked -> game should advance
        const state = createTestGame(3);
        const actor = state.players[0];
        const bystander = state.players[2];

        setCurrentPlayer(state, actor.id);
        setPlayerCards(state, actor.id, ['Duke', 'Captain']);

        // Perform tax (challengeable, claims Duke)
        let newState = performAction(state, {
            type: 'tax',
            actorId: actor.id,
        });

        expect(newState.phase).toBe('challenge_window');

        // Player 2 passes the challenge
        newState = passChallenge(newState, state.players[1].id);
        // Player 3 has NOT passed yet
        expect(newState.phase).toBe('challenge_window'); // still waiting

        // Now player 3 gets kicked/eliminated
        newState = eliminatePlayer(newState, bystander.id);

        // Game should no longer be stuck in challenge_window
        // tax is not blockable, so it should resolve directly
        expect(bystander.isAlive).toBe(false);
        expect(newState.phase).not.toBe('challenge_window');
    });

    it('should resolve action when kicked player was the only one left to pass challenge', () => {
        // 2-player game: player1 does foreign_aid, only player2 can challenge
        // player2 gets kicked before passing -> action should proceed
        const state = createTestGame(3);
        const actor = state.players[0];
        const target = state.players[1];
        const bystander = state.players[2];

        setCurrentPlayer(state, actor.id);
        givePlayerCoins(state, actor.id, 7);

        // Player1 does tax (challengeable, not blockable)
        setPlayerCards(state, actor.id, ['Duke', 'Assassin']);
        let newState = performAction(state, {
            type: 'tax',
            actorId: actor.id,
        });

        expect(newState.phase).toBe('challenge_window');

        // Player 2 passes
        newState = passChallenge(newState, target.id);
        expect(newState.phase).toBe('challenge_window'); // still waiting for player 3

        // Player 3 gets kicked before passing
        newState = eliminatePlayer(newState, bystander.id);

        // All remaining alive players have passed, action should resolve
        // Tax is not blockable, so it should resolve directly
        expect(newState.phase).not.toBe('challenge_window');
    });

    it('should advance past block_window when kicked player was needed to pass for foreign_aid', () => {
        // 3-player game: player1 does foreign_aid, no one challenged, now in block_window
        // player2 passes block, player3 has not -> player3 gets kicked -> action should resolve
        const state = createTestGame(3);
        const actor = state.players[0];
        const bystander = state.players[2];

        setCurrentPlayer(state, actor.id);
        const coinsBeforeAction = actor.coins;

        // Perform foreign_aid
        let newState = performAction(state, {
            type: 'foreign_aid',
            actorId: actor.id,
        });

        // All players pass challenge
        newState = passChallenge(newState, state.players[1].id);
        newState = passChallenge(newState, state.players[2].id);
        expect(newState.phase).toBe('block_window');

        // Player 2 passes block
        newState = passBlock(newState, state.players[1].id);
        expect(newState.phase).toBe('block_window'); // still waiting for player 3

        // Player 3 gets kicked
        newState = eliminatePlayer(newState, bystander.id);

        // Game should have resolved the foreign_aid action
        expect(bystander.isAlive).toBe(false);
        expect(newState.phase).not.toBe('block_window');
    });

    it('should advance past block_window when target of a targeted action is kicked', () => {
        // player1 assassinates player2, no challenge, now in block_window waiting for player2
        // player2 gets kicked -> action should resolve (or skip since target is dead)
        const state = createTestGame(3);
        const actor = state.players[0];
        const target = state.players[1];

        setCurrentPlayer(state, actor.id);
        givePlayerCoins(state, actor.id, 5);
        setPlayerCards(state, actor.id, ['Assassin', 'Duke']);

        // Perform assassination
        let newState = performAction(state, {
            type: 'assassinate',
            actorId: actor.id,
            targetId: target.id,
        });

        // All pass challenge
        newState = passChallenge(newState, state.players[1].id);
        newState = passChallenge(newState, state.players[2].id);
        expect(newState.phase).toBe('block_window');

        // Target (player2) gets kicked while block_window is waiting for them
        newState = eliminatePlayer(newState, target.id);

        // Game should not be stuck in block_window
        expect(target.isAlive).toBe(false);
        expect(newState.phase).not.toBe('block_window');
    });

    it('should not hang when kicked player was expected to lose influence', () => {
        // player1 coups player2 -> player2 needs to lose influence
        // player2 is kicked -> game should move on
        const state = createTestGame(3);
        const actor = state.players[0];
        const target = state.players[1];

        setCurrentPlayer(state, actor.id);
        givePlayerCoins(state, actor.id, 7);

        // Perform coup
        let newState = performAction(state, {
            type: 'coup',
            actorId: actor.id,
            targetId: target.id,
        });

        // Coup goes to lose_influence phase for target
        expect(newState.pendingInfluenceLoss).toBe(target.id);
        expect(newState.phase).toBe('lose_influence');

        // Target gets kicked before choosing a card
        newState = eliminatePlayer(newState, target.id);

        // Game should not be stuck
        expect(target.isAlive).toBe(false);
        expect(newState.phase).not.toBe('lose_influence');
        expect(newState.pendingInfluenceLoss).toBeNull();
    });

    it('should handle kicking the current turn player with a pending action', () => {
        // It's player1's turn, they started an action, then get kicked
        const state = createTestGame(3);
        const actor = state.players[0];

        setCurrentPlayer(state, actor.id);

        let newState = performAction(state, {
            type: 'tax',
            actorId: actor.id,
        });

        expect(newState.phase).toBe('challenge_window');

        // Actor gets kicked mid-action
        newState = eliminatePlayer(newState, actor.id);

        // Should clean up and move to next turn
        expect(actor.isAlive).toBe(false);
        expect(newState.pendingAction).toBeNull();
        expect(newState.phase).not.toBe('challenge_window');
    });
});
