import type * as Party from "partykit/server";
import type { ActionRequest, BlockRequest, ChallengeRequest, GameState } from "../lib/game-logic";
import { blockAction, challengeAction, decideInterrogate, eliminatePlayer, exchangeCards, initializeGame, loseInfluence, passBlock, passChallenge, performAction, selectInterrogateCard } from "../lib/game-logic";
import { isVariantKey, normalizeVariant } from "../lib/variants";

type MessageType =
  | { type: "join"; payload: { playerName: string } }
  | { type: "start-game" }
  | { type: "return-to-lobby" }
  | { type: "kick-player"; payload: { playerId: string } }
  | { type: "action"; payload: ActionRequest }
  | { type: "block"; payload: BlockRequest }
  | { type: "pass-block" }
  | { type: "challenge"; payload: ChallengeRequest }
  | { type: "pass-challenge" }
  | { type: "exchange"; payload: { keptCardIds: string[] } }
  | { type: "interrogate-select"; payload: { cardId: string } }
  | { type: "interrogate-decision"; payload: { decision: "keep" | "replace" } }
  | { type: "lose-influence"; payload: { cardId: string } }
  | { type: "get-state" }
  | { type: "ping" };

interface PlayerConnection {
  id: string;
  name: string;
}

interface DisconnectedPlayer {
  playerId: string;
  disconnectedAt: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// Grace period in milliseconds before eliminating a disconnected player
const RECONNECTION_GRACE_PERIOD = 60000; // 60 seconds

export default class CoupServer implements Party.Server {
  options: Party.ServerOptions = { hibernate: false };
  gameState: GameState | null = null;
  players: Map<string, PlayerConnection> = new Map();
  hostId: string | null = null;
  created: boolean = false;
  connectionToPlayerId: Map<string, string> = new Map();

  constructor(readonly party: Party.Party) { }

  private getVariantFromRoomId(roomId: string): "standard" | "inquisitor" {
    const [maybeVariant] = roomId.split("-");
    return isVariantKey(maybeVariant) ? maybeVariant : "standard";
  }

  async onStart() {
    // Load game state from storage if it exists
    const savedState = await this.party.storage.get<GameState>("gameState");
    if (savedState) {
      if (!savedState.variant) {
        const variantFromRoom = this.getVariantFromRoomId(this.party.id);
        savedState.variant = normalizeVariant(variantFromRoom);
      }
      this.gameState = savedState;
    }

    const savedPlayers = await this.party.storage.get<[string, PlayerConnection][]>("players");
    if (savedPlayers) {
      this.players = new Map(savedPlayers);
    }

    const savedHostId = await this.party.storage.get<string>("hostId");
    if (savedHostId) {
      this.hostId = savedHostId;
      this.created = true;
    }

    const isCreated = await this.party.storage.get<boolean>("created");
    if (isCreated) {
      this.created = true;
    }
  }

  async saveState() {
    if (this.gameState) {
      await this.party.storage.put("gameState", this.gameState);
    }
    await this.party.storage.put("players", Array.from(this.players.entries()));
    if (this.hostId) {
      await this.party.storage.put("hostId", this.hostId);
    }
    if (this.created) {
      await this.party.storage.put("created", true);
    }
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const action = url.searchParams.get("action");
    const playerId = url.searchParams.get("playerId") ?? conn.id;

    this.connectionToPlayerId.set(conn.id, playerId);

    if (action === "create") {
      this.created = true;
      this.party.storage.put("created", true).catch(console.error);
    }

    // If room doesn't exist (not created) and not creating, reject
    if (!this.created && action !== "create") {
      conn.send(JSON.stringify({
        type: "error",
        payload: { message: "Incorrect Game Code or No Session Found" }
      }));
      conn.close();
      return;
    }

    // If game has already started, check if player is reconnecting
    if (this.gameState) {
      const isReconnecting = this.gameState.players.some(p => p.id === playerId);

      if (!isReconnecting) {
        conn.send(JSON.stringify({
          type: "error",
          payload: { message: "The Game Already Started" }
        }));
        conn.close();
        return;
      }

      // Send current game state to reconnecting player
      conn.send(JSON.stringify({ type: "state", payload: this.gameState }));
      return;
    }

    console.log(`Player connected: ${conn.id} (PlayerID: ${playerId}) to room ${this.party.id}`);

    conn.send(JSON.stringify({
      type: "waiting",
      payload: {
        players: Array.from(this.players.values()),
        hostId: this.hostId
      }
    }));
  }

  async onMessage(message: string, sender: Party.Connection) {
    try {
      const msg = JSON.parse(message) as MessageType;
      const playerId = this.connectionToPlayerId.get(sender.id) ?? sender.id;

      switch (msg.type) {
        case "join": {
          // Check if game already started
          if (this.gameState) {
            sender.send(JSON.stringify({
              type: "error",
              payload: { message: "The Game Already Started" }
            }));
            return;
          }

          // Check if name is already taken
          const nameTaken = Array.from(this.players.values()).some(p => p.name.trim().toLowerCase() === msg.payload.playerName.trim().toLowerCase() && p.id !== playerId);
          if (nameTaken) {
            sender.send(JSON.stringify({
              type: "error",
              payload: { message: "Name is already taken" }
            }));
            return;
          }

          // Set first player as host
          if (this.players.size === 0 && !this.hostId) {
            this.hostId = playerId;
          }

          // Add player to the lobby
          this.players.set(playerId, {
            id: playerId,
            name: msg.payload.playerName,
          });
          await this.saveState();

          // Broadcast updated player list
          this.party.broadcast(JSON.stringify({
            type: "players-updated",
            payload: {
              players: Array.from(this.players.values()),
              hostId: this.hostId
            },
          }));
          break;
        }

        case "start-game": {
          // Only host can start the game
          if (playerId !== this.hostId) {
            sender.send(JSON.stringify({
              type: "error",
              payload: { message: "Only the host can start the game" },
            }));
            return;
          }

          // Initialize the game with all players
          if (this.players.size < 2) {
            sender.send(JSON.stringify({
              type: "error",
              payload: { message: "Need at least 2 players to start" },
            }));
            return;
          }

          const playerList = Array.from(this.players.values());
          const variantFromRoom = this.getVariantFromRoomId(this.party.id);
          const variant = this.gameState?.variant ?? normalizeVariant(variantFromRoom);
          this.gameState = initializeGame(playerList, variant);

          await this.saveState();

          // Broadcast game started
          this.party.broadcast(JSON.stringify({
            type: "game-started",
            payload: { gameState: this.gameState },
          }));
          break;
        }

        case "return-to-lobby": {
          if (!this.gameState) return;

          // Allow if host OR if game is over
          if (playerId !== this.hostId && this.gameState.phase !== 'game_over') {
            sender.send(JSON.stringify({
              type: "error",
              payload: { message: "Only the host can return to lobby" },
            }));
            return;
          }

          this.gameState = null;

          // Clean up players who are no longer connected
          const activePlayerIds = new Set<string>();
          for (const conn of this.party.getConnections()) {
            const pid = this.connectionToPlayerId.get(conn.id);
            if (pid) activePlayerIds.add(pid);
          }

          for (const [pid] of this.players) {
            if (!activePlayerIds.has(pid)) {
              this.players.delete(pid);
            }
          }

          // If host was removed (disconnected), assign new host
          if (this.hostId && !this.players.has(this.hostId)) {
            const remaining = Array.from(this.players.keys());
            this.hostId = remaining.length > 0 ? remaining[0] : null;
          }

          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: null,
          }));

          this.party.broadcast(JSON.stringify({
            type: "players-updated",
            payload: {
              players: Array.from(this.players.values()),
              hostId: this.hostId
            },
          }));
          break;
        }

        case "kick-player": {
          // Only host can kick players
          if (playerId !== this.hostId) {
            sender.send(JSON.stringify({
              type: "error",
              payload: { message: "Only the host can kick players" },
            }));
            return;
          }

          const targetPlayerId = msg.payload.playerId;

          // Can't kick yourself
          if (targetPlayerId === playerId) {
            sender.send(JSON.stringify({
              type: "error",
              payload: { message: "Cannot kick yourself" },
            }));
            return;
          }

          // If game is in progress, eliminate the player instead of removing
          if (this.gameState && this.gameState.phase !== "waiting" && this.gameState.phase !== "game_over") {
            const targetPlayer = this.gameState.players.find(p => p.id === targetPlayerId);
            if (targetPlayer && targetPlayer.isAlive) {
              // Clear any pending reconnection timeout for this player
              const disconnectedInfo = this.disconnectedPlayers.get(targetPlayerId);
              if (disconnectedInfo?.timeoutId) {
                clearTimeout(disconnectedInfo.timeoutId);
                this.disconnectedPlayers.delete(targetPlayerId);
              }

              // Eliminate the player
              this.gameState = eliminatePlayer(this.gameState, targetPlayerId, 'was kicked');
              await this.saveState();

              // Broadcast updated game state
              this.party.broadcast(JSON.stringify({
                type: "state",
                payload: this.gameState,
              }));

              // Notify about the kick
              this.party.broadcast(JSON.stringify({
                type: "player-kicked-from-game",
                payload: { 
                  playerId: targetPlayerId,
                  playerName: targetPlayer.name,
                  message: `${targetPlayer.name} was kicked from the game`
                }
              }));
            }
          } else {
            // Game hasn't started - remove from lobby
            this.players.delete(targetPlayerId);
            await this.saveState();

            // Broadcast updated player list
            this.party.broadcast(JSON.stringify({
              type: "players-updated",
              payload: {
                players: Array.from(this.players.values()),
                hostId: this.hostId
              },
            }));
          }

          // Send kick message to kicked player and close their connection
          for (const conn of this.party.getConnections()) {
            const connPlayerId = this.connectionToPlayerId.get(conn.id);
            if (connPlayerId === targetPlayerId) {
              conn.send(JSON.stringify({
                type: "kicked",
                payload: { message: "You have been kicked from the game" },
              }));
              conn.close();
              break;
            }
          }
          break;
        }

        case "action": {
          if (!this.gameState) return;

          this.gameState = performAction(this.gameState, msg.payload);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "block": {
          if (!this.gameState) return;

          this.gameState = blockAction(this.gameState, msg.payload);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "pass-block": {
          if (!this.gameState) return;

          // Use persistent playerId directly
          if (!playerId) return;

          this.gameState = passBlock(this.gameState, playerId);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "challenge": {
          if (!this.gameState) return;

          this.gameState = challengeAction(this.gameState, msg.payload);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "pass-challenge": {
          if (!this.gameState) return;

          // Use persistent playerId directly
          if (!playerId) return;

          this.gameState = passChallenge(this.gameState, playerId);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "exchange": {
          if (!this.gameState) return;

          // Use persistent playerId directly
          if (!playerId) return;

          this.gameState = exchangeCards(this.gameState, playerId, msg.payload.keptCardIds);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "interrogate-select": {
          if (!this.gameState) return;

          if (!playerId) return;

          this.gameState = selectInterrogateCard(this.gameState, playerId, msg.payload.cardId);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "interrogate-decision": {
          if (!this.gameState) return;

          if (!playerId) return;

          this.gameState = decideInterrogate(this.gameState, playerId, msg.payload.decision);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "lose-influence": {
          if (!this.gameState) return;

          // Use persistent playerId directly
          if (!playerId) return;

          loseInfluence(this.gameState, playerId, msg.payload.cardId);
          await this.saveState();

          this.party.broadcast(JSON.stringify({
            type: "state",
            payload: this.gameState,
          }));
          break;
        }

        case "get-state": {
          if (this.gameState) {
            sender.send(JSON.stringify({
              type: "state",
              payload: this.gameState,
            }));
          }
          break;
        }

        case "ping": {
          // Simple ping to check if room is active
          sender.send(JSON.stringify({ type: "pong" }));
          break;
        }
      }
    } catch (error) {
      console.error("Error handling message:", error);
      sender.send(JSON.stringify({
        type: "error",
        payload: { message: "Invalid message format" },
      }));
    }
  }

  onClose(conn: Party.Connection) {
    const playerId = this.connectionToPlayerId.get(conn.id);
    console.log(`Player disconnected: ${conn.id} (PlayerID: ${playerId})`);

    if (playerId) {
      this.connectionToPlayerId.delete(conn.id);
    }

    // If game is in progress, eliminate the player
    if (this.gameState && this.gameState.phase !== "waiting" && this.gameState.phase !== "game_over" && playerId) {
      // Check if player is actually in the game (might be a spectator or old connection)
      const player = this.gameState.players.find(p => p.id === playerId);
      if (player && player.isAlive) {
        this.gameState = eliminatePlayer(this.gameState, playerId);
        this.saveState();
        this.party.broadcast(JSON.stringify({
          type: "state",
          payload: this.gameState,
        }));
      }
    }

    // Remove player from the lobby if game hasn't started
    if ((!this.gameState || this.gameState.phase === "waiting") && playerId) {
      this.players.delete(playerId);

      // If host left, assign new host (first remaining player)
      if (playerId === this.hostId) {
        const remainingPlayers = Array.from(this.players.keys());
        this.hostId = remainingPlayers.length > 0 ? remainingPlayers[0] : null;
      }

      this.saveState();

      this.party.broadcast(JSON.stringify({
        type: "players-updated",
        payload: {
          players: Array.from(this.players.values()),
          hostId: this.hostId
        },
      }));
    }
  }

  onError(conn: Party.Connection, error: Error) {
    console.error(`Error for connection ${conn.id}:`, error);
  }

  // Helper method to get player ID from connection ID
  private getPlayerIdFromConnection(connId: string): string | null {
    // This method is now redundant as we use connectionToPlayerId map
    // But keeping it for safety if needed, though logic above uses map directly
    return this.connectionToPlayerId.get(connId) || null;
  }
}

CoupServer satisfies Party.Worker;
