/**
 * Coup Game Logic
 * This file contains all the game logic for the Coup card game
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

import { getVariantConfig, normalizeVariant, VariantKey } from "./variants";

export type CharacterType = 'Duke' | 'Assassin' | 'Captain' | 'Ambassador' | 'Contessa' | 'Inquisitor';

export type ActionType =
    | 'income'
    | 'foreign_aid'
    | 'coup'
    | 'tax'
    | 'assassinate'
    | 'steal'
    | 'exchange'
    | 'interrogate'
    | 'inquire';

export type BlockType = 'block_foreign_aid' | 'block_assassinate' | 'block_steal';

export interface Card {
    id: string;
    character: CharacterType;
    revealed: boolean;
}

export interface Player {
    id: string;
    name: string;
    coins: number;
    cards: Card[];
    isAlive: boolean;
}

export interface ActionRequest {
    type: ActionType;
    actorId: string;
    targetId?: string;
    claimedCharacter?: CharacterType;
}

export interface BlockRequest {
    type: BlockType;
    blockerId: string;
    claimedCharacter: CharacterType;
    targetActionId: string;
}

export interface ChallengeRequest {
    challengerId: string;
    targetPlayerId: string;
    claimedCharacter: CharacterType;
    isBlockChallenge: boolean;
}

export interface GameState {
    id: string;
    variant: VariantKey;
    players: Player[];
    currentPlayerIndex: number;
    courtDeck: Card[];
    discardPile: Card[];
    phase: GamePhase;
    pendingAction: ActionRequest | null;
    pendingBlock: BlockRequest | null;
    pendingChallenge: ChallengeRequest | null;
    pendingExchangeCards: Card[] | null;
    pendingInterrogate: {
        targetId: string;
        selectedCardId?: string;
        actorDecision?: 'keep' | 'replace';
    } | null;
    pendingInfluenceLoss: string | null; // Player ID who needs to choose a card to reveal
    passedPlayers: string[];
    winner: string | null;
    turn: number;
    log: GameLogEntry[];
}

export type GamePhase =
    | 'waiting'        // Waiting for players to join
    | 'action'         // Current player must choose an action
    | 'block_window'   // Other players can block the action
    | 'challenge_window' // Players can challenge action or block
    | 'resolving'      // Resolving action/challenge/block
    | 'exchange'       // Ambassador is choosing cards to exchange
    | 'interrogate_select'  // Inquisitor target selects a card
    | 'interrogate_decision' // Inquisitor decides keep/replace
    | 'lose_influence' // Player must choose a card to reveal
    | 'game_over';

export interface GameLogEntry {
    timestamp: number;
    message: string;
    playerId?: string;
    actionType?: string;
    targetId?: string;
    turn: number;
}

// ============================================================================
// GAME INITIALIZATION
// ============================================================================

export function createDeck(variant?: VariantKey): Card[] {
    const variantConfig = getVariantConfig(variant);
    const characters: CharacterType[] = variantConfig.characters;
    const deck: Card[] = [];

    characters.forEach((character) => {
        for (let i = 0; i < 3; i++) {
            deck.push({
                id: `${character}-${i}`,
                character,
                revealed: false,
            });
        }
    });

    return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export function initializeGame(playersList: { id: string; name: string }[], variant?: VariantKey): GameState {
    if (playersList.length < 2 || playersList.length > 6) {
        throw new Error('Game requires 2-6 players');
    }

    const normalizedVariant = normalizeVariant(variant);
    const deck = createDeck(normalizedVariant);
    const players: Player[] = [];

    // Deal 2 cards to each player
    playersList.forEach((p) => {
        const playerCards = [deck.pop()!, deck.pop()!];
        players.push({
            id: p.id,
            name: p.name,
            coins: 2,
            cards: playerCards,
            isAlive: true,
        });
    });

    // Randomize starting player
    const startingPlayerIndex = Math.floor(Math.random() * players.length);

    return {
        id: `game-${Date.now()}`,
        variant: normalizedVariant,
        players,
        currentPlayerIndex: startingPlayerIndex,
        courtDeck: deck,
        discardPile: [],
        phase: 'action',
        pendingAction: null,
        pendingBlock: null,
        pendingChallenge: null,
        pendingExchangeCards: null,
        pendingInterrogate: null,
        pendingInfluenceLoss: null,
        passedPlayers: [],
        winner: null,
        turn: 1,
        log: [{
            timestamp: Date.now(),
            message: 'Game started',
            turn: 1,
        }],
    };
}

// ============================================================================
// GAME STATE QUERIES
// ============================================================================

export function getCurrentPlayer(state: GameState): Player {
    return state.players[state.currentPlayerIndex];
}

export function getPlayer(state: GameState, playerId: string): Player | undefined {
    return state.players.find(p => p.id === playerId);
}

export function getAlivePlayers(state: GameState): Player[] {
    return state.players.filter(p => p.isAlive);
}

export function getPlayerInfluence(player: Player): number {
    return player.cards.filter(c => !c.revealed).length;
}

export function isPlayerAlive(player: Player): boolean {
    return getPlayerInfluence(player) > 0;
}

export function getWinner(state: GameState): Player | null {
    const alivePlayers = getAlivePlayers(state);
    return alivePlayers.length === 1 ? alivePlayers[0] : null;
}

// ============================================================================
// ACTION VALIDATION
// ============================================================================

export function canPerformAction(
    state: GameState,
    playerId: string,
    action: ActionType,
    targetId?: string
): { valid: boolean; reason?: string } {
    const player = getPlayer(state, playerId);
    if (!player) return { valid: false, reason: 'Player not found' };
    if (!player.isAlive) return { valid: false, reason: 'Player is eliminated' };
    if (getCurrentPlayer(state).id !== playerId) {
        return { valid: false, reason: 'Not your turn' };
    }
    if (state.phase !== 'action') {
        return { valid: false, reason: 'Not in action phase' };
    }

    const variantConfig = getVariantConfig(state.variant);
    if (!variantConfig.availableActions.includes(action)) {
        return { valid: false, reason: 'Action not available in this variant' };
    }

    const requirements = variantConfig.actionRequirements[action];

    // Check coin cost
    if (requirements.cost && player.coins < requirements.cost) {
        return { valid: false, reason: 'Not enough coins' };
    }

    // Check if must coup with 10+ coins
    if (player.coins >= 10 && action !== 'coup') {
        return { valid: false, reason: 'Must coup with 10 or more coins' };
    }

    // Check target requirement
    if (requirements.needsTarget && !targetId) {
        return { valid: false, reason: 'Action requires a target' };
    }

    if (targetId) {
        const target = getPlayer(state, targetId);
        if (!target || !target.isAlive) {
            return { valid: false, reason: 'Invalid target' };
        }
        if (target.id === playerId) {
            return { valid: false, reason: 'Cannot target yourself' };
        }
    }

    return { valid: true };
}

export function canBlock(
    state: GameState,
    playerId: string,
    character: CharacterType
): { valid: boolean; reason?: string } {
    if (state.phase !== 'block_window') {
        return { valid: false, reason: 'Not in block window' };
    }
    if (!state.pendingAction) {
        return { valid: false, reason: 'No pending action to block' };
    }

    const player = getPlayer(state, playerId);
    if (!player || !player.isAlive) {
        return { valid: false, reason: 'Player not found or eliminated' };
    }

    const requirements = getVariantConfig(state.variant).actionRequirements[state.pendingAction.type];
    if (!requirements.canBeBlocked) {
        return { valid: false, reason: 'Action cannot be blocked' };
    }

    if (!requirements.blockingCharacters?.includes(character)) {
        return { valid: false, reason: `${character} cannot block this action` };
    }

    // Players cannot block their own actions
    if (state.pendingAction.actorId === playerId) {
        return { valid: false, reason: 'Cannot block your own action' };
    }

    // Check if player is the target (for targeted actions) or any player (for foreign aid)
    if (state.pendingAction.type !== 'foreign_aid' &&
        state.pendingAction.targetId !== playerId) {
        return { valid: false, reason: 'Only the target can block this action' };
    }

    return { valid: true };
}

export function canChallenge(
    state: GameState,
    challengerId: string,
    targetPlayerId: string
): { valid: boolean; reason?: string } {
    const challenger = getPlayer(state, challengerId);
    if (!challenger || !challenger.isAlive) {
        return { valid: false, reason: 'Challenger not found or eliminated' };
    }

    if (challengerId === targetPlayerId) {
        return { valid: false, reason: 'Cannot challenge yourself' };
    }

    // Challenges are only allowed during the challenge window
    if (state.phase !== 'challenge_window') {
        return { valid: false, reason: 'Not in challenge phase' };
    }

    // There must be a character claim to challenge: either from a block or from the action itself
    const hasClaimToChallenge = Boolean(state.pendingBlock?.claimedCharacter || state.pendingAction?.claimedCharacter);
    if (!hasClaimToChallenge) {
        return { valid: false, reason: 'Nothing to challenge' };
    }

    if (state.pendingBlock) {
        // Challenge against block
        if (targetPlayerId !== state.pendingBlock.blockerId) {
            return { valid: false, reason: 'Must challenge the active block' };
        }
    } else if (state.pendingAction) {
        // Challenge against action
        if (targetPlayerId !== state.pendingAction.actorId) {
            return { valid: false, reason: 'Must challenge the active player' };
        }
    }

    return { valid: true };
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

export function performAction(state: GameState, action: ActionRequest): GameState {
    const validation = canPerformAction(state, action.actorId, action.type, action.targetId);
    if (!validation.valid) {
        throw new Error(validation.reason);
    }

    const newState = { ...state };
    const actor = getPlayer(newState, action.actorId)!;
    const requirements = getVariantConfig(newState.variant).actionRequirements[action.type];

    // Deduct cost if any
    if (requirements.cost) {
        actor.coins -= requirements.cost;
    }

    // Set claimed character for character actions
    if (requirements.character) {
        action.claimedCharacter = requirements.character;
    }

    newState.pendingAction = action;
    newState.passedPlayers = [];

    // Actions that can be challenged or blocked go to appropriate window
    if (requirements.character) {
        newState.phase = 'challenge_window';
        let message = `${actor.name} claims ${requirements.character} to ${action.type}`;
        if (action.targetId) {
            const target = getPlayer(newState, action.targetId);
            if (target) {
                if (action.type === 'steal') {
                    message += ` from ${target.name}`;
                } else if (action.type === 'assassinate') {
                    message += ` ${target.name}`;
                }
            }
        }
        addLog(newState, message, action.actorId, action.type, action.targetId);
    } else if (requirements.canBeBlocked) {
        newState.phase = 'block_window';
        addLog(newState, `${actor.name} attempts ${action.type}`, action.actorId, action.type, action.targetId);
    } else {
        // Income and Coup resolve immediately
        resolveAction(newState);
    }

    return newState;
}

export function resolveAction(state: GameState): void {
    if (!state.pendingAction) {
        addLog(state, `resolveAction called but no pendingAction found`);
        return;
    }

    const action = state.pendingAction;
    const actor = getPlayer(state, action.actorId)!;
    const target = action.targetId ? getPlayer(state, action.targetId) : null;

    addLog(state, `Resolving action: ${action.type} by ${actor.name}`, action.actorId);

    switch (action.type) {
        case 'income':
            actor.coins += 1;
            addLog(state, `${actor.name} takes 1 coin (Income)`, actor.id, action.type);
            break;

        case 'foreign_aid':
            actor.coins += 2;
            addLog(state, `${actor.name} takes 2 coins (Foreign Aid)`, actor.id, action.type);
            break;

        case 'coup':
            if (target) {
                if (!target.isAlive) {
                    addLog(state, `${actor.name}'s coup target is already eliminated`, actor.id, action.type, target.id);
                    break;
                }
                addLog(state, `${actor.name} coups ${target.name}`, actor.id, action.type, target.id);
                addLog(state, `${target.name} must lose influence`, target.id);
                state.pendingInfluenceLoss = target.id;
                state.phase = 'lose_influence';
                return;
            }
            break;

        case 'tax':
            actor.coins += 3;
            addLog(state, `${actor.name} takes 3 coins (Tax)`, actor.id, action.type);
            break;

        case 'assassinate':
            if (target) {
                if (!target.isAlive) {
                    addLog(state, `${actor.name}'s assassination target is already eliminated`, actor.id, action.type, target.id);
                    break;
                }
                addLog(state, `${actor.name} assassinates ${target.name}`, actor.id, action.type, target.id);
                addLog(state, `${target.name} must lose influence`, target.id);
                state.pendingInfluenceLoss = target.id;
                state.phase = 'lose_influence';
                return;
            }
            break;

        case 'steal':
            if (target) {
                if (!target.isAlive) {
                    addLog(state, `${actor.name}'s steal target is already eliminated`, actor.id, action.type, target.id);
                    break;
                }
                const stolen = Math.min(2, target.coins);
                target.coins -= stolen;
                actor.coins += stolen;
                addLog(state, `${actor.name} steals ${stolen} coins from ${target.name}`, actor.id, action.type, target.id);
            }
            break;

        case 'exchange':
            // Exchange requires player to choose cards, so we enter exchange phase
            // Draw 2 cards from deck
            const drawnCards: Card[] = [];
            for (let i = 0; i < 2 && state.courtDeck.length > 0; i++) {
                drawnCards.push(state.courtDeck.pop()!);
            }
            state.pendingExchangeCards = drawnCards;
            state.phase = 'exchange';
            addLog(state, `${actor.name} exchanges cards`, actor.id, action.type);
            return; // Don't end turn yet

        case 'inquire':
            // Inquisitor draw 1, return 1
            const inquiryCards: Card[] = [];
            if (state.courtDeck.length > 0) {
                inquiryCards.push(state.courtDeck.pop()!);
            }
            state.pendingExchangeCards = inquiryCards;
            state.phase = 'exchange';
            addLog(state, `${actor.name} inquires from the court`, actor.id, action.type);
            return;

        case 'interrogate':
            if (target) {
                if (!target.isAlive) {
                    addLog(state, `${actor.name}'s interrogation target is already eliminated`, actor.id, action.type, target.id);
                    break;
                }
                state.pendingInterrogate = { targetId: target.id };
                state.phase = 'interrogate_select';
                addLog(state, `${actor.name} interrogates ${target.name}`, actor.id, action.type, target.id);
                return;
            }
            break;
    }

    state.pendingAction = null;
    endTurn(state);
}

export function blockAction(state: GameState, block: BlockRequest): GameState {
    const validation = canBlock(state, block.blockerId, block.claimedCharacter);
    if (!validation.valid) {
        throw new Error(validation.reason);
    }

    const newState = { ...state };
    const blocker = getPlayer(newState, block.blockerId)!;

    newState.pendingBlock = block;
    newState.phase = 'challenge_window';
    newState.passedPlayers = [];

    addLog(newState, `${blocker.name} claims ${block.claimedCharacter} to block`, block.blockerId);

    return newState;
}

export function passBlock(state: GameState, playerId: string): GameState {
    const newState = { ...state };

    if (newState.phase === 'block_window' && newState.pendingAction) {
        // Add player to passed list if not already there
        if (!newState.passedPlayers.includes(playerId)) {
            newState.passedPlayers.push(playerId);
            const player = getPlayer(newState, playerId);
            if (player) {
                addLog(newState, `${player.name} allows the action`, playerId);
            }
        }

        // Check if all eligible blockers have passed
        let allPassed = false;
        const actionType = newState.pendingAction.type;
        const alivePlayers = getAlivePlayers(newState);

        if (actionType === 'foreign_aid') {
            // Everyone except actor must pass
            const eligibleBlockers = alivePlayers.filter(p => p.id !== newState.pendingAction!.actorId);
            allPassed = eligibleBlockers.every(p => newState.passedPlayers.includes(p.id));
        } else {
            // Targeted actions (assassinate, steal) - only target must pass
            const targetId = newState.pendingAction.targetId;
            if (targetId && newState.passedPlayers.includes(targetId)) {
                allPassed = true;
            }
        }

        if (allPassed) {
            // No one blocked, proceed to resolve action
            newState.phase = 'resolving';
            newState.passedPlayers = [];
            resolveAction(newState);
        }
    }

    return newState;
}

// ============================================================================
// CHALLENGE SYSTEM
// ============================================================================

export function challengeAction(
    state: GameState,
    challenge: ChallengeRequest
): GameState {
    const validation = canChallenge(state, challenge.challengerId, challenge.targetPlayerId);
    if (!validation.valid) {
        throw new Error(validation.reason);
    }

    const newState = { ...state };
    const challenger = getPlayer(newState, challenge.challengerId)!;
    const target = getPlayer(newState, challenge.targetPlayerId)!;

    // Store the challenge so we know how to resolve after influence loss
    newState.pendingChallenge = challenge;

    addLog(newState, `${challenger.name} challenges ${target.name}'s ${challenge.claimedCharacter}`, challenge.challengerId);

    // Check if target has the claimed character
    const hasCharacter = target.cards.some(
        card => !card.revealed && card.character === challenge.claimedCharacter
    );

    if (hasCharacter) {
        // Challenge failed - challenger loses influence
        addLog(newState, `${target.name} reveals ${challenge.claimedCharacter}! Challenge failed.`, target.id);
        addLog(newState, `${challenger.name} must lose influence`, challenger.id);
        newState.pendingInfluenceLoss = challenger.id;
        newState.phase = 'lose_influence';

        // Target reveals and shuffles back the card
        const cardIndex = target.cards.findIndex(
            card => !card.revealed && card.character === challenge.claimedCharacter
        );
        if (cardIndex !== -1) {
            const revealedCard = target.cards[cardIndex];
            target.cards.splice(cardIndex, 1);
            newState.courtDeck.push(revealedCard);
            newState.courtDeck = shuffleDeck(newState.courtDeck);

            // Draw a new card
            if (newState.courtDeck.length > 0) {
                target.cards.push(newState.courtDeck.pop()!);
            }
        }

        // Store what to do after influence is lost
        if (challenge.isBlockChallenge) {
            // Block challenge failed, so block stands. Action is blocked.
            // Will resolve after influence loss
        } else {
            // Action will succeed after influence loss
        }
    } else {
        // Challenge succeeded - target loses influence
        addLog(newState, `${target.name} doesn't have ${challenge.claimedCharacter}! Challenge succeeded.`, target.id);
        addLog(newState, `${target.name} must lose influence`, target.id);
        newState.pendingInfluenceLoss = target.id;
        newState.phase = 'lose_influence';
    }

    return newState;
}

export function passChallenge(state: GameState, playerId: string): GameState {
    const newState = { ...state };

    if (newState.phase === 'challenge_window') {
        // Add player to passed list
        if (!newState.passedPlayers.includes(playerId)) {
            newState.passedPlayers.push(playerId);
            const player = getPlayer(newState, playerId);
            if (player) {
                addLog(newState, `${player.name} allows the action`, playerId);
            }
        }

        // Check if all eligible challengers have passed
        // Everyone except the person being challenged (actor or blocker)
        const alivePlayers = getAlivePlayers(newState);
        let subjectId: string;

        if (newState.pendingBlock) {
            subjectId = newState.pendingBlock.blockerId;
        } else if (newState.pendingAction) {
            subjectId = newState.pendingAction.actorId;
        } else {
            return newState; // Should not happen
        }

        const eligibleChallengers = alivePlayers.filter(p => p.id !== subjectId);
        const allPassed = eligibleChallengers.every(p => newState.passedPlayers.includes(p.id));

        if (allPassed) {
            // No one challenged
            newState.passedPlayers = [];
            if (newState.pendingBlock) {
                // Block succeeds, action is cancelled
                const blocker = getPlayer(newState, newState.pendingBlock.blockerId)!;
                addLog(newState, `${blocker.name}'s block succeeds`, newState.pendingBlock.blockerId);
                newState.pendingBlock = null;
                newState.pendingAction = null;
                endTurn(newState);
            } else {
                // Action unchallenged
                // Check if it can be blocked
                const action = newState.pendingAction!;
                const requirements = getVariantConfig(newState.variant).actionRequirements[action.type];

                if (requirements.canBeBlocked) {
                    newState.phase = 'block_window';
                } else {
                    // Action succeeds
                    resolveAction(newState);
                }
            }
        }
    }

    return newState;
}

// ============================================================================
// INFLUENCE MANAGEMENT
// ============================================================================

export function loseInfluence(state: GameState, playerId: string, cardId?: string): void {
    const player = getPlayer(state, playerId);
    if (!player) return;

    // If cardId specified, reveal that card; otherwise reveal first unrevealed card
    let card: Card | undefined;
    if (cardId) {
        card = player.cards.find(c => c.id === cardId && !c.revealed);
    } else {
        card = player.cards.find(c => !c.revealed);
    }

    if (card) {
        card.revealed = true;
        addLog(state, `${player.name} loses influence (${card.character})`, playerId);

        // Clear pending influence loss
        state.pendingInfluenceLoss = null;

        // Check if player is eliminated
        if (getPlayerInfluence(player) === 0) {
            player.isAlive = false;
            addLog(state, `${player.name} is eliminated`, playerId);

            // Check for winner
            const alivePlayers = getAlivePlayers(state);
            if (alivePlayers.length === 1) {
                state.winner = alivePlayers[0].id;
                state.phase = 'game_over';
                addLog(state, `${alivePlayers[0].name} wins!`, alivePlayers[0].id);
                return;
            }
        }

        // Continue game after influence loss
        if (state.pendingChallenge) {
            // Was from a challenge, resolve based on challenge outcome
            const wasChallengeSuccessful = state.pendingChallenge.targetPlayerId === playerId;

            if (state.pendingChallenge.isBlockChallenge) {
                if (wasChallengeSuccessful) {
                    // Block was fake, action goes through
                    state.pendingBlock = null;
                    state.pendingChallenge = null;
                    resolveAction(state);
                } else {
                    // Block was real, action is blocked
                    state.pendingBlock = null;
                    state.pendingAction = null;
                    state.pendingChallenge = null;
                    endTurn(state);
                }
            } else {
                if (wasChallengeSuccessful) {
                    // Action was fake, turn ends
                    state.pendingAction = null;
                    state.pendingChallenge = null;
                    endTurn(state);
                } else {
                    // Action was real, challenge failed, action succeeds
                    // Clear the challenge before resolving so the action can proceed
                    addLog(state, `Challenge failed, action confirmed valid`, state.pendingAction?.actorId);
                    state.pendingChallenge = null;

                    // Check if action can be blocked
                    const actionType = state.pendingAction!.type;
                    const requirements = getVariantConfig(state.variant).actionRequirements[actionType];

                    if (requirements.canBeBlocked) {
                        const actionTargetId = state.pendingAction!.targetId;
                        const actionTarget = actionTargetId ? getPlayer(state, actionTargetId) : null;

                        if (actionTarget && !actionTarget.isAlive) {
                            addLog(state, `Target eliminated during challenge, action complete`, state.pendingAction?.actorId);
                            state.pendingAction = null;
                            endTurn(state);
                        } else {
                            state.phase = 'block_window';
                            state.passedPlayers = [];
                            addLog(state, `Action confirmed, moving to block window`, state.pendingAction?.actorId);
                        }
                    } else {
                        resolveAction(state);
                    }
                }
            }
        } else if (state.pendingAction) {
            // Regular influence loss (from coup, assassinate, etc)
            state.pendingAction = null;
            endTurn(state);
        } else {
            // Some other cause of influence loss
            endTurn(state);
        }
    }
}

export function exchangeCards(
    state: GameState,
    playerId: string,
    keptCardIds: string[]
): GameState {
    if (state.phase !== 'exchange') {
        throw new Error('Not in exchange phase');
    }

    const newState = { ...state };
    const player = getPlayer(newState, playerId);
    if (!player || player.id !== getCurrentPlayer(newState).id) {
        throw new Error('Invalid player for exchange');
    }

    // Get cards from pending exchange
    const drawnCards = newState.pendingExchangeCards || [];

    // Combine current cards with drawn cards
    const allCards = [...player.cards.filter(c => !c.revealed), ...drawnCards];

    // Keep the specified cards
    const keptCards = allCards.filter(c => keptCardIds.includes(c.id));
    const returnedCards = allCards.filter(c => !keptCardIds.includes(c.id));

    if (keptCards.length !== getPlayerInfluence(player)) {
        throw new Error('Must keep the same number of cards as current influence');
    }

    // Update player's cards
    player.cards = [...keptCards, ...player.cards.filter(c => c.revealed)];

    // Return other cards to deck
    newState.courtDeck.push(...returnedCards);
    newState.courtDeck = shuffleDeck(newState.courtDeck);

    newState.pendingAction = null;
    newState.pendingExchangeCards = null;
    endTurn(newState);

    return newState;
}

export function selectInterrogateCard(
    state: GameState,
    playerId: string,
    cardId: string
): GameState {
    if (state.phase !== 'interrogate_select' || !state.pendingInterrogate || !state.pendingAction) {
        throw new Error('Not in interrogate selection phase');
    }

    if (state.pendingInterrogate.targetId !== playerId) {
        throw new Error('Only the target can select a card');
    }

    const newState = { ...state };
    const target = getPlayer(newState, playerId);
    if (!target) {
        throw new Error('Target not found');
    }

    const selectedCard = target.cards.find(card => card.id === cardId && !card.revealed);
    if (!selectedCard) {
        throw new Error('Invalid card selection');
    }

    if (!newState.pendingInterrogate) {
        throw new Error('Interrogate state missing');
    }

    newState.pendingInterrogate = {
        targetId: newState.pendingInterrogate.targetId,
        selectedCardId: selectedCard.id,
    };
    newState.phase = 'interrogate_decision';
    addLog(newState, `${target.name} selects a card for interrogation`, target.id, 'interrogate', target.id);

    return newState;
}

export function decideInterrogate(
    state: GameState,
    playerId: string,
    decision: 'keep' | 'replace'
): GameState {
    if (state.phase !== 'interrogate_decision' || !state.pendingInterrogate || !state.pendingAction) {
        throw new Error('Not in interrogate decision phase');
    }

    const actorId = state.pendingAction.actorId;
    if (playerId !== actorId) {
        throw new Error('Only the actor can decide');
    }

    const newState = { ...state };
    const actor = getPlayer(newState, actorId)!;
    const pendingInterrogate = newState.pendingInterrogate;
    if (!pendingInterrogate) {
        throw new Error('Interrogate state missing');
    }
    const target = getPlayer(newState, pendingInterrogate.targetId);
    const selectedCardId = pendingInterrogate.selectedCardId;

    if (!target || !selectedCardId) {
        newState.pendingInterrogate = null;
        newState.pendingAction = null;
        endTurn(newState);
        return newState;
    }

    const selectedIndex = target.cards.findIndex(card => card.id === selectedCardId && !card.revealed);
    if (selectedIndex === -1) {
        newState.pendingInterrogate = null;
        newState.pendingAction = null;
        endTurn(newState);
        return newState;
    }

    if (decision === 'replace' && newState.courtDeck.length > 0) {
        const [removedCard] = target.cards.splice(selectedIndex, 1);
        newState.courtDeck.push(removedCard);
        newState.courtDeck = shuffleDeck(newState.courtDeck);

        const newCard = newState.courtDeck.pop();
        if (newCard) {
            target.cards.push(newCard);
        }

        addLog(newState, `${actor.name} replaces ${target.name}'s card`, actor.id, 'interrogate', target.id);
    } else {
        addLog(newState, `${actor.name} allows ${target.name} to keep the card`, actor.id, 'interrogate', target.id);
    }

    newState.pendingInterrogate = null;
    newState.pendingAction = null;
    endTurn(newState);

    return newState;
}

export function eliminatePlayer(state: GameState, playerId: string, reason: string = 'disconnected'): GameState {
    const newState = { ...state };
    const player = getPlayer(newState, playerId);

    if (!player || !player.isAlive) return newState;

    // Reveal all cards
    player.cards.forEach(c => c.revealed = true);
    player.isAlive = false;

    addLog(newState, `${player.name} ${reason} and was eliminated`, playerId);

    // Check for winner immediately
    const alivePlayers = getAlivePlayers(newState);
    if (alivePlayers.length <= 1) {
        if (alivePlayers.length === 1) {
            newState.winner = alivePlayers[0].id;
            addLog(newState, `${alivePlayers[0].name} wins!`, alivePlayers[0].id);
        }
        newState.phase = 'game_over';
        return newState;
    }

    // Handle game flow interruption

    // 1. If it was the disconnected player's turn
    if (getCurrentPlayer(newState).id === playerId) {
        // Clear any pending actions initiated by them
        newState.pendingAction = null;
        newState.pendingBlock = null;
        newState.pendingChallenge = null;
        newState.pendingExchangeCards = null;
        newState.pendingInfluenceLoss = null;

        endTurn(newState);
        return newState;
    }

    // 2. If they were the target of the current action
    if (newState.pendingAction?.targetId === playerId) {
        addLog(newState, `Action cancelled because target disconnected`);
        newState.pendingAction = null;
        newState.pendingBlock = null;
        newState.pendingChallenge = null;
        newState.pendingInfluenceLoss = null;
        endTurn(newState); // End the actor's turn
        return newState;
    }

    // 3. If they were blocking
    if (newState.pendingBlock?.blockerId === playerId) {
        addLog(newState, `Block cancelled because blocker disconnected`);
        newState.pendingBlock = null;
        // If we were in challenge window for the block, go back to resolving action?
        // Or just resolve the action immediately since block is gone.
        newState.phase = 'resolving';
        resolveAction(newState);
        return newState;
    }

    // 4. If they were challenging
    if (newState.pendingChallenge?.challengerId === playerId) {
        addLog(newState, `Challenge cancelled because challenger disconnected`);
        newState.pendingChallenge = null;

        // If they were challenging a block
        if (newState.pendingBlock) {
            // Block stands? Or we go back to block window?
            // If challenge is cancelled, usually the action/block stands.
            // Let's say block stands.
            addLog(newState, `Block stands`);
            newState.pendingAction = null;
            newState.pendingBlock = null;
            endTurn(newState);
        } else {
            // They were challenging an action
            // Action stands
            newState.phase = 'resolving';
            resolveAction(newState);
        }
        return newState;
    }

    // 5. If they were involved in an interrogation
    if (newState.pendingInterrogate &&
        (newState.pendingInterrogate.targetId === playerId || newState.pendingAction?.actorId === playerId)) {
        addLog(newState, `Interrogation cancelled because a player disconnected`);
        newState.pendingInterrogate = null;
        newState.pendingAction = null;
        endTurn(newState);
        return newState;
    }

    // 6. If they were supposed to lose influence
    if (newState.pendingInfluenceLoss === playerId) {
        // They are already dead, so we just need to move on.
        // We need to know what to do next.
        // This is tricky because loseInfluence usually handles the "next step".
        // But since they are dead, we can probably just end the turn or resolve action.

        // If it was a challenge, and they lost.
        if (newState.pendingChallenge) {
            // ... logic from loseInfluence ...
            // It's safer to just end the turn to avoid getting stuck.
            newState.pendingAction = null;
            newState.pendingBlock = null;
            newState.pendingChallenge = null;
            newState.pendingInfluenceLoss = null;
            endTurn(newState);
        } else {
            // Regular influence loss
            newState.pendingAction = null;
            newState.pendingInfluenceLoss = null;
            endTurn(newState);
        }
        return newState;
    }

    // 7. If the eliminated player was expected to pass in a waiting phase,
    // re-check whether all remaining alive players have now passed.
    // Without this, the game hangs waiting for a dead player's response.
    if (newState.phase === 'challenge_window') {
        const currentAlivePlayers = getAlivePlayers(newState);
        let subjectId: string | null = null;

        if (newState.pendingBlock) {
            subjectId = newState.pendingBlock.blockerId;
        } else if (newState.pendingAction) {
            subjectId = newState.pendingAction.actorId;
        }

        if (subjectId) {
            const eligibleChallengers = currentAlivePlayers.filter(p => p.id !== subjectId);
            const allPassed = eligibleChallengers.every(p => newState.passedPlayers.includes(p.id));

            if (allPassed) {
                newState.passedPlayers = [];
                if (newState.pendingBlock) {
                    // Block succeeds, action is cancelled
                    const blocker = getPlayer(newState, newState.pendingBlock.blockerId);
                    if (blocker) {
                        addLog(newState, `${blocker.name}'s block succeeds`, newState.pendingBlock.blockerId);
                    }
                    newState.pendingBlock = null;
                    newState.pendingAction = null;
                    endTurn(newState);
                } else {
                    // Action unchallenged - check if it can be blocked
                    const action = newState.pendingAction!;
                    const requirements = getVariantConfig(newState.variant).actionRequirements[action.type];

                    if (requirements.canBeBlocked) {
                        newState.phase = 'block_window';
                    } else {
                        resolveAction(newState);
                    }
                }
            }
        }
    } else if (newState.phase === 'block_window' && newState.pendingAction) {
        const currentAlivePlayers = getAlivePlayers(newState);
        const actionType = newState.pendingAction.type;
        let allPassed = false;

        if (actionType === 'foreign_aid') {
            const eligibleBlockers = currentAlivePlayers.filter(p => p.id !== newState.pendingAction!.actorId);
            allPassed = eligibleBlockers.every(p => newState.passedPlayers.includes(p.id));
        } else {
            // Targeted actions - only target must pass
            const targetId = newState.pendingAction.targetId;
            if (targetId) {
                const target = getPlayer(newState, targetId);
                if (target && !target.isAlive) {
                    // Target is dead, action target is gone
                    allPassed = true;
                } else if (targetId && newState.passedPlayers.includes(targetId)) {
                    allPassed = true;
                }
            }
        }

        if (allPassed) {
            newState.phase = 'resolving';
            newState.passedPlayers = [];
            resolveAction(newState);
        }
    }

    return newState;
}

// ============================================================================
// TURN MANAGEMENT
// ============================================================================

export function endTurn(state: GameState): void {
    // Move to next alive player
    const alivePlayers = getAlivePlayers(state);
    if (alivePlayers.length <= 1) {
        state.phase = 'game_over';
        return;
    }

    let nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
    while (!state.players[nextIndex].isAlive) {
        nextIndex = (nextIndex + 1) % state.players.length;
    }

    state.currentPlayerIndex = nextIndex;
    state.turn += 1;
    state.phase = 'action';
    state.pendingAction = null;
    state.pendingBlock = null;
    state.pendingChallenge = null;
    state.passedPlayers = [];
    state.pendingInterrogate = null;

    // Check if deck needs reshuffling
    if (state.courtDeck.length === 0 && state.discardPile.length > 0) {
        state.courtDeck = shuffleDeck([...state.discardPile]);
        state.discardPile = [];
        addLog(state, 'Court deck reshuffled');
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

export function addLog(
    state: GameState,
    message: string,
    playerId?: string,
    actionType?: string,
    targetId?: string
): void {
    state.log.push({
        timestamp: Date.now(),
        message,
        playerId,
        actionType,
        targetId,
        turn: state.turn,
    });
}

export function getGameSummary(state: GameState): string {
    const currentPlayer = getCurrentPlayer(state);
    const alivePlayers = getAlivePlayers(state);

    return `Game ${state.id} - Phase: ${state.phase} - Current: ${currentPlayer.name} - Alive: ${alivePlayers.length}`;
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export const GameLogic = {
    // Initialization
    createDeck,
    shuffleDeck,
    initializeGame,

    // Queries
    getCurrentPlayer,
    getPlayer,
    getAlivePlayers,
    getPlayerInfluence,
    isPlayerAlive,
    getWinner,

    // Validation
    canPerformAction,
    canBlock,
    canChallenge,

    // Actions
    performAction,
    resolveAction,
    blockAction,
    passBlock,

    // Challenges
    challengeAction,
    passChallenge,

    // Influence
    loseInfluence,
    exchangeCards,
    selectInterrogateCard,
    decideInterrogate,
    eliminatePlayer,

    // Turn management
    endTurn,

    // Utilities
    addLog,
    getGameSummary,
    resetGame,
};

export function resetGame(state: GameState): GameState {
    const playersList = state.players.map(p => ({ id: p.id, name: p.name }));
    const newState = initializeGame(playersList, state.variant);
    // Preserve the original game ID if needed, but a new one is fine too.
    // Let's keep the ID to avoid confusion if clients are tracking it.
    newState.id = state.id;
    return newState;
}
