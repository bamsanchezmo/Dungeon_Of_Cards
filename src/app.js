import { GuestPeer, HostPeer, createLobbyCode } from "./webrtc.js";

const W = 1280;
const H = 800;
const FPS = 60;
const MIN_BET = 1;
const MAX_BET = 500;
const CARD_W = 90;
const CARD_H = 130;
const hostId = "host";
const guestId = "guest";

const C = {
  bg: "#120e16",
  panel: "#201a2a",
  panel2: "#30263f",
  felt: "#1c382a",
  felt2: "#3c5a46",
  gold: "#dcb446",
  goldDim: "#8c6e32",
  parchment: "#ebdcb4",
  text: "#eee7d7",
  muted: "#a49b90",
  red: "#c83c3c",
  green: "#5ab46e",
  blue: "#5a8cc8",
  purple: "#a064c8",
  black: "#19151d"
};

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const signalPanel = document.querySelector("#signalPanel");
const signalTitle = document.querySelector("#signalTitle");
const signalText = document.querySelector("#signalText");
const hostFields = document.querySelector("#hostFields");
const joinFields = document.querySelector("#joinFields");
const hostOffer = document.querySelector("#hostOffer");
const guestAnswer = document.querySelector("#guestAnswer");
const joinOffer = document.querySelector("#joinOffer");
const joinAnswer = document.querySelector("#joinAnswer");

let appScene = "menu";
let role = "solo";
let localPlayerId = hostId;
let peer = null;
let game = null;
let buttons = [];
let hover = { x: -1, y: -1 };
let last = performance.now();
let musicStarted = false;
let audio = null;
let audioCtx = null;
let guestHelloSent = false;
let hostWelcomeSent = false;
let flash = "";
let flashTimer = 0;

const enemyTemplates = [
  { name: "Apprentice Croupier", title: "Floor 1 - Dealer-in-training", hp: 80, color: C.blue, icon: "C", description: "Standard rules. A gentle introduction.", hitsSoft17: false },
  { name: "Toll Collector", title: "Every card has a price", hp: 130, color: "#bea05a", icon: "$", description: "Each hit costs 5 gold.", hitFee: 5 },
  { name: "Vampire Dealer", title: "Ties belong to the night", hp: 174, color: C.red, icon: "V", description: "Pushes count as dealer wins.", tiesLose: true },
  { name: "Tin Pit Boss", title: "Cheap chips, cheaper payouts", hp: 218, color: "#a0aab4", icon: "T", description: "Blackjack pays only 6:5.", bjPays65: true },
  { name: "Veiled Magician", title: "The trick is on you", hp: 262, color: C.purple, icon: "M", description: "No peek. Doubling forbidden. Sleight of hand.", dealerPeek: false, noDouble: true, luck: 15 },
  { name: "Warden of Spades", title: "Forged in iron", hp: 350, color: "#7882a0", icon: "S", description: "No surrender, no insurance, no peek. Pushes lose.", noSurrender: true, noInsurance: true, dealerPeek: false, tiesLose: true },
  { name: "The Dealer Eternal", title: "FINAL - Architect of the dungeon", hp: 500, color: C.gold, icon: "BOSS", description: "Every house rule against you. The deck itself answers to them.", tiesLose: true, bjPays65: true, noSurrender: true, noInsurance: true, luck: 35 }
];

const relicPool = [
  { name: "Lucky Coin", icon: "$", description: "Pushes count as wins.", pushWins: true },
  { name: "Double Crown", icon: "2x", description: "Blackjack pays 2:1.", bjPays2: true },
  { name: "White Flag", icon: "F", description: "Surrender refunds your full bet.", freeSurrender: true },
  { name: "Charlie's Hand", icon: "5", description: "5 cards without busting wins automatically.", fiveCard: true },
  { name: "Insurance Policy", icon: "+", description: "Insurance pays 3:1 instead of 2:1.", insurance3: true },
  { name: "Split Mastery", icon: "><", description: "Aces may be re-split freely.", extraSplit: true },
  { name: "Vampire's Bargain", icon: "V", description: "Heal 15 HP on every winning hand.", heal: 15 },
  { name: "Pawnbroker's Note", icon: "%", description: "Refund 25% of losing bets.", refund: .25 },
  { name: "Executioner's Mark", icon: "X", description: "Deal +20 bonus damage on winning rounds.", damageBonus: 20 },
  { name: "Gambler's Tip", icon: "G", description: "Each winning hand pays +10 gold.", chipBonus: 10 },
  { name: "Featherfall Charm", icon: "~", description: "When you bust, refund 50% of that bet.", bustRefund: .5 },
  { name: "Rabbit's Foot", icon: "*", description: "+15 Luck. Cards more often land near 21.", luck: 15 },
  { name: "Four-Leaf Clover", icon: "%c", description: "+25 Luck. The shoe favors you.", luck: 25 },
  { name: "Dealer's Bane", icon: "Z", description: "+50 damage on wins and +20 gold per winning hand.", damageBonus: 50, chipBonus: 20 }
];

document.querySelector("#closeSignal").addEventListener("click", () => hideSignal());
document.querySelector("#copyOffer").addEventListener("click", () => copy(hostOffer.value));
document.querySelector("#copyAnswer").addEventListener("click", () => copy(joinAnswer.value));
document.querySelector("#acceptAnswer").addEventListener("click", acceptAnswer);
document.querySelector("#createAnswer").addEventListener("click", createAnswer);

window.addEventListener("resize", draw);
canvas.addEventListener("mousemove", (ev) => {
  hover = eventPoint(ev);
  draw();
});
canvas.addEventListener("pointerdown", (ev) => {
  const p = eventPoint(ev);
  startAudio();
  const hit = buttons.find((b) => b.enabled !== false && inRect(p, b));
  if (hit) hit.onClick();
});
window.addEventListener("keydown", (ev) => {
  if (signalPanel.hidden === false) return;
  startAudio();
  const key = ev.key.toLowerCase();
  if (key === "h") action("hit");
  if (key === "s") action("stand");
  if (key === "d") action("double");
  if (key === "p") action("split");
  if (key === "r") action("surrender");
  if (key === "enter") action(game?.phase === "betting" ? "ready" : "continue");
  if (key === "m") toggleMusic();
});

requestAnimationFrame(tick);

function tick(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (flashTimer > 0) flashTimer -= dt;
  if (game?.phase === "dealer" && role !== "guest") {
    game.dealerTimer -= dt;
    if (game.dealerTimer <= 0) dealerStep();
  }
  draw();
  requestAnimationFrame(tick);
}

function newGame(players, code = "") {
  const seats = players.map((p) => ({
    id: p.id,
    name: p.name,
    bet: 25,
    ready: false,
    hands: [],
    active: 0,
    finished: false,
    spectating: false
  }));
  game = {
    code,
    phase: "betting",
    floor: 0,
    gold: 200 + Math.max(0, seats.length - 1) * 100,
    hp: 100 + Math.max(0, seats.length - 1) * 40,
    maxHp: 100 + Math.max(0, seats.length - 1) * 40,
    enemy: cloneEnemy(0),
    deck: makeDeck(),
    dealer: [],
    seats,
    activeSeat: 0,
    relics: [],
    shop: [],
    log: [`${seats.length > 1 ? seats.length + " players enter" : "You enter"} the Dungeon of Cards.`],
    dealerTimer: .6,
    roundNet: 0,
    session: crypto.randomUUID?.() ?? String(Date.now())
  };
  appScene = "game";
}

function cloneEnemy(index) {
  const e = enemyTemplates[Math.min(index, enemyTemplates.length - 1)];
  return { ...e, maxHp: e.hp, hp: e.hp, dealerPeek: e.dealerPeek !== false };
}

function addGuestSeat() {
  if (!game || game.seats.some((s) => s.id === guestId)) return;
  game.seats.push({ id: guestId, name: "Guest", bet: 25, ready: false, hands: [], active: 0, finished: false, spectating: false });
  game.gold += 100;
  game.maxHp += 40;
  game.hp += 40;
  log("A guest joined the table.");
}

function makeDeck() {
  const deck = [];
  const suits = ["S", "H", "D", "C"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  for (let n = 0; n < 6; n++) {
    for (const suit of suits) for (const rank of ranks) deck.push({ rank, suit, up: true });
  }
  return shuffle(deck);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCard(faceUp = true, currentTotal = 0, target = "player") {
  if (game.deck.length < 30) {
    game.deck = makeDeck();
    log("The shoe is reshuffled.");
    sfx("shuffle");
  }
  const luck = target === "dealer" ? (game.enemy.luck || 0) : relicSum("luck") - (game.enemy.luck || 0);
  if (luck && Math.random() < Math.min(1, Math.abs(luck) / 100)) {
    const peek = game.deck.slice(-4);
    let chosen = peek[0];
    let score = luck > 0 ? Infinity : -Infinity;
    for (const c of peek) {
      const total = bestTotal([{ ...c, up: true }], currentTotal);
      const s = total <= 21 ? Math.abs(21 - total) : 50 + total;
      if ((luck > 0 && s < score) || (luck < 0 && s > score)) {
        score = s;
        chosen = c;
      }
    }
    game.deck.splice(game.deck.lastIndexOf(chosen), 1);
    return { ...chosen, up: faceUp };
  }
  return { ...game.deck.pop(), up: faceUp };
}

function action(name) {
  if (!game) return;
  if (role === "guest") {
    peer?.send({ type: "action", playerId: localPlayerId, action: name });
    return;
  }
  applyAction(localPlayerId, name);
  broadcast();
}

function applyAction(playerId, name) {
  if (appScene === "menu") {
    if (name === "solo") {
      role = "solo";
      localPlayerId = hostId;
      newGame([{ id: hostId, name: "You" }]);
    }
    return;
  }
  if (!game) return;
  const seatIndex = game.seats.findIndex((s) => s.id === playerId);
  const seat = game.seats[seatIndex];
  if (!seat) return;

  if (game.phase === "betting") {
    if (name === "betDown") seat.bet = clamp(seat.bet - 5, MIN_BET, Math.min(MAX_BET, game.gold));
    if (name === "betUp") seat.bet = clamp(seat.bet + 5, MIN_BET, Math.min(MAX_BET, game.gold));
    if (name === "minBet") seat.bet = MIN_BET;
    if (name === "maxBet") seat.bet = Math.min(MAX_BET, game.gold);
    if (name === "ready") {
      seat.ready = !seat.ready;
      log(`${seat.name} ${seat.ready ? "is ready" : "is adjusting their bet"}.`);
      if (game.seats.every((s) => s.ready) && game.seats.some((s) => s.bet > 0)) dealRound();
    }
    return;
  }

  if (game.phase === "insurance") {
    const h = seat.hands[0];
    if (name === "insuranceYes" && h && !seat.insuranceAnswered) {
      const cost = Math.floor(seat.bet / 2);
      if (game.gold >= cost) {
        game.gold -= cost;
        h.insurance = cost;
      }
      seat.insuranceAnswered = true;
    }
    if (name === "insuranceNo") seat.insuranceAnswered = true;
    if (game.seats.filter((s) => !s.spectating).every((s) => s.insuranceAnswered)) peekCheck();
    return;
  }

  if (game.phase === "roundOver" || game.phase === "shop" || game.phase === "victory" || game.phase === "defeat") {
    if (name === "continue") continueAfterRound();
    if (name.startsWith("buy:")) buyRelic(Number(name.slice(4)));
    if (name === "skipShop") nextBattle();
    return;
  }

  if (game.phase !== "player" || seatIndex !== game.activeSeat) return;
  const hand = activeHand(seat);
  if (!hand || hand.status !== "playing") return;

  if (name === "hit") hit(seatIndex);
  if (name === "stand") stand(seatIndex);
  if (name === "double") doubleDown(seatIndex);
  if (name === "split") split(seatIndex);
  if (name === "surrender") surrender(seatIndex);
}

function dealRound() {
  const totalBets = game.seats.reduce((sum, s) => sum + s.bet, 0);
  if (game.gold < totalBets || totalBets <= 0) return;
  game.gold -= totalBets;
  game.dealer = [];
  for (const s of game.seats) {
    s.hands = s.bet > 0 ? [newHand(s.bet)] : [];
    s.active = 0;
    s.finished = s.bet <= 0;
    s.spectating = s.bet <= 0;
    s.ready = false;
    s.insuranceAnswered = false;
  }
  for (let i = 0; i < game.seats.length; i++) if (!game.seats[i].spectating) addToHand(game.seats[i].hands[0], "player");
  game.dealer.push(drawCard(true, 0, "dealer"));
  for (let i = 0; i < game.seats.length; i++) if (!game.seats[i].spectating) addToHand(game.seats[i].hands[0], "player");
  game.dealer.push(drawCard(false, visibleTotal(game.dealer), "dealer"));
  log("Cards hit the felt.");
  sfx("deal");
  if (game.dealer[0].rank === "A" && !game.enemy.noInsurance) {
    game.phase = "insurance";
  } else {
    peekCheck();
  }
}

function newHand(bet) {
  return { cards: [], bet, status: "playing", doubled: false, split: false, splitAces: false, insurance: 0 };
}

function addToHand(hand, target) {
  hand.cards.push(drawCard(true, handTotal(hand), target));
}

function peekCheck() {
  const dealerBj = game.enemy.dealerPeek && isBlackjackCards(game.dealer);
  if (dealerBj) {
    game.dealer[1].up = true;
    settleRound();
    return;
  }
  for (const s of game.seats) {
    for (const h of s.hands) if (isBlackjack(h)) h.status = "stand";
    s.finished = s.hands.length === 0 || s.hands.every((h) => h.status !== "playing");
  }
  advanceSeat();
}

function hit(seatIndex) {
  const seat = game.seats[seatIndex];
  const hand = activeHand(seat);
  const fee = game.enemy.hitFee || 0;
  if (fee) game.gold = Math.max(0, game.gold - fee);
  addToHand(hand, "player");
  sfx("deal");
  if (isBust(hand)) {
    hand.status = "bust";
    sfx("bust");
    advanceHand();
  } else if (handTotal(hand) === 21 || (has("fiveCard") && hand.cards.length >= 5)) {
    hand.status = "stand";
    advanceHand();
  }
}

function stand() {
  const h = activeHand(game.seats[game.activeSeat]);
  if (h) h.status = "stand";
  advanceHand();
}

function doubleDown() {
  const seat = game.seats[game.activeSeat];
  const h = activeHand(seat);
  if (!h || h.cards.length !== 2 || game.enemy.noDouble || game.gold < h.bet) return flashMsg("Double unavailable");
  game.gold -= h.bet;
  h.bet *= 2;
  h.doubled = true;
  addToHand(h, "player");
  h.status = isBust(h) ? "bust" : "stand";
  sfx(isBust(h) ? "bust" : "deal");
  advanceHand();
}

function split() {
  const seat = game.seats[game.activeSeat];
  const h = activeHand(seat);
  if (!h || h.cards.length !== 2 || cardValue(h.cards[0]) !== cardValue(h.cards[1]) || game.gold < h.bet || seat.hands.length >= 4) {
    return flashMsg("Split unavailable");
  }
  if (h.splitAces && h.cards[0].rank === "A" && !has("extraSplit")) return flashMsg("Aces cannot be re-split");
  game.gold -= h.bet;
  const moved = h.cards.pop();
  const h2 = newHand(h.bet);
  h2.cards = [moved];
  h2.split = true;
  h2.splitAces = moved.rank === "A";
  h.split = true;
  h.splitAces = h.cards[0].rank === "A";
  addToHand(h, "player");
  addToHand(h2, "player");
  seat.hands.splice(seat.active + 1, 0, h2);
  if (h.splitAces) {
    h.status = "stand";
    h2.status = "stand";
  }
  sfx("deal");
  advancePastDoneHands();
}

function surrender() {
  const h = activeHand(game.seats[game.activeSeat]);
  if (!h || h.cards.length !== 2 || game.enemy.noSurrender) return flashMsg("Surrender unavailable");
  h.status = "surrender";
  advanceHand();
}

function advanceHand() {
  const seat = game.seats[game.activeSeat];
  seat.active++;
  advancePastDoneHands();
}

function advancePastDoneHands() {
  const seat = game.seats[game.activeSeat];
  while (seat && seat.active < seat.hands.length && seat.hands[seat.active].status !== "playing") seat.active++;
  if (!seat || seat.active >= seat.hands.length) {
    if (seat) seat.finished = true;
    game.activeSeat++;
    advanceSeat();
  }
}

function advanceSeat() {
  while (game.activeSeat < game.seats.length && game.seats[game.activeSeat].finished) game.activeSeat++;
  if (game.activeSeat >= game.seats.length) {
    game.phase = "dealer";
    game.dealerTimer = .45;
  } else {
    game.phase = "player";
  }
}

function dealerStep() {
  if (!game.dealer[1].up) {
    game.dealer[1].up = true;
    game.dealerTimer = .55;
    sfx("flip");
    broadcast();
    return;
  }
  const live = game.seats.flatMap((s) => s.hands).some((h) => h.status !== "bust" && h.status !== "surrender");
  if (!live) return settleRound();
  const total = handTotal({ cards: game.dealer.filter((c) => c.up) });
  const soft = isSoft(game.dealer.filter((c) => c.up));
  if (total < 17 || (total === 17 && soft && game.enemy.hitsSoft17 !== false)) {
    game.dealer.push(drawCard(true, total, "dealer"));
    game.dealerTimer = .65;
    sfx("deal");
    broadcast();
  } else {
    settleRound();
  }
}

function settleRound() {
  game.dealer.forEach((c) => c.up = true);
  const dealerTotal = handTotal({ cards: game.dealer });
  const dealerBj = isBlackjackCards(game.dealer);
  let net = 0;
  let winHands = 0;
  const results = [];
  for (const seat of game.seats) {
    for (const h of seat.hands) {
      const result = settleHand(h, dealerTotal, dealerBj);
      net += result.net;
      if (result.net > 0) winHands++;
      results.push(`${seat.name}: ${result.msg}`);
    }
  }
  if (net > 0) {
    const bonus = relicSum("damageBonus");
    game.enemy.hp = Math.max(0, game.enemy.hp - net - bonus);
    const heal = relicSum("heal") * Math.max(1, winHands);
    if (heal) game.hp = Math.min(game.maxHp, game.hp + heal);
    sfx("win");
  } else if (net < 0) {
    const dmg = Math.min(game.hp, Math.max(1, Math.floor(Math.abs(net) / 4)));
    game.hp -= dmg;
    sfx("lose");
  } else {
    sfx("push");
  }
  game.roundNet = net;
  results.slice(0, 6).reverse().forEach(log);
  game.phase = game.hp <= 0 ? "defeat" : game.enemy.hp <= 0 && game.floor === enemyTemplates.length - 1 ? "victory" : "roundOver";
  broadcast();
}

function settleHand(h, dealerTotal, dealerBj) {
  const bjMult = has("bjPays2") ? 2 : (game.enemy.bjPays65 ? 1.2 : 1.5);
  const chipBonus = relicSum("chipBonus");
  const pushWins = has("pushWins");
  if (h.insurance) {
    if (dealerBj) game.gold += h.insurance * (has("insurance3") ? 4 : 3);
  }
  if (h.status === "surrender") {
    const refund = has("freeSurrender") ? h.bet : Math.floor(h.bet / 2);
    game.gold += refund;
    return { net: -(h.bet - refund), msg: has("freeSurrender") ? "Surrender refunded" : `Surrender -${h.bet - refund}g` };
  }
  if (isBust(h)) {
    const refund = Math.floor(h.bet * (relicSum("refund") + relicSum("bustRefund")));
    game.gold += refund;
    return { net: -(h.bet - refund), msg: `Bust -${h.bet - refund}g` };
  }
  if (isBlackjack(h)) {
    if (dealerBj) {
      if (pushWins) return winResult(h, Math.floor(h.bet * bjMult) + chipBonus, "BJ push wins");
      if (game.enemy.tiesLose) return { net: -h.bet, msg: "BJ tie loses" };
      game.gold += h.bet;
      return { net: 0, msg: "BJ push" };
    }
    return winResult(h, Math.floor(h.bet * bjMult) + chipBonus, "BLACKJACK");
  }
  if (dealerBj) return loseResult(h, "Dealer blackjack");
  if (has("fiveCard") && h.cards.length >= 5 && !isBust(h)) return winResult(h, h.bet + chipBonus, "5-Card Charlie");
  const total = handTotal(h);
  if (dealerTotal > 21) return winResult(h, h.bet + chipBonus, "Dealer bust");
  if (total > dealerTotal) return winResult(h, h.bet + chipBonus, `${total} beats ${dealerTotal}`);
  if (total < dealerTotal) return loseResult(h, `${total} loses to ${dealerTotal}`);
  if (pushWins) return winResult(h, h.bet + chipBonus, "Push wins");
  if (game.enemy.tiesLose) return { net: -h.bet, msg: "Tie loses" };
  game.gold += h.bet;
  return { net: 0, msg: `Push ${total}` };
}

function winResult(h, amount, msg) {
  game.gold += h.bet + amount;
  return { net: amount, msg: `${msg} +${amount}g` };
}

function loseResult(h, msg) {
  const refund = Math.floor(h.bet * relicSum("refund"));
  game.gold += refund;
  return { net: -(h.bet - refund), msg: `${msg} -${h.bet - refund}g` };
}

function continueAfterRound() {
  if (game.phase === "victory" || game.phase === "defeat") {
    appScene = "menu";
    return;
  }
  if (game.enemy.hp <= 0) {
    game.shop = chooseRelics();
    game.phase = "shop";
    log("The wandering merchant appears.");
  } else {
    resetRound();
  }
}

function buyRelic(index) {
  const relic = game.shop[index];
  if (!relic) return;
  const cost = 45 + game.floor * 15;
  if (game.gold < cost) return flashMsg("Not enough gold");
  game.gold -= cost;
  game.relics.push(relic);
  log(`Gained relic: ${relic.name}.`);
  nextBattle();
}

function nextBattle() {
  game.floor++;
  game.enemy = cloneEnemy(game.floor);
  resetRound();
}

function resetRound() {
  game.phase = "betting";
  game.dealer = [];
  game.seats.forEach((s) => {
    s.ready = false;
    s.hands = [];
    s.finished = false;
    s.active = 0;
    s.bet = clamp(s.bet, MIN_BET, Math.max(MIN_BET, Math.min(MAX_BET, game.gold)));
  });
}

function chooseRelics() {
  const owned = new Set(game.relics.map((r) => r.name));
  return shuffle(relicPool.filter((r) => !owned).map((r) => ({ ...r }))).slice(0, 3);
}

function handTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand.cards.filter((c) => c.up !== false)) {
    total += cardValue(c);
    if (c.rank === "A") aces++;
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return total;
}

function visibleTotal(cards) {
  return handTotal({ cards: cards.filter((c) => c.up) });
}

function bestTotal(cards, base = 0) {
  return handTotal({ cards: [{ rank: String(base), suit: "S", up: true }, ...cards] });
}

function isSoft(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === "A") aces++;
  }
  return aces > 0 && total <= 21;
}

function cardValue(c) {
  if (c.rank === "A") return 11;
  if (["K", "Q", "J"].includes(c.rank)) return 10;
  const n = Number(c.rank);
  return Number.isFinite(n) ? n : 0;
}

function isBlackjack(h) {
  return h.cards.length === 2 && handTotal(h) === 21 && !h.split;
}

function isBlackjackCards(cards) {
  return cards.length === 2 && handTotal({ cards: cards.map((c) => ({ ...c, up: true })) }) === 21;
}

function isBust(h) {
  return handTotal(h) > 21;
}

function activeHand(seat) {
  return seat?.hands?.[seat.active];
}

function has(prop) {
  return game.relics.some((r) => r[prop]);
}

function relicSum(prop) {
  return game.relics.reduce((sum, r) => sum + (Number(r[prop]) || 0), 0);
}

function log(text) {
  game.log.unshift(text);
  game.log = game.log.slice(0, 9);
}

async function hostLobby() {
  role = "host";
  localPlayerId = hostId;
  guestHelloSent = false;
  hostWelcomeSent = false;
  const code = createLobbyCode();
  newGame([{ id: hostId, name: "Host" }], code);
  peer = new HostPeer({
    code,
    onMessage: handleHostMessage,
    onStatus: handlePeerStatus
  });
  hostOffer.value = await peer.createInvite();
  showSignal("host", `Lobby ${code}`, "Send the invite to your friend, then paste their answer.");
  broadcast();
}

function joinLobby() {
  role = "guest";
  localPlayerId = guestId;
  guestHelloSent = false;
  appScene = "lobby";
  showSignal("join", "Join Lobby", "Paste a host invite. Send your generated answer back to the host.");
}

async function createAnswer() {
  try {
    peer = new GuestPeer({
      onMessage: handleGuestMessage,
      onStatus: handlePeerStatus
    });
    joinAnswer.value = await peer.createAnswer(joinOffer.value);
    flashMsg(`Answer created for lobby ${peer.code}`);
  } catch (err) {
    flashMsg(err.message);
  }
}

async function acceptAnswer() {
  try {
    await peer.acceptAnswer(guestAnswer.value);
    addGuestSeat();
    hideSignal();
    broadcast();
  } catch (err) {
    flashMsg(err.message);
  }
}

function handlePeerStatus(status) {
  if ((status === "connected" || status === "completed") && role === "guest" && !guestHelloSent) {
    guestHelloSent = true;
    peer?.send({ type: "hello", playerId: guestId });
  }
  if ((status === "connected" || status === "completed") && role === "host" && !hostWelcomeSent) {
    hostWelcomeSent = true;
    addGuestSeat();
    broadcast();
  }
}

function handleHostMessage(msg) {
  if (msg.type === "hello") {
    addGuestSeat();
    broadcast();
  }
  if (msg.type === "action") {
    applyAction(msg.playerId, msg.action);
    broadcast();
  }
}

function handleGuestMessage(msg) {
  if (msg.type === "state") {
    game = msg.state;
    appScene = "game";
    hideSignal();
  }
}

function broadcast() {
  if (role === "host") peer?.send({ type: "state", state: game });
}

function showSignal(kind, title, text) {
  signalPanel.hidden = false;
  hostFields.hidden = kind !== "host";
  joinFields.hidden = kind !== "join";
  signalTitle.textContent = title;
  signalText.textContent = text;
}

function hideSignal() {
  signalPanel.hidden = true;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    flashMsg("Copied");
  } catch {
    flashMsg("Select and copy manually");
  }
}

function startAudio() {
  if (!audio) {
    audio = new Audio("./assets/Velvet_Blackjack.ogg");
    audio.loop = true;
    audio.volume = .35;
  }
  if (!audioCtx) audioCtx = new AudioContext();
  if (!musicStarted) {
    audio.play().then(() => musicStarted = true).catch(() => {});
  }
}

function toggleMusic() {
  if (!audio) return;
  audio.muted = !audio.muted;
  flashMsg(audio.muted ? "Music muted" : "Music on");
}

function sfx(kind) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const freq = { deal: 440, flip: 560, win: 740, lose: 160, bust: 120, push: 300, shuffle: 220 }[kind] || 330;
  osc.type = kind === "lose" || kind === "bust" ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * .55), now + .12);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.14, now + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .18);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + .2);
}

function draw() {
  buttons = [];
  ctx.clearRect(0, 0, W, H);
  fill(C.bg, 0, 0, W, H);
  if (!game || appScene === "menu") return drawMenu();
  drawTable();
  if (game.phase === "shop") drawShop();
  if (game.phase === "victory" || game.phase === "defeat") drawEnd();
  if (flashTimer > 0) drawFlash();
}

function drawMenu() {
  text("DUNGEON", W / 2, 175, 72, C.gold, "center", "serif");
  text("of CARDS", W / 2, 250, 72, C.parchment, "center", "serif");
  text("A blackjack roguelike", W / 2, 312, 28, C.muted, "center");
  const lines = [
    "Win chips to damage dealer-monsters.",
    "Lose chips and the dungeon takes blood.",
    "Collect relics, bend the rules, beat the final boss."
  ];
  lines.forEach((line, i) => text(line, W / 2, 380 + i * 30, 22, C.text, "center"));
  addButton(W / 2 - 130, 495, 260, 56, "Single Player", () => {
    role = "solo";
    localPlayerId = hostId;
    newGame([{ id: hostId, name: "You" }]);
  }, true);
  addButton(W / 2 - 130, 568, 260, 56, "Host Game", hostLobby);
  addButton(W / 2 - 130, 641, 260, 56, "Join Game", joinLobby);
  text("H/S/D/P/R actions - Enter ready/continue - M music", W / 2, H - 34, 16, C.muted, "center");
}

function drawTable() {
  const felt = { x: 40, y: 40, w: 900, h: 720 };
  round(felt.x, felt.y, felt.w, felt.h, 18, C.felt);
  strokeRound(felt.x, felt.y, felt.w, felt.h, 18, C.felt2, 7);
  drawDeck(felt.x + felt.w - 125, felt.y + 50);
  drawDealer(felt);
  drawSeats(felt);
  drawSidePanel();
}

function drawDealer(felt) {
  text("Dealer", felt.x + 38, felt.y + 36, 18, C.muted);
  drawHand(game.dealer, felt.x + 330, felt.y + 56, false);
  const shown = game.dealer.some((c) => !c.up) ? `${visibleTotal(game.dealer)}+?` : handTotal({ cards: game.dealer });
  badge(felt.x + 440, felt.y + 205, game.dealer.length ? `Total ${shown}` : "Waiting", C.muted);
  const e = game.enemy;
  fill("#15101c", felt.x + 22, felt.y + 248, 850, 74, 12);
  fill(e.color, felt.x + 38, felt.y + 261, 48, 48, 24);
  text(e.icon, felt.x + 62, felt.y + 292, e.icon.length > 2 ? 14 : 22, C.black, "center", "serif");
  text(e.name, felt.x + 102, felt.y + 274, 22, C.gold);
  text(e.description, felt.x + 102, felt.y + 300, 15, C.muted);
  meter(felt.x + 620, felt.y + 277, 220, 13, e.hp / e.maxHp, C.red, C.gold);
  text(`${e.hp}/${e.maxHp}`, felt.x + 730, felt.y + 309, 14, C.text, "center");
}

function drawSeats(felt) {
  const active = game.seats[game.activeSeat];
  game.seats.forEach((seat, idx) => {
    const x = felt.x + 70 + (idx % 2) * 410;
    const y = felt.y + 365 + Math.floor(idx / 2) * 170;
    const isActive = game.phase === "player" && active?.id === seat.id;
    strokeRound(x - 18, y - 42, 370, 150, 12, isActive ? C.gold : "rgba(255,255,255,.12)", 2);
    text(`${seat.name}${seat.id === localPlayerId ? " (You)" : ""}`, x, y - 18, 18, isActive ? C.gold : C.text);
    text(seatStatus(seat), x + 330, y - 18, 15, C.muted, "right");
    if (seat.hands.length) {
      seat.hands.forEach((hand, hidx) => {
        drawHand(hand.cards, x + hidx * 136, y + 10, hidx === seat.active && isActive);
        badge(x + hidx * 136 + 45, y + 148, handLabel(hand), handColor(hand));
      });
    } else {
      drawChips(x + 38, y + 50, seat.bet);
      badge(x + 110, y + 70, `Bet ${seat.bet}g`, C.gold);
    }
  });
}

function drawSidePanel() {
  const x = 970;
  round(x, 40, 270, 720, 16, C.panel);
  text("Dungeon of Cards", x + 135, 75, 24, C.gold, "center", "serif");
  text(`Floor ${game.floor + 1}/${enemyTemplates.length}`, x + 22, 112, 18, C.text);
  text(`Gold ${game.gold}g`, x + 22, 140, 18, C.gold);
  meter(x + 22, 166, 226, 12, game.hp / game.maxHp, C.red, C.green);
  text(`HP ${game.hp}/${game.maxHp}`, x + 135, 196, 15, C.text, "center");
  if (game.code) badge(x + 135, 226, `Lobby ${game.code}`, C.gold);
  text(phaseTitle(), x + 135, 265, 22, C.text, "center");
  drawActionButtons(x + 22, 295);
  text("Relics", x + 22, 530, 18, C.gold);
  game.relics.slice(0, 6).forEach((r, i) => badge(x + 28 + (i % 3) * 74, 560 + Math.floor(i / 3) * 36, r.icon, C.gold));
  text("Log", x + 22, 635, 18, C.gold);
  game.log.slice(0, 4).forEach((line, i) => text(line, x + 22, 662 + i * 22, 13, C.muted));
}

function drawActionButtons(x, y) {
  if (game.phase === "betting") {
    addButton(x, y, 110, 42, "-5", () => action("betDown"));
    addButton(x + 118, y, 110, 42, "+5", () => action("betUp"));
    addButton(x, y + 50, 110, 42, "Min", () => action("minBet"));
    addButton(x + 118, y + 50, 110, 42, "Max", () => action("maxBet"));
    addButton(x, y + 102, 228, 48, mySeat()?.ready ? "Unready" : "Ready", () => action("ready"), true);
    return;
  }
  if (game.phase === "insurance") {
    addButton(x, y, 110, 46, "Insure", () => action("insuranceYes"), true);
    addButton(x + 118, y, 110, 46, "No", () => action("insuranceNo"));
    return;
  }
  if (game.phase === "player") {
    const mine = activeHand(mySeat());
    const myTurn = game.seats[game.activeSeat]?.id === localPlayerId;
    addButton(x, y, 110, 44, "Hit", () => action("hit"), true, myTurn);
    addButton(x + 118, y, 110, 44, "Stand", () => action("stand"), false, myTurn);
    addButton(x, y + 52, 110, 44, "Double", () => action("double"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noDouble && game.gold >= (mine?.bet || 0));
    addButton(x + 118, y + 52, 110, 44, "Split", () => action("split"), false, myTurn && canSplitLocal(mine));
    addButton(x, y + 104, 228, 44, "Surrender", () => action("surrender"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noSurrender);
    return;
  }
  if (["roundOver", "victory", "defeat"].includes(game.phase)) {
    addButton(x, y, 228, 50, game.phase === "roundOver" ? "Continue" : "Return", () => action("continue"), true);
  }
}

function drawShop() {
  fill("rgba(0,0,0,.72)", 0, 0, W, H);
  text("THE WANDERING MERCHANT", W / 2, 95, 42, C.gold, "center", "serif");
  text("Choose a relic, or descend with what you have.", W / 2, 145, 20, C.muted, "center");
  game.shop.forEach((r, i) => {
    const x = 190 + i * 305;
    const y = 230;
    round(x, y, 260, 300, 12, C.panel);
    strokeRound(x, y, 260, 300, 12, C.goldDim, 2);
    badge(x + 130, y + 60, r.icon, C.gold);
    text(r.name, x + 130, y + 115, 22, C.gold, "center");
    wrapText(r.description, x + 28, y + 150, 204, 18, C.text);
    addButton(x + 40, y + 230, 180, 46, `Buy ${45 + game.floor * 15}g`, () => action(`buy:${i}`), true, game.gold >= 45 + game.floor * 15);
  });
  addButton(W / 2 - 105, 590, 210, 50, "Skip Shop", () => action("skipShop"));
}

function drawEnd() {
  fill("rgba(0,0,0,.76)", 0, 0, W, H);
  const victory = game.phase === "victory";
  text(victory ? "VICTORY" : "DEFEAT", W / 2, 235, 68, victory ? C.gold : C.red, "center", "serif");
  text(victory ? "The dungeon folds its hand." : "The house collects.", W / 2, 305, 26, C.text, "center");
  text(`Final gold: ${game.gold}g`, W / 2, 365, 22, C.gold, "center");
  addButton(W / 2 - 115, 460, 230, 54, "Return to Menu", () => action("continue"), true);
}

function drawFlash() {
  const w = Math.min(520, ctx.measureText(flash).width + 50);
  fill("rgba(0,0,0,.72)", W / 2 - w / 2, 24, w, 42, 10);
  text(flash, W / 2, 52, 18, C.gold, "center");
}

function drawHand(cards, x, y, highlight) {
  cards.forEach((card, i) => drawCardFace(card, x + i * 62, y + Math.sin(i * .6) * 2, highlight && i === cards.length - 1));
}

function drawCardFace(card, x, y, highlight = false) {
  if (highlight) fill(C.gold, x - 5, y - 5, CARD_W + 10, CARD_H + 10, 12);
  if (card.up === false) {
    round(x, y, CARD_W, CARD_H, 9, "#321e46");
    round(x + 8, y + 8, CARD_W - 16, CARD_H - 16, 7, "#4b3269");
    strokeRound(x, y, CARD_W, CARD_H, 9, C.goldDim, 2);
    return;
  }
  round(x, y, CARD_W, CARD_H, 9, C.parchment);
  strokeRound(x, y, CARD_W, CARD_H, 9, "#3c3228", 2);
  const red = card.suit === "H" || card.suit === "D";
  const color = red ? "#aa2323" : "#191923";
  const suit = { S: "♠", H: "♥", D: "♦", C: "♣" }[card.suit];
  text(card.rank, x + 10, y + 28, card.rank === "10" ? 22 : 26, color, "left", "serif");
  text(suit, x + CARD_W / 2, y + 82, 52, color, "center", "serif");
  text(card.rank, x + CARD_W - 10, y + CARD_H - 10, card.rank === "10" ? 20 : 24, color, "right", "serif");
}

function drawDeck(x, y) {
  for (let i = 0; i < 5; i++) drawCardFace({ up: false }, x + i * 2, y - i * 2);
  text(`${game.deck.length}`, x + 45, y + 152, 15, C.muted, "center");
}

function drawChips(x, y, amount) {
  const denoms = [[500, "#d2af3c"], [100, "#242432"], [25, "#3c8c50"], [10, "#3c64b4"], [5, "#b43c3c"], [1, "#e6e6dc"]];
  let rest = amount;
  let n = 0;
  for (const [value, color] of denoms) {
    while (rest >= value && n < 12) {
      fill(color, x, y - n * 5, 40, 12, 8);
      strokeRound(x, y - n * 5, 40, 12, 8, "#f0d878", 1);
      rest -= value;
      n++;
    }
  }
}

function addButton(x, y, w, h, label, onClick, primary = false, enabled = true) {
  const b = { x, y, w, h, label, onClick, enabled };
  buttons.push(b);
  const hot = inRect(hover, b) && enabled;
  round(x, y, w, h, 8, enabled ? (primary ? "#dcb446" : hot ? "#342a45" : "#211a2c") : "#25232b");
  strokeRound(x, y, w, h, 8, enabled ? (primary ? "#f0d878" : C.goldDim) : "#47414f", 2);
  text(label, x + w / 2, y + h / 2 + 7, 17, primary ? C.black : enabled ? C.text : C.muted, "center");
}

function badge(x, y, label, color) {
  const width = Math.max(42, ctx.measureText(label).width + 24);
  fill("#100d14", x - width / 2, y - 16, width, 32, 14);
  strokeRound(x - width / 2, y - 16, width, 32, 14, color, 2);
  text(label, x, y + 6, 15, color, "center");
}

function meter(x, y, w, h, value, c1, c2) {
  fill("#0d0a10", x, y, w, h, h / 2);
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  fill(g, x, y, Math.max(0, Math.min(1, value)) * w, h, h / 2);
}

function phaseTitle() {
  return {
    betting: "Betting",
    insurance: "Insurance",
    player: game.seats[game.activeSeat]?.id === localPlayerId ? "Your Turn" : `${game.seats[game.activeSeat]?.name}'s Turn`,
    dealer: "Dealer Turn",
    roundOver: game.roundNet > 0 ? "Round Won" : game.roundNet < 0 ? "Round Lost" : "Push",
    shop: "Shop",
    victory: "Victory",
    defeat: "Defeat"
  }[game.phase] || game.phase;
}

function seatStatus(seat) {
  if (game.phase === "betting") return seat.ready ? "Ready" : `${seat.bet}g`;
  if (seat.spectating) return "Spectating";
  if (seat.finished) return "Done";
  return `${seat.bet}g`;
}

function handLabel(hand) {
  if (hand.status === "bust") return "Bust";
  if (hand.status === "surrender") return "Surrender";
  if (isBlackjack(hand)) return "Blackjack";
  return `Total ${handTotal(hand)}`;
}

function handColor(hand) {
  if (hand.status === "bust") return C.red;
  if (isBlackjack(hand)) return C.gold;
  return C.text;
}

function mySeat() {
  return game?.seats.find((s) => s.id === localPlayerId);
}

function canSplitLocal(hand) {
  return hand?.cards.length === 2 && cardValue(hand.cards[0]) === cardValue(hand.cards[1]) && game.gold >= hand.bet;
}

function flashMsg(msg) {
  flash = msg;
  flashTimer = 2.2;
}

function fill(color, x, y, w, h, r = 0) {
  ctx.fillStyle = color;
  pathRound(x, y, w, h, r);
  ctx.fill();
}

function round(x, y, w, h, r, color) {
  fill(color, x, y, w, h, r);
}

function strokeRound(x, y, w, h, r, color, line = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  pathRound(x, y, w, h, r);
  ctx.stroke();
}

function pathRound(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function text(str, x, y, size, color, align = "left", family = "sans-serif") {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(str), x, y);
}

function wrapText(str, x, y, width, lineHeight, color) {
  const words = str.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      text(line, x, cy, 16, color);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) text(line, x, cy, 16, color);
}

function eventPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * W / rect.width,
    y: (ev.clientY - rect.top) * H / rect.height
  };
}

function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
