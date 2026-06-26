import { GuestPeer, HostPeer, createLobbyCode } from "./webrtc.js";

const suits = ["S", "H", "D", "C"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const rankValues = { A: 11, K: 10, Q: 10, J: 10 };
const hostId = "host";
const guestId = "guest";

const els = {
  connectionStatus: document.querySelector("#connectionStatus"),
  lobbyBadge: document.querySelector("#lobbyBadge"),
  menuView: document.querySelector("#menuView"),
  lobbyView: document.querySelector("#lobbyView"),
  hostLobby: document.querySelector("#hostLobby"),
  joinLobby: document.querySelector("#joinLobby"),
  gameView: document.querySelector("#gameView"),
  hostOffer: document.querySelector("#hostOffer"),
  guestAnswer: document.querySelector("#guestAnswer"),
  joinOffer: document.querySelector("#joinOffer"),
  joinAnswer: document.querySelector("#joinAnswer"),
  enemyToken: document.querySelector("#enemyToken"),
  enemyName: document.querySelector("#enemyName"),
  enemyHpBar: document.querySelector("#enemyHpBar"),
  enemyHpText: document.querySelector("#enemyHpText"),
  dealerCards: document.querySelector("#dealerCards"),
  dealerTotal: document.querySelector("#dealerTotal"),
  players: document.querySelector("#players"),
  phaseTitle: document.querySelector("#phaseTitle"),
  phaseText: document.querySelector("#phaseText"),
  goldText: document.querySelector("#goldText"),
  floorText: document.querySelector("#floorText"),
  betControls: document.querySelector("#betControls"),
  playControls: document.querySelector("#playControls"),
  log: document.querySelector("#log")
};

let role = "solo";
let localPlayerId = hostId;
let peer = null;
let state = null;
let guestHelloSent = false;
let hostWelcomeSent = false;

document.querySelector("#soloBtn").addEventListener("click", () => {
  role = "solo";
  localPlayerId = hostId;
  state = createGameState([{ id: hostId, name: "You" }]);
  showGame();
});

document.querySelector("#hostBtn").addEventListener("click", async () => {
  role = "host";
  localPlayerId = hostId;
  hostWelcomeSent = false;
  guestHelloSent = false;
  const code = createLobbyCode();
  state = createGameState([{ id: hostId, name: "Host" }], code);
  peer = new HostPeer({
    code,
    onMessage: handleHostMessage,
    onStatus: setConnectionStatus
  });
  showLobby("host", code);
  els.hostOffer.value = await peer.createInvite();
});

document.querySelector("#joinBtn").addEventListener("click", () => {
  role = "guest";
  localPlayerId = guestId;
  hostWelcomeSent = false;
  guestHelloSent = false;
  showLobby("join");
});

document.querySelector("#backToMenuBtn").addEventListener("click", () => showMenu());
document.querySelector("#copyOfferBtn").addEventListener("click", () => copyText(els.hostOffer.value));
document.querySelector("#copyAnswerBtn").addEventListener("click", () => copyText(els.joinAnswer.value));

document.querySelector("#acceptAnswerBtn").addEventListener("click", async () => {
  try {
    await peer.acceptAnswer(els.guestAnswer.value);
    ensureGuestSeat();
    showGame();
    broadcastState();
  } catch (err) {
    setConnectionStatus(err.message);
  }
});

document.querySelector("#createAnswerBtn").addEventListener("click", async () => {
  try {
    peer = new GuestPeer({
      onMessage: handleGuestMessage,
      onStatus: setConnectionStatus
    });
    els.joinAnswer.value = await peer.createAnswer(els.joinOffer.value);
    els.lobbyBadge.hidden = false;
    els.lobbyBadge.textContent = peer.code;
  } catch (err) {
    setConnectionStatus(err.message);
  }
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => performAction(button.dataset.action));
});

function showMenu() {
  els.menuView.hidden = false;
  els.lobbyView.hidden = true;
  els.gameView.hidden = true;
  els.lobbyBadge.hidden = true;
  setConnectionStatus("Free web lobby prototype");
}

function showLobby(mode, code = "") {
  els.menuView.hidden = true;
  els.lobbyView.hidden = false;
  els.gameView.hidden = true;
  els.hostLobby.hidden = mode !== "host";
  els.joinLobby.hidden = mode !== "join";
  els.lobbyBadge.hidden = !code;
  els.lobbyBadge.textContent = code;
  setConnectionStatus(mode === "host" ? "Waiting for guest answer" : "Paste a host invite");
}

function showGame() {
  els.menuView.hidden = true;
  els.lobbyView.hidden = true;
  els.gameView.hidden = false;
  if (state?.code) {
    els.lobbyBadge.hidden = false;
    els.lobbyBadge.textContent = state.code;
  }
  render();
}

function setConnectionStatus(status) {
  const labels = {
    new: "Creating connection",
    checking: "Connecting",
    connected: "Connected",
    completed: "Connected",
    disconnected: "Disconnected",
    failed: "Connection failed",
    closed: "Connection closed"
  };
  els.connectionStatus.textContent = labels[status] ?? status;
  if ((status === "connected" || status === "completed") && role === "guest" && !guestHelloSent) {
    guestHelloSent = true;
    peer?.send({ type: "hello", playerId: guestId });
  }
  if ((status === "connected" || status === "completed") && role === "host" && !hostWelcomeSent) {
    hostWelcomeSent = true;
    ensureGuestSeat();
    showGame();
    broadcastState();
  }
}

function createGameState(players, code = "") {
  return {
    code,
    phase: "betting",
    gold: 200,
    floor: 1,
    activePlayerId: players[0].id,
    deck: shuffleDeck(),
    dealer: [],
    enemy: { name: "The Dealer Eternal", hp: 80, maxHp: 80 },
    players: players.map((player) => ({
      ...player,
      bet: 10,
      ready: false,
      hand: [],
      stood: false,
      result: ""
    })),
    log: ["A new run begins."]
  };
}

function ensureGuestSeat() {
  if (!state.players.some((player) => player.id === guestId)) {
    state.players.push({
      id: guestId,
      name: "Guest",
      bet: 10,
      ready: false,
      hand: [],
      stood: false,
      result: ""
    });
    state.log.unshift("A guest joined the table.");
  }
}

function handleHostMessage(message) {
  if (message.type === "hello") {
    ensureGuestSeat();
    showGame();
    broadcastState();
    return;
  }
  if (message.type === "action") {
    applyAction(message.playerId, message.action);
    broadcastState();
  }
}

function handleGuestMessage(message) {
  if (message.type === "state") {
    state = message.state;
    showGame();
  }
}

function broadcastState() {
  render();
  if (role === "host" && peer) {
    peer.send({ type: "state", state });
  }
}

function performAction(action) {
  if (role === "guest") {
    peer?.send({ type: "action", playerId: guestId, action });
    return;
  }
  applyAction(localPlayerId, action);
  broadcastState();
}

function applyAction(playerId, action) {
  if (!state) return;
  const player = state.players.find((seat) => seat.id === playerId);
  if (!player) return;

  if (state.phase === "betting") {
    if (action === "betDown") player.bet = Math.max(1, player.bet - 5);
    if (action === "betUp") player.bet = Math.min(100, player.bet + 5);
    if (action === "ready") {
      player.ready = true;
      state.log.unshift(`${player.name} is ready with ${player.bet} gold.`);
      if (state.players.every((seat) => seat.ready)) {
        dealRound();
      }
    }
    return;
  }

  if (state.phase !== "playing" || state.activePlayerId !== playerId || player.stood) return;

  if (action === "hit") {
    player.hand.push(drawCard(true));
    if (handTotal(player.hand) > 21) {
      player.stood = true;
      player.result = "Busted";
      state.log.unshift(`${player.name} busted.`);
      advanceTurn();
    }
  }

  if (action === "stand") {
    player.stood = true;
    state.log.unshift(`${player.name} stands.`);
    advanceTurn();
  }
}

function dealRound() {
  state.phase = "playing";
  state.deck = state.deck.length < 20 ? shuffleDeck() : state.deck;
  state.dealer = [drawCard(true), drawCard(false)];
  state.players.forEach((player) => {
    state.gold -= player.bet;
    player.hand = [drawCard(true), drawCard(true)];
    player.stood = false;
    player.result = "";
  });
  state.activePlayerId = state.players[0].id;
  state.log.unshift("Cards hit the felt.");
  advancePastFinishedPlayers();
}

function advanceTurn() {
  const currentIndex = state.players.findIndex((player) => player.id === state.activePlayerId);
  const next = state.players.slice(currentIndex + 1).find((player) => !player.stood);
  if (next) {
    state.activePlayerId = next.id;
    return;
  }
  dealerPlay();
}

function advancePastFinishedPlayers() {
  const active = state.players.find((player) => !player.stood && handTotal(player.hand) <= 21);
  if (active) {
    state.activePlayerId = active.id;
  } else {
    dealerPlay();
  }
}

function dealerPlay() {
  state.phase = "settled";
  state.dealer.forEach((card) => {
    card.faceUp = true;
  });
  while (handTotal(state.dealer) < 17) {
    state.dealer.push(drawCard(true));
  }
  const dealerTotal = handTotal(state.dealer);
  let damage = 0;
  state.players.forEach((player) => {
    const total = handTotal(player.hand);
    if (total > 21) {
      player.result = "Lose";
    } else if (dealerTotal > 21 || total > dealerTotal) {
      player.result = "Win";
      damage += player.bet;
      state.gold += player.bet * 2;
    } else if (total === dealerTotal) {
      player.result = "Push";
      state.gold += player.bet;
    } else {
      player.result = "Lose";
    }
  });
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);
  state.log.unshift(damage > 0 ? `The party deals ${damage} damage.` : "The dealer takes the round.");
  setTimeout(() => {
    if (state?.phase === "settled") {
      resetForNextRound();
      broadcastState();
    }
  }, 1600);
}

function resetForNextRound() {
  if (state.enemy.hp <= 0) {
    state.floor += 1;
    state.enemy = { name: state.floor >= 3 ? "The Dealer Eternal" : "Veiled Magician", hp: 80 + state.floor * 20, maxHp: 80 + state.floor * 20 };
    state.log.unshift(`Floor ${state.floor} opens below the table.`);
  }
  state.phase = "betting";
  state.dealer = [];
  state.players.forEach((player) => {
    player.ready = false;
    player.hand = [];
    player.stood = false;
    player.result = "";
    player.bet = Math.min(player.bet, Math.max(1, state.gold));
  });
}

function shuffleDeck() {
  const deck = [];
  for (let shoe = 0; shoe < 4; shoe += 1) {
    suits.forEach((suit) => ranks.forEach((rank) => deck.push({ rank, suit, faceUp: true })));
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCard(faceUp) {
  const card = state.deck.pop() ?? shuffleDeck().pop();
  return { ...card, faceUp };
}

function handTotal(cards) {
  let total = 0;
  let aces = 0;
  cards.filter((card) => card.faceUp).forEach((card) => {
    total += rankValues[card.rank] ?? Number(card.rank);
    if (card.rank === "A") aces += 1;
  });
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function render() {
  if (!state) return;
  els.enemyName.textContent = state.enemy.name;
  els.enemyToken.textContent = initials(state.enemy.name);
  els.enemyHpBar.style.width = `${Math.max(0, (state.enemy.hp / state.enemy.maxHp) * 100)}%`;
  els.enemyHpText.textContent = `${state.enemy.hp} / ${state.enemy.maxHp} HP`;
  els.dealerCards.innerHTML = state.dealer.map(renderCard).join("");
  els.dealerTotal.textContent = state.dealer.length ? `Total ${handTotal(state.dealer)}` : "Waiting";
  els.goldText.textContent = state.gold;
  els.floorText.textContent = state.floor;
  els.phaseTitle.textContent = titleCase(state.phase);
  els.phaseText.textContent = phaseText();
  els.betControls.hidden = state.phase !== "betting";
  els.playControls.hidden = state.phase !== "playing";
  els.players.innerHTML = state.players.map(renderPlayer).join("");
  els.log.innerHTML = state.log.slice(0, 10).map((line) => `<li>${escapeHtml(line)}</li>`).join("");
}

function renderPlayer(player) {
  const active = state.phase === "playing" && state.activePlayerId === player.id;
  const local = player.id === localPlayerId;
  return `
    <article class="player-seat ${active ? "active" : ""}">
      <div class="seat-head">
        <h3>${escapeHtml(player.name)}${local ? " (You)" : ""}</h3>
        <span class="seat-meta">${player.result || (player.ready ? "Ready" : `${player.bet}g`)}</span>
      </div>
      <div class="cards">${player.hand.map(renderCard).join("")}</div>
      <div class="total-pill">${player.hand.length ? `Total ${handTotal(player.hand)}` : `Bet ${player.bet}g`}</div>
    </article>
  `;
}

function renderCard(card) {
  if (!card.faceUp) {
    return `<div class="card back" aria-label="Face-down card"></div>`;
  }
  const symbol = { S: "♠", H: "♥", D: "♦", C: "♣" }[card.suit];
  const red = card.suit === "H" || card.suit === "D";
  return `
    <div class="card ${red ? "red" : ""}">
      <span>${card.rank}</span>
      <span class="mid">${symbol}</span>
      <span>${card.rank}</span>
    </div>
  `;
}

function phaseText() {
  if (state.phase === "betting") {
    const player = state.players.find((seat) => seat.id === localPlayerId);
    return player?.ready ? "Waiting for the table." : "Set your bet and ready up.";
  }
  if (state.phase === "playing") {
    return state.activePlayerId === localPlayerId ? "Your move." : "Waiting for another seat.";
  }
  return "Resolving the round.";
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function titleCase(text) {
  return text[0].toUpperCase() + text.slice(1);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setConnectionStatus("Copied");
  } catch {
    setConnectionStatus("Select and copy manually");
  }
}

window.addEventListener("beforeunload", () => {
  if (role === "guest") {
    peer?.send({ type: "leave", playerId: guestId });
  }
});
