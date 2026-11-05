import "./style.css";
import * as Colyseus from "colyseus.js";
import {
  GAME_CONSTANTS,
  MESSAGES,
  RoomState,
  type GuessResult,
  type MoveInput,
} from "@project/shared";

const serverUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
const client = new Colyseus.Client(serverUrl);

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.innerHTML = `
    <main class="game-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Word Parkour home">
          <span class="brand-mark" aria-hidden="true">W</span>
          <span>word<span class="brand-accent">parkour</span></span>
        </a>
        <div class="connection-pill" id="status" role="status" aria-live="polite">
          <span class="connection-dot" aria-hidden="true"></span>
          Connecting to game...
        </div>
      </header>

      <section class="game-layout" aria-label="Game">
        <div class="play-column">
          <section class="welcome-row">
            <div>
              <p class="eyebrow">MULTIPLAYER WORD RACE</p>
              <h1>Find your next step.</h1>
              <p class="subtitle">Move around the arena and be the first to guess the word.</p>
            </div>
            <div class="room-chip">
              <span class="room-label">ROOM</span>
              <strong id="roomId">Connecting...</strong>
            </div>
          </section>

          <section class="arena-card" aria-label="Game arena">
            <div class="arena-topline">
              <div>
                <span class="section-kicker">THE ARENA</span>
                <span class="arena-hint">Use WASD or arrow keys to move</span>
              </div>
              <div class="round-status" id="phaseBadge">Waiting for players</div>
            </div>
            <div class="arena" id="arena">
              <div class="arena-decoration decoration-one" aria-hidden="true"></div>
              <div class="arena-decoration decoration-two" aria-hidden="true"></div>
              <div class="arena-decoration decoration-three" aria-hidden="true"></div>
              <div class="arena-center" aria-hidden="true">
                <span class="center-star">✳</span>
                <span>KEEP MOVING</span>
              </div>
              <div class="players-layer" id="playersLayer" aria-label="Players in arena"></div>
              <div class="arena-coordinate" aria-hidden="true">0, 0</div>
            </div>
            <div class="arena-footer">
              <span><i class="legend-dot self-dot"></i>You</span>
              <span><i class="legend-dot other-dot"></i>Other players</span>
              <span class="speed-label">MOVE SPEED <strong>${GAME_CONSTANTS.PLAYER_SPEED}</strong></span>
            </div>
          </section>

          <section class="guess-card" aria-label="Guess the word">
            <div class="guess-icon" aria-hidden="true">?</div>
            <div class="guess-copy">
              <h2>Got a guess?</h2>
              <p>Type your answer below. Every correct guess earns a point.</p>
            </div>
            <form class="guess-form" id="guessForm">
              <label class="sr-only" for="guessInput">Your word guess</label>
              <input id="guessInput" type="text" placeholder="Type a word..." maxlength="64" autocomplete="off" disabled />
              <button class="primary-button" id="guessBtn" type="submit" disabled>Guess <span aria-hidden="true">↗</span></button>
            </form>
            <p class="guess-feedback" id="guessStatus" role="status" aria-live="polite"></p>
          </section>
        </div>

        <aside class="side-column">
          <section class="panel players-panel">
            <div class="panel-heading">
              <div>
                <span class="section-kicker">YOUR CREW</span>
                <h2>Players <span class="count-badge" id="playerCount">0</span></h2>
              </div>
              <span class="players-limit">MAX ${GAME_CONSTANTS.MAX_PLAYERS}</span>
            </div>
            <div class="player-list" id="playerList">
              <p class="empty-state">Waiting for players to join...</p>
            </div>
          </section>

          <section class="panel chat-panel">
            <div class="panel-heading">
              <div>
                <span class="section-kicker">SAY HELLO</span>
                <h2>Room chat</h2>
              </div>
              <span class="chat-live"><i></i> LIVE</span>
            </div>
            <div class="chat-messages" id="messages" role="log" aria-live="polite" aria-relevant="additions">
              <p class="empty-state">No messages yet. Break the ice!</p>
            </div>
            <form class="chat-form" id="chatForm">
              <label class="sr-only" for="msgInput">Chat message</label>
              <input id="msgInput" type="text" placeholder="Send a message..." maxlength="200" autocomplete="off" disabled />
              <button class="send-button" id="sendBtn" type="submit" aria-label="Send message" disabled>↑</button>
            </form>
          </section>

          <div class="tip-card">
            <span class="tip-sparkle" aria-hidden="true">✦</span>
            <p><strong>Quick tip</strong><br />Keep moving while you think. The arena is all yours!</p>
          </div>
        </aside>
      </section>
      <footer class="footer-note">Made for curious minds <span aria-hidden="true">✳</span></footer>
    </main>
  `;

  const statusEl = document.querySelector<HTMLDivElement>("#status");
  const roomIdEl = document.querySelector<HTMLElement>("#roomId");
  const phaseBadge = document.querySelector<HTMLDivElement>("#phaseBadge");
  const playersLayer = document.querySelector<HTMLDivElement>("#playersLayer");
  const playerList = document.querySelector<HTMLDivElement>("#playerList");
  const playerCount = document.querySelector<HTMLSpanElement>("#playerCount");
  const guessForm = document.querySelector<HTMLFormElement>("#guessForm");
  const guessInput = document.querySelector<HTMLInputElement>("#guessInput");
  const guessBtn = document.querySelector<HTMLButtonElement>("#guessBtn");
  const guessStatus = document.querySelector<HTMLParagraphElement>("#guessStatus");
  const chatForm = document.querySelector<HTMLFormElement>("#chatForm");
  const msgInput = document.querySelector<HTMLInputElement>("#msgInput");
  const sendBtn = document.querySelector<HTMLButtonElement>("#sendBtn");
  const messagesEl = document.querySelector<HTMLDivElement>("#messages");
  const movementKeys: Record<string, MoveInput> = {
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    w: { dx: 0, dy: -1 },
    s: { dx: 0, dy: 1 },
    a: { dx: -1, dy: 0 },
    d: { dx: 1, dy: 0 },
  };

  client.joinOrCreate("game_room", {}, RoomState).then(room => {
    if (statusEl) {
      statusEl.classList.add("is-connected");
      statusEl.innerHTML = '<span class="connection-dot" aria-hidden="true"></span>Connected';
    }
    if (roomIdEl) roomIdEl.textContent = room.id;

    const renderState = (state: RoomState) => {
      const players = Array.from(state.players.entries());
      const currentPlayer = players.find(([sessionId]) => sessionId === room.sessionId);
      if (playersLayer) {
        playersLayer.replaceChildren();
        players.forEach(([sessionId, player], index) => {
          const token = document.createElement("div");
          token.className = `player-token${sessionId === room.sessionId ? " is-self" : ""}`;
          token.style.left = `${Math.max(4, Math.min(96, (player.x / GAME_CONSTANTS.MAP_SIZE) * 100))}%`;
          token.style.top = `${Math.max(6, Math.min(94, (player.y / GAME_CONSTANTS.MAP_SIZE) * 100))}%`;
          token.style.setProperty("--player-hue", String((index * 83 + 176) % 360));
          token.setAttribute("aria-label", `${player.name}${sessionId === room.sessionId ? " (you)" : ""}`);
          token.title = `${player.name} · ${player.score} ${player.score === 1 ? "point" : "points"}`;
          token.innerHTML = `<span class="token-avatar" aria-hidden="true">${player.name.slice(0, 1).toUpperCase() || "P"}</span><span class="token-name"></span>`;
          const tokenName = token.querySelector<HTMLSpanElement>(".token-name");
          if (tokenName) tokenName.textContent = sessionId === room.sessionId ? "You" : player.name;
          playersLayer.append(token);
        });
      }

      if (playerList) {
        playerList.replaceChildren();
        if (players.length === 0) {
          const empty = document.createElement("p");
          empty.className = "empty-state";
          empty.textContent = "Waiting for players to join...";
          playerList.append(empty);
        } else {
          players.forEach(([sessionId, player], index) => {
            const row = document.createElement("div");
            row.className = `player-row${sessionId === room.sessionId ? " is-self" : ""}`;
            row.innerHTML = `<span class="list-avatar" aria-hidden="true"></span><span class="player-info"><span class="player-name"></span><span class="player-you"></span></span><span class="player-score"></span>`;
            const avatar = row.querySelector<HTMLSpanElement>(".list-avatar");
            const name = row.querySelector<HTMLSpanElement>(".player-name");
            const you = row.querySelector<HTMLSpanElement>(".player-you");
            const score = row.querySelector<HTMLSpanElement>(".player-score");
            if (avatar) {
              avatar.textContent = player.name.slice(0, 1).toUpperCase() || "P";
              avatar.style.setProperty("--player-hue", String((index * 83 + 176) % 360));
            }
            if (name) name.textContent = player.name;
            if (you && sessionId === room.sessionId) you.textContent = "YOU";
            if (score) score.textContent = String(player.score);
            playerList.append(row);
          });
        }
      }

      if (playerCount) playerCount.textContent = String(players.length);
      if (phaseBadge) {
        const isPlaying = state.phase === "playing";
        phaseBadge.textContent = isPlaying ? "Round in progress" : state.phase === "ended" ? "Round complete" : "Waiting for players";
        phaseBadge.classList.toggle("is-ended", state.phase === "ended");
      }
      const canGuess = state.phase === "playing" && Boolean(currentPlayer);
      if (guessInput) guessInput.disabled = !canGuess;
      if (guessBtn) guessBtn.disabled = !canGuess;
      if (guessStatus && state.phase === "ended" && !guessStatus.textContent) {
        guessStatus.textContent = "The round is over. Nice game!";
      }
    };

    room.onStateChange(renderState);
    renderState(room.state);

    window.addEventListener("keydown", event => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, button"))) {
        return;
      }
      const input = movementKeys[event.key] ?? movementKeys[event.key.toLowerCase()];
      if (!input) return;

      event.preventDefault();
      room.send(MESSAGES.MOVE, input);
    });

    room.onMessage("message", (msg: string) => {
      if (!messagesEl) return;
      if (messagesEl.querySelector(".empty-state")) messagesEl.replaceChildren();
      const message = document.createElement("p");
      message.className = "chat-message";
      message.textContent = msg;
      messagesEl.append(message);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    room.onMessage(MESSAGES.GUESS_RESULT, (result: GuessResult) => {
      if (!guessStatus) return;
      guessStatus.textContent = result.message;
      guessStatus.classList.toggle("is-correct", result.correct);
      guessStatus.classList.toggle("is-incorrect", !result.correct);
    });

    guessForm?.addEventListener("submit", event => {
      event.preventDefault();
      const word = guessInput?.value.trim();
      if (!word) return;
      room.send(MESSAGES.GUESS, { word });
      if (guessInput) {
        guessInput.value = "";
        guessInput.focus();
      }
    });

    chatForm?.addEventListener("submit", event => {
      event.preventDefault();
      const message = msgInput?.value.trim();
      if (!message) return;
      room.send("message", message);
      if (msgInput) msgInput.value = "";
    });

    if (msgInput) msgInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
  }).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    if (statusEl) {
      statusEl.classList.add("is-error");
      statusEl.innerHTML = '<span class="connection-dot" aria-hidden="true"></span>Connection failed';
      statusEl.title = message;
    }
    if (roomIdEl) roomIdEl.textContent = "Unavailable";
    if (phaseBadge) phaseBadge.textContent = "Could not join";
    console.error("Join error", error);
  });
}
