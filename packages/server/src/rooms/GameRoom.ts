import { Room, Client } from "colyseus";
import {
  GAME_CONSTANTS,
  MESSAGES,
  PlayerState,
  RoomState,
  type GuessPayload,
  type MoveInput,
} from "@project/shared";
import { prisma } from "../db";

const isMoveInput = (input: unknown): input is MoveInput => {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const { dx, dy } = input as Record<string, unknown>;
  const isDirection = (value: unknown) => value === -1 || value === 0 || value === 1;
  return isDirection(dx) && isDirection(dy);
};

const isGuessPayload = (input: unknown): input is GuessPayload =>
  typeof input === "object" &&
  input !== null &&
  "word" in input &&
  typeof input.word === "string" &&
  input.word.trim().length > 0 &&
  input.word.length <= 64;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export class GameRoom extends Room<RoomState> {
  maxClients = GAME_CONSTANTS.MAX_PLAYERS;
  private secretWord = "";

  async onCreate () {
    const wordCount = await prisma.word.count();
    if (wordCount === 0) {
      throw new Error("Cannot create game room: no words are available in the database.");
    }

    const selectedWord = await prisma.word.findFirst({
      skip: Math.floor(Math.random() * wordCount),
      select: { text: true },
    });
    if (!selectedWord) {
      throw new Error("Cannot create game room: failed to select a word.");
    }

    this.secretWord = selectedWord.text;
    this.setState(new RoomState());
    this.state.phase = "playing";

    this.onMessage(MESSAGES.MOVE, (client, input: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        console.warn(`Ignoring move from unknown player ${client.sessionId}`);
        return;
      }

      if (!isMoveInput(input)) {
        console.warn(`Ignoring invalid move from ${client.sessionId}`);
        return;
      }

      player.x = clamp(
        player.x + input.dx * GAME_CONSTANTS.PLAYER_SPEED,
        0,
        GAME_CONSTANTS.MAP_SIZE,
      );
      player.y = clamp(
        player.y + input.dy * GAME_CONSTANTS.PLAYER_SPEED,
        0,
        GAME_CONSTANTS.MAP_SIZE,
      );
    });

    this.onMessage(MESSAGES.GUESS, (client, input: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "playing") {
        return;
      }

      if (!isGuessPayload(input)) {
        console.warn(`Ignoring invalid guess from ${client.sessionId}`);
        return;
      }

      if (input.word.trim().toLocaleLowerCase() !== this.secretWord.toLocaleLowerCase()) {
        client.send(MESSAGES.GUESS_RESULT, {
          correct: false,
          message: "Not quite. Try again!",
        });
        return;
      }

      player.score += 1;
      this.state.phase = "ended";
      this.broadcast(MESSAGES.GUESS_RESULT, {
        correct: true,
        message: `${player.name} guessed correctly!`,
        winnerName: player.name,
      });
    });

    this.onMessage("message", (client, message) => {
      console.log(`Client ${client.sessionId} sent message:`, message);
      this.broadcast("message", `${client.sessionId}: ${message}`);
    });
  }

  onJoin (client: Client) {
    const player = new PlayerState();
    player.name = "Player";
    this.state.players.set(client.sessionId, player);
    console.log(client.sessionId, "joined!");
  }

  onLeave (client: Client, consented: boolean) {
    this.state.players.delete(client.sessionId);
    console.log(client.sessionId, "left!");
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
