import "./config/env";
import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { GameRoom } from "./rooms/GameRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

const gameServer = new Server({
  server: createServer(app),
});

// Register GameRoom
gameServer.define("game_room", GameRoom);

gameServer.listen(port);
console.log(`Listening on ws://localhost:${port}`);
