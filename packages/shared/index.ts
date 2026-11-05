import { MapSchema, Schema, type } from "@colyseus/schema";

export interface Player {
  id: string;
  x: number;
  y: number;
  name: string;
}

export const GAME_CONSTANTS = {
  PLAYER_SPEED: 5,
  MAP_SIZE: 1000,
  MAX_PLAYERS: 4,
} as const;

export const MESSAGES = {
  MOVE: "move",
  GUESS: "guess",
  GUESS_RESULT: "guess_result",
} as const;

export interface MoveInput {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export interface GuessPayload {
  word: string;
}

export interface GuessResult {
  correct: boolean;
  message: string;
  winnerName?: string;
}

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") score = 0;
}

export class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("string") phase = "lobby";
}