import { GuestPeer, HostPeer, createLobbyCode, normalizeLobbyCode } from "./webrtc.js";

const W = 1280;
const H = 800;
const FPS = 60;
const MIN_BET = 1;
const MAX_BET = 500;
const CARD_W = 90;
const CARD_H = 130;
const MAX_PLAYERS = 4;
const hostId = "host";

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
const lobbyCodeInput = document.querySelector("#lobbyCode");
const toast = document.querySelector("#toast");
const viewport = { cssW: W, cssH: H, dpr: 1, scale: 1, x: 0, y: 0 };

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
let flash = "";
let flashTimer = 0;
let toastTimer = 0;
let lastRelicName = "";

let enemyTemplates = [];

const relicPool = [
  { name: "Lucky Coin", icon: "$", description: "Pushes count as wins.", pushWins: true },
  { name: "Double Crown", icon: "2x", description: "Blackjack pays 2:1.", bjPays2: true },
  { name: "White Flag", icon: "F", description: "Surrender refunds your full bet.", freeSurrender: true },
  { name: "Charlie's Hand", icon: "5", description: "5 cards without busting wins automatically.", fiveCard: true },
  { name: "Insurance Policy", icon: "+", description: "Insurance pays 3:1 instead of 2:1.", insurance3: true },
  { name: "Split Mastery", icon: "><", description: "Aces may be re-split freely.", extraSplit: true },
  { name: "Vampire's Bargain", icon: "V", description: "Heal 15 HP on every winning hand.", heal: 15 },
  { name: "Pawnbroker's Note", icon: "%", description: "Refund 25% of losing bets.", refund: .25 },
  { name: "Phoenix Feather", icon: "^", description: "Heal 30 HP on every winning hand.", heal: 30 },
  { name: "Merchant's Ledger", icon: "L", description: "Refund an additional 40% of losing bets.", refund: .4 },
  { name: "Executioner's Mark", icon: "X", description: "Deal +20 bonus damage on winning rounds.", damageBonus: 20 },
  { name: "Dragon's Tooth", icon: "T", description: "Deal +40 bonus damage on winning rounds.", damageBonus: 40 },
  { name: "Gambler's Tip", icon: "G", description: "Each winning hand pays +10 gold.", chipBonus: 10 },
  { name: "Golden Tongue", icon: "$$", description: "Each winning hand pays +25 gold.", chipBonus: 25 },
  { name: "Featherfall Charm", icon: "~", description: "When you bust, refund 50% of that bet.", bustRefund: .5 },
  { name: "Quicksilver Glove", icon: "Q", description: "5-card Charlie wins, and pushes count as wins.", fiveCard: true, pushWins: true },
  { name: "Heart of the Deck", icon: "H", description: "Heal 10 HP on win and deal +10 bonus damage.", heal: 10, damageBonus: 10 },
  { name: "Usurer's Seal", icon: "U", description: "Each winning hand pays +15g; refund 15% of losses.", chipBonus: 15, refund: .15 },
  { name: "Tinker's Thimble", icon: "o", description: "Each winning hand pays +5 gold.", chipBonus: 5 },
  { name: "Bone Talisman", icon: "b", description: "Heal 8 HP on every winning hand.", heal: 8 },
  { name: "Apprentice's Coin", icon: "a", description: "Refund 15% of losing bets.", refund: .15 },
  { name: "Iron Filing", icon: "i", description: "Deal +10 bonus damage on winning rounds.", damageBonus: 10 },
  { name: "Magistrate's Writ", icon: "W", description: "Surrender refunds your full bet, and insurance pays 3:1.", freeSurrender: true, insurance3: true },
  { name: "Duelist's Sigil", icon: "D", description: "Each winning hand pays +10g and deals +15 bonus damage.", chipBonus: 10, damageBonus: 15 },
  { name: "Auditor's Quill", icon: "q", description: "Heal 12 HP on win; refund 20% of losing bets.", heal: 12, refund: .2 },
  { name: "Bone-Hand Charm", icon: "h", description: "When you bust, refund 75% of that bet.", bustRefund: .75 },
  { name: "Notary's Crown", icon: "N", description: "Blackjack pays 2:1, and pushes count as wins.", bjPays2: true, pushWins: true },
  { name: "Croesus' Purse", icon: "C", description: "Each winning hand pays +40 gold.", chipBonus: 40 },
  { name: "Crown of Ten Kings", icon: "K", description: "Surrender refunds full bet, insurance pays 3:1, and pushes count as wins.", freeSurrender: true, insurance3: true, pushWins: true },
  { name: "Soulforged Fang", icon: "S", description: "Heal 20 HP on win and deal +25 bonus damage.", heal: 20, damageBonus: 25 },
  { name: "Sovereign's Chalice", icon: "Y", description: "Blackjack pays 2:1, and 5-card Charlie wins.", bjPays2: true, fiveCard: true },
  { name: "Rabbit's Foot", icon: "*", description: "+15 Luck. Cards more often land near 21.", luck: 15 },
  { name: "Four-Leaf Clover", icon: "%c", description: "+25 Luck. The shoe favors you.", luck: 25 },
  { name: "Dice of the Damned", icon: "d", description: "+40 Luck. The bold roll twice.", luck: 40 },
  { name: "Coin of the Fates", icon: "F", description: "+10 Luck and pushes count as wins.", luck: 10, pushWins: true },
  { name: "Dealer's Bane", icon: "Z", description: "+50 damage on wins and +20 gold per winning hand.", damageBonus: 50, chipBonus: 20 },
  { name: "Sepulcher Key", icon: "E", description: "Refund 30% of losses; refund 50% when you bust.", refund: .3, bustRefund: .5 },
  { name: "Cracked Scrying Lens", icon: "?", description: "Once per run: peek the next card pulled.", foresightUses: 1 }
];

function buildCampaign() {
  const campaign = [enemy("Apprentice Croupier", "Floor 1 - Dealer-in-training", 80, C.blue, "C", "Standard rules. A gentle introduction.", { hitsSoft17: false })];
  const tiers = [
    [
      enemy("Tavern Cardsharp", "Sticky fingers", 0, C.green, "S", "Hits soft 17. Otherwise plays it straight."),
      enemy("Hooded Stranger", "Plays them close to the chest", 0, "#9682b4", "?", "No hole-card peek. Doubles and splits risk the full bet vs. dealer BJ.", { dealerPeek: false }),
      enemy("Vampire Dealer", "Ties belong to the night", 0, C.red, "V", "Pushes count as dealer wins. Watch your throat.", { tiesLose: true }),
      enemy("Toll Collector", "Every card has a price", 0, "#bea05a", "$", "Each hit costs 5 gold. Stand often or bleed dry.", { hitFee: 5 }),
      enemy("Court Jester", "Foolish play, foolish loss", 0, "#dc82c8", "J", "Hits soft 17. Insurance forbidden.", { noInsurance: true }),
      enemy("Coin-Eater", "Eats every coin you toss", 0, "#aa8c3c", "c", "Surrender forbidden. Each hit costs 3 gold.", { noSurrender: true, hitFee: 3 }),
      enemy("Tin Pit Boss", "Cheap chips, cheaper payouts", 0, "#a0aab4", "t", "Blackjack pays only 6:5. Otherwise standard.", { bjPays65: true }),
      enemy("Graveyard Shift Dealer", "Dawn never comes", 0, "#828caa", "z", "Pushes count as dealer wins. No peek.", { tiesLose: true, dealerPeek: false }),
      enemy("Wandering Tinker", "Pay the tinker, take the card", 0, "#b4b482", "w", "Each hit costs 4 gold. Hits soft 17.", { hitFee: 4 })
    ],
    [
      enemy("Iron Bookkeeper", "No mercy, no surrender", 0, "#b4b4c8", "D", "Surrender forbidden. Insurance forbidden.", { noSurrender: true, noInsurance: true }),
      enemy("Crooked Sheriff", "No deals, no doubles", 0, "#c86450", "*", "Doubling down is forbidden at this table.", { noDouble: true }),
      enemy("Cursed Magistrate", "Justice pays poorly", 0, C.purple, "LAW", "Blackjack pays only 6:5.", { bjPays65: true }),
      enemy("Plague Doctor", "No cure for a hard 16", 0, "#6ea082", "+", "No peek. No surrender. Dealer hits soft 17.", { dealerPeek: false, noSurrender: true }),
      enemy("Whispering Auditor", "The ledger always balances", 0, "#aaaadc", "%", "Hits soft 17. Each hit costs 10 gold. Pushes lose.", { tiesLose: true, hitFee: 10 }),
      enemy("Greedy Notary", "Every signature costs you", 0, "#b4965a", "&", "6:5 blackjack. Pushes lose. Hits soft 17.", { bjPays65: true, tiesLose: true }),
      enemy("Veiled Magician", "The trick is on you", 0, C.purple, "~", "No peek. Doubling forbidden. Sleight of hand.", { dealerPeek: false, noDouble: true, luck: 15 }),
      enemy("Silent Executor", "The verdict is already written", 0, "#5a646e", "X", "Hits soft 17. Surrender forbidden. Insurance forbidden.", { noSurrender: true, noInsurance: true }),
      enemy("Pawnshop Tyrant", "Every chip changes hands twice", 0, "#a08246", "p", "Each hit costs 8 gold. Blackjack pays 6:5.", { bjPays65: true, hitFee: 8 }),
      enemy("Mirror Twin", "Two hands, never yours", 0, "#bec8dc", "m", "Doubling forbidden. Pushes count as dealer wins.", { tiesLose: true, noDouble: true })
    ],
    [
      enemy("Warden of Spades", "Forged in iron, dealt in spades", 0, "#7882a0", "S", "No surrender, no insurance, no peek. Pushes lose.", { noSurrender: true, noInsurance: true, dealerPeek: false, tiesLose: true }),
      enemy("Lich Banker", "The house always wins", 0, "#78c8dc", "LICH", "Hits soft 17. Pushes lose. 6:5 blackjack.", { tiesLose: true, bjPays65: true }),
      enemy("Gilded Inquisitor", "Confess your winnings", 0, "#dcaa5a", "!", "6:5 blackjack. Doubling forbidden. Insurance forbidden.", { bjPays65: true, noInsurance: true, noDouble: true }),
      enemy("Twin Croupiers", "Two hands, one verdict", 0, "#c85ac8", "2x", "Each hit costs 15 gold. No surrender. Pushes lose.", { tiesLose: true, noSurrender: true, hitFee: 15 }),
      enemy("Obsidian Marquis", "Carved from cold ambition", 0, "#464664", "M", "6:5 blackjack. Doubling forbidden. Pushes lose.", { bjPays65: true, tiesLose: true, noDouble: true }),
      enemy("Hollow Sovereign", "Crowned in chips, hollow within", 0, "#b4c8c8", "K", "Each hit costs 20 gold. Hits soft 17. No insurance.", { noInsurance: true, hitFee: 20 }),
      enemy("Black Deck Marshal", "No appeal, no escape", 0, "#50505a", "B", "Hits soft 17. No surrender. No insurance. No peek.", { noSurrender: true, noInsurance: true, dealerPeek: false }),
      enemy("Carrion Auctioneer", "Selling your remains by the gram", 0, "#8c646e", "A", "6:5 blackjack. Each hit costs 12 gold. Doubling forbidden.", { bjPays65: true, hitFee: 12, noDouble: true }),
      enemy("Last Light Oracle", "Reads your hand before you do", 0, "#c8b4e6", "O", "Hits soft 17. No peek. Pushes lose. Reads the deck.", { dealerPeek: false, tiesLose: true, luck: 25 })
    ]
  ];
  let floor = 2;
  for (const [index, pool] of tiers.entries()) {
    const slots = index === 2 ? 2 : 3;
    for (const pick of shuffle(pool.map((e) => ({ ...e }))).slice(0, slots)) {
      pick.hp = calibratedHp(floor);
      pick.title = `Floor ${floor} - ${pick.title}`;
      campaign.push(pick);
      floor++;
    }
  }
  campaign.push(enemy("The Dealer Eternal", "FINAL - Architect of the dungeon", 500, C.gold, "BOSS", "Every house rule against you. The deck itself answers to them.", { tiesLose: true, bjPays65: true, noSurrender: true, noInsurance: true, luck: 35 }));
  return campaign;
}

function enemy(name, title, hp, color, icon, description, rules = {}) {
  return { name, title, hp, color, icon, description, dealerPeek: true, hitsSoft17: true, ...rules };
}

function calibratedHp(floor) {
  if (floor === 1) return 80;
  if (floor === 10) return 500;
  return 130 + (floor - 2) * 44;
}

document.querySelector("#closeSignal").addEventListener("click", () => hideSignal());
document.querySelector("#copyOffer").addEventListener("click", () => copy(hostOffer.value));
document.querySelector("#shareOffer").addEventListener("click", () => shareSignal("Join my Dungeon of Cards lobby", hostOffer.value));
document.querySelector("#joinByCode").addEventListener("click", connectGuest);

window.addEventListener("resize", () => {
  resizeCanvas();
  draw();
});
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
  if (key === "f") action("peek");
  if (key === "enter") action(game?.phase === "betting" ? "ready" : "continue");
  if (key === "m") toggleMusic();
});

requestAnimationFrame(tick);
joinFromSharedLink();
resizeCanvas();

function tick(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (flashTimer > 0) flashTimer -= dt;
  if (game?.peekTimer > 0) {
    game.peekTimer -= dt;
    if (game.peekTimer <= 0) {
      game.peekTimer = 0;
      game.peekCard = null;
    }
  }
  if (game?.phase === "dealer" && role !== "guest") {
    game.dealerTimer -= dt;
    if (game.dealerTimer <= 0) dealerStep();
  }
  draw();
  requestAnimationFrame(tick);
}

function newGame(players, code = "") {
  enemyTemplates = buildCampaign();
  lastRelicName = "";
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
    offeredRelicNames: [],
    foresightUsesLeft: 0,
    peekCard: null,
    peekTimer: 0,
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

function addPlayerSeat(id, name = "") {
  if (!game) return false;
  if (game.seats.some((s) => s.id === id)) return true;
  if (game.seats.length >= MAX_PLAYERS) return false;
  const playerName = name || `Guest ${game.seats.length}`;
  game.seats.push({ id, name: playerName, bet: 25, ready: false, hands: [], active: 0, finished: false, spectating: false });
  game.gold += 100;
  game.maxHp += 40;
  game.hp += 40;
  log(`${playerName} joined the table.`);
  return true;
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
  if (name === "peek") peekNextCard(seatIndex);
}

function dealRound() {
  const totalBets = game.seats.reduce((sum, s) => sum + s.bet, 0);
  if (game.gold < totalBets || totalBets <= 0) return;
  game.gold -= totalBets;
  if ((game.enemy.hitFee || 0) > game.gold) {
    game.hp = 0;
    game.phase = "defeat";
    log("You cannot pay the table toll. The house wins.");
    sfx("lose");
    broadcast();
    return;
  }
  game.activeSeat = 0;
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
    s.finished = seatDone(s);
  }
  advanceSeat();
}

function hit(seatIndex) {
  const seat = game.seats[seatIndex];
  const hand = activeHand(seat);
  const fee = game.enemy.hitFee || 0;
  if (fee) {
    if (game.gold < fee) {
      game.hp = 0;
      game.phase = "defeat";
      log("You cannot pay the hit toll. The house wins.");
      sfx("lose");
      broadcast();
      return;
    }
    game.gold -= fee;
  }
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

function peekNextCard(seatIndex) {
  if (seatIndex !== game.activeSeat || game.foresightUsesLeft <= 0) return;
  const next = game.deck[game.deck.length - 1];
  if (!next) return;
  game.foresightUsesLeft--;
  game.peekCard = { ...next, up: true };
  game.peekTimer = 4;
  log(`Peek: next card is ${next.rank}${next.suit}.`);
  sfx("flip");
  broadcast();
}

function advanceHand() {
  const seat = game.seats[game.activeSeat];
  seat.active++;
  advancePastDoneHands();
}

function advancePastDoneHands() {
  const seat = game.seats[game.activeSeat];
  seekActiveHand(seat);
  if (!seat || seatDone(seat)) {
    if (seat) seat.finished = true;
    game.activeSeat++;
    advanceSeat();
  }
}

function advanceSeat() {
  while (game.activeSeat < game.seats.length && seatDone(game.seats[game.activeSeat])) {
    game.seats[game.activeSeat].finished = true;
    game.activeSeat++;
  }
  if (game.activeSeat >= game.seats.length) {
    game.phase = "dealer";
    game.dealerTimer = .45;
  } else {
    seekActiveHand(game.seats[game.activeSeat]);
    game.phase = "player";
  }
}

function seekActiveHand(seat) {
  if (!seat) return;
  while (seat.active < seat.hands.length && seat.hands[seat.active].status !== "playing") {
    seat.active++;
  }
}

function seatDone(seat) {
  return !seat || seat.spectating || seat.hands.length === 0 || seat.hands.every((h) => h.status !== "playing");
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
  let grossLoss = 0;
  const results = [];
  for (const seat of game.seats) {
    for (const h of seat.hands) {
      const result = settleHand(h, dealerTotal, dealerBj);
      net += result.net;
      grossLoss += result.grossLoss || 0;
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
  } else if (grossLoss > 0) {
    const dmg = Math.min(game.hp, Math.max(1, Math.floor(grossLoss / 4)));
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
  const cappedRefund = (amount) => Math.max(0, Math.min(amount, h.bet - 1));
  if (h.insurance) {
    if (dealerBj) game.gold += h.insurance * (has("insurance3") ? 4 : 3);
  }
  if (h.status === "surrender") {
    const refund = has("freeSurrender") ? h.bet : Math.floor(h.bet / 2);
    game.gold += refund;
    return { net: -(h.bet - refund), grossLoss: has("freeSurrender") ? 0 : Math.floor(h.bet / 2), msg: has("freeSurrender") ? "Surrender refunded" : `Surrender -${h.bet - refund}g` };
  }
  if (isBust(h)) {
    const refund = cappedRefund(Math.floor(h.bet * (relicSum("refund") + relicSum("bustRefund"))));
    game.gold += refund;
    return { net: -(h.bet - refund), grossLoss: h.bet, msg: `Bust -${h.bet - refund}g` };
  }
  if (isBlackjack(h)) {
    if (dealerBj) {
      if (pushWins) return winResult(h, Math.floor(h.bet * bjMult) + chipBonus, "BJ push wins");
      if (game.enemy.tiesLose) return { net: -h.bet, grossLoss: h.bet, msg: "BJ tie loses" };
      game.gold += h.bet;
      return { net: 0, grossLoss: 0, msg: "BJ push" };
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
  if (game.enemy.tiesLose) return { net: -h.bet, grossLoss: h.bet, msg: "Tie loses" };
  game.gold += h.bet;
  return { net: 0, grossLoss: 0, msg: `Push ${total}` };
}

function winResult(h, amount, msg) {
  game.gold += h.bet + amount;
  return { net: amount, grossLoss: 0, msg: `${msg} +${amount}g` };
}

function loseResult(h, msg) {
  const refund = Math.max(0, Math.min(Math.floor(h.bet * relicSum("refund")), h.bet - 1));
  game.gold += refund;
  return { net: -(h.bet - refund), grossLoss: h.bet, msg: `${msg} -${h.bet - refund}g` };
}

function continueAfterRound() {
  if (game.phase === "victory" || game.phase === "defeat") {
    appScene = "menu";
    return;
  }
  if (game.enemy.hp <= 0) {
    game.shop = chooseRelics();
    ensureShopRelics();
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
  game.foresightUsesLeft += relic.foresightUses || 0;
  lastRelicName = relic.name;
  notify(`${relic.name}: ${relic.description}`);
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
  const offered = new Set(game.offeredRelicNames || []);
  let pool = relicPool.filter((r) => !owned.has(r.name) && !offered.has(r.name));
  if (!pool.length) pool = relicPool.filter((r) => !owned.has(r.name));
  const picks = shuffle(pool.map((r) => ({ ...r }))).slice(0, 3);
  game.offeredRelicNames = [...new Set([...(game.offeredRelicNames || []), ...picks.map((r) => r.name)])];
  return picks;
}

function ensureShopRelics() {
  if (game.phase === "shop" && (!Array.isArray(game.shop) || game.shop.length === 0)) {
    game.shop = chooseRelics();
  }
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
  const code = createLobbyCode();
  newGame([{ id: hostId, name: "Host" }], code);
  hostOffer.value = "Creating lobby link...";
  showSignal("host", `Lobby ${code}`, "Share this link. Up to 3 guests can join from it.");
  peer = new HostPeer({
    code,
    onMessage: handleHostMessage,
    onStatus: handlePeerStatus,
    onConnection: handleHostConnection
  });
  try {
    hostOffer.value = await peer.createInvite();
    signalText.textContent = "Share this link. Up to 3 guests can join from it.";
    notify("Lobby link ready.");
  } catch (err) {
    notify(err.message);
  }
  broadcast();
}

function joinLobby(code = "") {
  role = "guest";
  localPlayerId = "";
  appScene = "lobby";
  lobbyCodeInput.value = code;
  showSignal("join", "Join Lobby", "Paste a lobby link or enter the 8-character code.");
  if (code) connectGuest();
}

async function connectGuest() {
  try {
    const code = normalizeLobbyCode(lobbyCodeInput.value);
    if (!code) throw new Error("Enter a lobby code or shared link.");
    lobbyCodeInput.value = code;
    signalText.textContent = `Connecting to lobby ${code}...`;
    peer = new GuestPeer({
      code,
      onMessage: handleGuestMessage,
      onStatus: handlePeerStatus
    });
    localPlayerId = await peer.connect();
    peer.send({ type: "hello", playerId: localPlayerId, name: "Guest" });
    notify("Connected. Waiting for host state...");
  } catch (err) {
    notify(err.message);
  }
}

function handlePeerStatus(status, details = {}) {
  if (status === "connected" && role === "guest") {
    signalText.textContent = "Connected. Waiting for the host to seat you...";
  }
  if (status === "connected" && role === "host" && details.playerId) {
    notify("Guest connected.");
  }
  if (status === "error") {
    notify(details?.message || "Lobby connection failed.");
  }
}

function handleHostConnection(playerId) {
  if (!game || game.seats.length >= MAX_PLAYERS) {
    peer?.send({ type: "lobbyFull" }, playerId);
    peer?.disconnect(playerId);
  }
}

function handleHostMessage(msg, fromId = "") {
  if (msg.type === "hello") {
    const id = msg.playerId || fromId;
    if (!addPlayerSeat(id, guestNameFor(id))) {
      peer?.send({ type: "lobbyFull" }, id);
      peer?.disconnect(id);
      return;
    }
    peer?.send({ type: "welcome", playerId: id }, id);
    broadcast();
  }
  if (msg.type === "action") {
    applyAction(msg.playerId, msg.action);
    broadcast();
  }
}

function handleGuestMessage(msg) {
  if (msg.type === "welcome" && msg.playerId) {
    localPlayerId = msg.playerId;
  }
  if (msg.type === "lobbyFull") {
    notify("That lobby is full.");
  }
  if (msg.type === "state") {
    game = msg.state;
    appScene = "game";
    hideSignal();
    notify("Joined the table.");
  }
}

function broadcast() {
  if (role === "host") peer?.send({ type: "state", state: game });
}

function guestNameFor(id) {
  const guestNumber = Math.min(MAX_PLAYERS - 1, game.seats.filter((s) => s.id !== hostId).length + 1);
  return `Guest ${guestNumber}`;
}

function joinFromSharedLink() {
  const code = normalizeLobbyCode(new URLSearchParams(location.search).get("lobby") || "");
  if (code) {
    setTimeout(() => joinLobby(code), 100);
  }
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
    notify("Copied");
  } catch {
    notify("Select and copy manually");
  }
}

async function shareSignal(title, text) {
  if (!text.trim()) {
    notify("Nothing to share yet.");
    return;
  }
  const payload = /^https?:\/\//i.test(text) ? { title, text, url: text } : { title, text };
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
      await navigator.share(payload);
      notify("Share sheet opened.");
      return;
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
  }
  await copy(text);
  notify("Sharing is not available here, so the text was copied.");
}

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
  flashMsg(message);
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
  resizeCanvas();
  buttons = [];
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.cssW, viewport.cssH);
  fill(C.bg, 0, 0, viewport.cssW, viewport.cssH);
  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.scale, viewport.scale);
  fill(C.bg, 0, 0, W, H);
  if (!game || appScene === "menu") {
    drawMenu();
  } else {
    drawTable();
    if (game.phase === "shop") drawShop();
    if (game.phase === "victory" || game.phase === "defeat") drawEnd();
    if (game.peekCard) drawPeekOverlay();
  }
  if (flashTimer > 0) drawFlash();
  ctx.restore();
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
  drawRelicPanel(x + 22, 500, 226);
  text("Log", x + 22, 668, 18, C.gold);
  game.log.slice(0, 3).forEach((line, i) => text(line, x + 22, 694 + i * 22, 13, C.muted));
}

function drawRelicPanel(x, y, w) {
  text("Relics", x, y, 18, C.gold);
  if (!game.relics.length) {
    text("None yet", x, y + 28, 14, C.muted);
    return;
  }
  const newest = game.relics.find((r) => r.name === lastRelicName);
  const shown = newest
    ? [newest, ...game.relics.filter((r) => r.name !== newest.name)]
    : game.relics;
  shown.slice(0, 2).forEach((r, i) => drawRelicRow(r, x, y + 28 + i * 62, w, r.name === lastRelicName));
  if (game.relics.length > 2) {
    text(`+${game.relics.length - 2} more`, x, y + 154, 13, C.muted);
  }
}

function drawRelicRow(relic, x, y, w, highlight = false) {
  round(x, y - 14, w, 54, 8, highlight ? "#2f263c" : "#17121e");
  strokeRound(x, y - 14, w, 54, 8, highlight ? C.gold : "rgba(238,231,215,.12)", 1);
  badge(x + 22, y + 12, relic.icon, C.gold);
  text(relic.name, x + 50, y + 4, 14, C.gold);
  wrapTextSized(relic.description, x + 50, y + 24, w - 58, 14, 12, C.muted, 2);
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
    if (game.foresightUsesLeft > 0) {
      addButton(x, y + 156, 228, 44, `Peek (${game.foresightUsesLeft})`, () => action("peek"), true, myTurn);
    }
    return;
  }
  if (["roundOver", "victory", "defeat"].includes(game.phase)) {
    addButton(x, y, 228, 50, game.phase === "roundOver" ? "Continue" : "Return", () => action("continue"), true);
  }
}

function drawShop() {
  ensureShopRelics();
  fill("rgba(0,0,0,.72)", 0, 0, W, H);
  text("THE WANDERING MERCHANT", W / 2, 95, 42, C.gold, "center", "serif");
  text("Choose a relic, or descend with what you have.", W / 2, 145, 20, C.muted, "center");
  game.shop.slice(0, 3).forEach((r, i) => drawShopRelicCard(r, i, 175 + i * 315, 205));
  addButton(W / 2 - 105, 590, 210, 50, "Skip Shop", () => action("skipShop"));
}

function drawShopRelicCard(relic, index, x, y) {
  const cost = 45 + game.floor * 15;
  const canBuy = game.gold >= cost;
  round(x, y, 280, 320, 12, "#211a2c");
  strokeRound(x, y, 280, 320, 12, canBuy ? C.gold : C.goldDim, 3);
  fill("#120e16", x + 20, y + 20, 64, 64, 14);
  strokeRound(x + 20, y + 20, 64, 64, 14, C.goldDim, 2);
  text(relic.icon, x + 52, y + 62, relic.icon.length > 1 ? 19 : 28, C.gold, "center", "serif");
  text(relic.name, x + 100, y + 45, 20, C.gold);
  wrapTextSized(relic.description, x + 100, y + 72, 150, 17, 14, C.text, 3);
  fill("#17121e", x + 24, y + 112, 232, 116, 10);
  strokeRound(x + 24, y + 112, 232, 116, 10, "rgba(238,231,215,.12)", 1);
  wrapTextSized(relic.description, x + 42, y + 144, 196, 20, 16, C.text, 4);
  addButton(x + 40, y + 250, 200, 50, `Buy ${cost}g`, () => action(`buy:${index}`), true, canBuy);
}

function drawPeekOverlay() {
  const alpha = Math.min(1, game.peekTimer / .6, (4 - game.peekTimer) / .35);
  ctx.save();
  ctx.globalAlpha = Math.max(.2, alpha);
  fill("rgba(0,0,0,.58)", 0, 0, W, H);
  text("NEXT CARD", W / 2, 215, 34, "#9ee8ff", "center", "serif");
  drawCardFace(game.peekCard, W / 2 - CARD_W / 2, 250, true);
  ctx.restore();
}

function drawEnd() {
  fill("rgba(0,0,0,.76)", 0, 0, W, H);
  const victory = game.phase === "victory";
  text(victory ? "VICTORY" : "DEFEAT", W / 2, 235, 68, victory ? C.gold : C.red, "center", "serif");
  text(victory ? "The dungeon folds its hand." : "The house collects.", W / 2, 305, 26, C.text, "center");
  text(`Final gold: ${game.gold}g`, W / 2, 365, 22, C.gold, "center");
  const relicText = game.relics.length ? game.relics.map((r) => r.name).join(", ") : "None";
  text("Relics:", W / 2, 420, 20, C.gold, "center");
  const lines = wrapLines(relicText, 820, 16);
  lines.forEach((line, i) => text(line, W / 2, 448 + i * 22, 16, C.text, "center"));
  addButton(W / 2 - 115, Math.min(700, 490 + lines.length * 22), 230, 54, "Return to Menu", () => action("continue"), true);
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
    ctx.fillStyle = "#6e508c";
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 6; row++) {
        const cx = x + 18 + col * 18;
        const cy = y + 18 + row * 18;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx + 6, cy);
        ctx.lineTo(cx, cy + 6);
        ctx.lineTo(cx - 6, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
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

drawCardFace = function drawCardFace(card, x, y, highlight = false) {
  if (highlight) fill(C.gold, x - 5, y - 5, CARD_W + 10, CARD_H + 10, 12);
  if (card.up === false) {
    round(x, y, CARD_W, CARD_H, 9, "#321e46");
    round(x + 8, y + 8, CARD_W - 16, CARD_H - 16, 7, "#4b3269");
    ctx.fillStyle = "#6e508c";
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 6; row++) {
        const cx = x + 18 + col * 18;
        const cy = y + 18 + row * 18;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx + 6, cy);
        ctx.lineTo(cx, cy + 6);
        ctx.lineTo(cx - 6, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
    strokeRound(x, y, CARD_W, CARD_H, 9, C.goldDim, 2);
    return;
  }
  round(x, y, CARD_W, CARD_H, 9, C.parchment);
  strokeRound(x, y, CARD_W, CARD_H, 9, "#3c3228", 2);
  const red = card.suit === "H" || card.suit === "D";
  const color = red ? "#aa2323" : "#191923";
  const suit = { S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663" }[card.suit];
  text(card.rank, x + 8, y + 28, card.rank === "10" ? 22 : 26, color, "left", "serif");
  text(suit, x + 8 + (card.rank === "10" ? 13 : 10), y + 49, 18, color, "center", "serif");
  text(suit, x + CARD_W / 2, y + CARD_H / 2 + 22, 54, color, "center", "serif");
  ctx.save();
  ctx.translate(x + CARD_W - 8, y + CARD_H - 8);
  ctx.rotate(Math.PI);
  text(card.rank, 0, 0, card.rank === "10" ? 20 : 24, color, "left", "serif");
  text(suit, card.rank === "10" ? 13 : 10, 21, 16, color, "center", "serif");
  ctx.restore();
};

drawChips = function drawChips(x, y, amount) {
  const denoms = [[500, "#d2af3c"], [100, "#242432"], [25, "#3c8c50"], [10, "#3c64b4"], [5, "#b43c3c"], [1, "#e6e6dc"]];
  let rest = amount;
  let n = 0;
  if (amount <= 0) {
    ctx.strokeStyle = "rgba(238,231,215,.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x + 20, y + 6, 20, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  for (const [value, color] of denoms) {
    while (rest >= value && n < 12) {
      const cy = y + 6 - n * 5;
      ctx.fillStyle = shade(color, -55);
      ctx.fillRect(x, cy, 40, 7);
      ctx.strokeStyle = "#0a0a0f";
      ctx.beginPath();
      ctx.moveTo(x, cy + 7);
      ctx.lineTo(x + 40, cy + 7);
      ctx.stroke();
      drawChipTop(x + 20, cy, color, "#f0d878");
      rest -= value;
      n++;
    }
  }
};

function drawChipTop(cx, cy, face, stripe) {
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0a0a0f";
  ctx.stroke();
  ctx.fillStyle = stripe;
  ctx.fillRect(cx - 19, cy - 2, 8, 4);
  ctx.fillRect(cx + 11, cy - 2, 8, 4);
  ctx.beginPath();
  ctx.ellipse(cx, cy, 10, 3.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.stroke();
}

function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amount, 0, 255);
  const g = clamp(((n >> 8) & 255) + amount, 0, 255);
  const b = clamp((n & 255) + amount, 0, 255);
  return `rgb(${r},${g},${b})`;
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

function wrapTextSized(str, x, y, width, lineHeight, size, color, maxLines = Infinity) {
  const words = str.split(" ");
  let line = "";
  let cy = y;
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    ctx.font = `700 ${size}px sans-serif`;
    if (ctx.measureText(test).width > width && line) {
      lines++;
      if (lines >= maxLines) {
        text(`${line.replace(/\.*$/, "")}...`, x, cy, size, color);
        return;
      }
      text(line, x, cy, size, color);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) text(line, x, cy, size, color);
}

function wrapLines(str, width, size) {
  const words = str.split(" ");
  const lines = [];
  let line = "";
  ctx.font = `700 ${size}px sans-serif`;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function eventPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  const cssX = ev.clientX - rect.left;
  const cssY = ev.clientY - rect.top;
  return {
    x: (cssX - viewport.x) / viewport.scale,
    y: (cssY - viewport.y) / viewport.scale
  };
}

function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const pixelW = Math.round(cssW * dpr);
  const pixelH = Math.round(cssH * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  viewport.cssW = cssW;
  viewport.cssH = cssH;
  viewport.dpr = dpr;
  viewport.scale = Math.min(cssW / W, cssH / H);
  viewport.x = Math.round((cssW - W * viewport.scale) / 2);
  viewport.y = Math.round((cssH - H * viewport.scale) / 2);
}
