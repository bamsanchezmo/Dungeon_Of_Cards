import { GuestPeer, HostPeer, createLobbyCode, normalizeLobbyCode } from "./webrtc.js";

const W = 1280;
const H = 800;
const PORTRAIT_W = 760;
const PORTRAIT_MIN_H = 1470;
const LANDSCAPE_MIN_W = 1180;
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
const nameFields = document.querySelector("#nameFields");
const playerNameInput = document.querySelector("#playerName");
const hostOffer = document.querySelector("#hostOffer");
const lobbyCodeInput = document.querySelector("#lobbyCode");
const toast = document.querySelector("#toast");
const viewport = {
  cssW: W,
  cssH: H,
  dpr: 1,
  scale: 1,
  surfaceW: W,
  surfaceH: H,
  logicalW: W,
  logicalH: H,
  contentX: 0,
  contentY: 0,
  portrait: false
};

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
let menuOpen = false;
let cardAnimations = [];
let seenCardIds = new Set();
let statsPlayerId = "";
let rulesOpen = false;
let relicsOpen = false;
let relicPage = 0;
let freePlayPreference = localStorage.getItem("dungeon-free-play") === "true";

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
document.querySelector("#saveName").addEventListener("click", savePlayerName);

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
  const hit = [...buttons].reverse().find((b) => b.enabled !== false && inRect(p, b));
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
  cardAnimations = cardAnimations.filter((a) => now < a.start + a.duration + 120);
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
  menuOpen = false;
  cardAnimations = [];
  seenCardIds = new Set();
  const seats = players.map((p) => ({
    id: p.id,
    name: p.name,
    bet: 25,
    ready: false,
    hands: [],
    active: 0,
    finished: false,
    spectating: false,
    profit: Number(p.profit) || 0,
    profitHistory: Array.isArray(p.profitHistory) ? p.profitHistory : [0]
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
    dealSeq: 0,
    roundDealCount: 0,
    freePlay: freePlayPreference,
    relicVotes: {},
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
  game.seats.push({ id, name: playerName, bet: 25, ready: false, hands: [], active: 0, finished: false, spectating: false, profit: 0, profitHistory: [0] });
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
  const markDealt = (card) => {
    game.dealSeq = (game.dealSeq || 0) + 1;
    game.roundDealCount = game.roundDealCount || 0;
    const delay = game.phase === "betting" ? Math.min(420, game.roundDealCount * 70) : 0;
    const dealt = { ...card, up: faceUp, _dealId: `${game.session}:${game.dealSeq}`, _dealDelay: delay };
    game.roundDealCount++;
    return dealt;
  };
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
    return markDealt(chosen);
  }
  return markDealt(game.deck.pop());
}

function action(name) {
  if (!game) return;
  if (menuOpen) return;
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
    const max = maxBetForSeat(seat);
    if (name === "betDown") seat.bet = clamp(seat.bet - 5, MIN_BET, max);
    if (name === "betUp") seat.bet = clamp(seat.bet + 5, MIN_BET, max);
    if (name === "minBet") seat.bet = MIN_BET;
    if (name === "maxBet") seat.bet = max;
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
    if (name.startsWith("buy:")) game.code ? voteRelic(playerId, Number(name.slice(4))) : buyRelic(Number(name.slice(4)));
    if (name === "skipShop") game.code ? voteRelic(playerId, -1) : nextBattle();
    return;
  }

  if (game.phase !== "player" || (!game.freePlay && seatIndex !== game.activeSeat) || seat.finished) return;
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
  game.roundDealCount = 0;
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
    advanceHand(seatIndex);
  } else if (handTotal(hand) === 21 || (has("fiveCard") && hand.cards.length >= 5)) {
    hand.status = "stand";
    advanceHand(seatIndex);
  }
}

function stand(seatIndex) {
  const h = activeHand(game.seats[seatIndex]);
  if (h) h.status = "stand";
  advanceHand(seatIndex);
}

function doubleDown(seatIndex) {
  const seat = game.seats[seatIndex];
  const h = activeHand(seat);
  if (!h || h.cards.length !== 2 || game.enemy.noDouble || game.gold < h.bet) return flashMsg("Double unavailable");
  game.gold -= h.bet;
  h.bet *= 2;
  h.doubled = true;
  addToHand(h, "player");
  h.status = isBust(h) ? "bust" : "stand";
  sfx(isBust(h) ? "bust" : "deal");
  advanceHand(seatIndex);
}

function split(seatIndex) {
  const seat = game.seats[seatIndex];
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
  advancePastDoneHands(seatIndex);
}

function surrender(seatIndex) {
  const h = activeHand(game.seats[seatIndex]);
  if (!h || h.cards.length !== 2 || game.enemy.noSurrender) return flashMsg("Surrender unavailable");
  h.status = "surrender";
  advanceHand(seatIndex);
}

function peekNextCard(seatIndex) {
  if ((!game.freePlay && seatIndex !== game.activeSeat) || game.foresightUsesLeft <= 0) return;
  const next = game.deck[game.deck.length - 1];
  if (!next) return;
  game.foresightUsesLeft--;
  game.peekCard = { ...next, up: true };
  game.peekTimer = 4;
  log(`Peek: next card is ${next.rank}${next.suit}.`);
  sfx("flip");
  broadcast();
}

function advanceHand(seatIndex = game.activeSeat) {
  const seat = game.seats[seatIndex];
  seat.active++;
  advancePastDoneHands(seatIndex);
}

function advancePastDoneHands(seatIndex = game.activeSeat) {
  const seat = game.seats[seatIndex];
  seekActiveHand(seat);
  if (!seat || seatDone(seat)) {
    if (seat) seat.finished = true;
    if (game.freePlay) {
      if (game.seats.every(seatDone)) {
        game.phase = "dealer";
        game.dealerTimer = .45;
      }
    } else {
      game.activeSeat++;
      advanceSeat();
    }
  }
}

function advanceSeat() {
  if (game.freePlay) {
    game.seats.forEach((s) => { s.finished = seatDone(s); seekActiveHand(s); });
    if (game.seats.every(seatDone)) {
      game.phase = "dealer";
      game.dealerTimer = .45;
    } else {
      game.phase = "player";
    }
    return;
  }
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
    let seatNet = 0;
    for (const h of seat.hands) {
      const result = settleHand(h, dealerTotal, dealerBj);
      net += result.net;
      seatNet += result.net;
      grossLoss += result.grossLoss || 0;
      if (result.net > 0) winHands++;
      results.push(`${seat.name}: ${result.msg}`);
    }
    seat.profit = (Number(seat.profit) || 0) + seatNet;
    seat.profitHistory = [...(seat.profitHistory || [0]), seat.profit].slice(-40);
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
    if (game.code) restartLobbyRun();
    else appScene = "menu";
    return;
  }
  if (game.enemy.hp <= 0) {
    game.shop = chooseRelics();
    game.relicVotes = {};
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
  game.roundDealCount = 0;
  cardAnimations = [];
  seenCardIds = new Set();
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
  newGame([{ id: hostId, name: savedPlayerName("Host") }], code);
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
    notify(formatPeerError(err));
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
    peer.send({ type: "hello", playerId: localPlayerId, name: savedPlayerName("Guest") });
    notify("Connected. Waiting for host state...");
  } catch (err) {
    notify(formatPeerError(err));
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
    notify(formatPeerError(details));
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
    if (!addPlayerSeat(id, cleanPlayerName(msg.name) || guestNameFor(id))) {
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
  if (msg.type === "rename") {
    const seat = game?.seats.find((s) => s.id === (msg.playerId || fromId));
    const name = cleanPlayerName(msg.name);
    if (seat && name) seat.name = name;
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
  nameFields.hidden = kind !== "name";
  signalTitle.textContent = title;
  signalText.textContent = text;
}

function savedPlayerName(fallback = "Player") {
  return cleanPlayerName(localStorage.getItem("dungeon-player-name")) || fallback;
}

function cleanPlayerName(value) {
  return String(value || "").replace(/[<>\n\r]/g, "").trim().slice(0, 20);
}

function openNameEditor() {
  playerNameInput.value = savedPlayerName(role === "solo" ? "You" : "Player");
  showSignal("name", "Your Name", "This name is remembered on this device.");
  setTimeout(() => playerNameInput.focus(), 0);
}

function savePlayerName() {
  const name = cleanPlayerName(playerNameInput.value);
  if (!name) return notify("Enter a display name.");
  localStorage.setItem("dungeon-player-name", name);
  const seat = game?.seats.find((s) => s.id === localPlayerId);
  if (seat) seat.name = name;
  if (role === "guest") peer?.send({ type: "rename", playerId: localPlayerId, name });
  if (role === "host") broadcast();
  hideSignal();
  notify(`Playing as ${name}`);
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

function formatPeerError(err) {
  if (!err) return "Lobby connection failed.";
  const type = err.type ? `${err.type}: ` : "";
  const message = err.message || String(err);
  if (/timed out/i.test(message)) return `${type}${message} Make sure both devices are online and try again.`;
  if (/service did not load/i.test(message)) return `${type}${message} A browser extension or network filter may be blocking Supabase.`;
  return `${type}${message}`;
}

function restartLobbyRun() {
  const players = game.seats.map((s) => ({ id: s.id, name: s.name, profit: s.profit, profitHistory: s.profitHistory }));
  const code = game.code;
  const mode = game.freePlay;
  newGame(players, code);
  game.freePlay = mode;
  log("The lobby deals a fresh dungeon run.");
}

function maxBetForSeat(seat) {
  const committedByOthers = game.seats.reduce((sum, other) => sum + (other === seat ? 0 : Math.max(0, other.bet || 0)), 0);
  return Math.max(MIN_BET, Math.min(MAX_BET, game.gold - committedByOthers));
}

function voteRelic(playerId, index) {
  if (game.phase !== "shop") return;
  game.relicVotes ||= {};
  game.relicVotes[playerId] = index;
  const voters = game.seats.filter((s) => !s.spectating);
  if (!voters.every((s) => Object.hasOwn(game.relicVotes, s.id))) return;
  const counts = new Map();
  voters.forEach((s) => {
    const vote = game.relicVotes[s.id];
    counts.set(vote, (counts.get(vote) || 0) + 1);
  });
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] === -1 ? 1 : b[0] === -1 ? -1 : a[0] - b[0]))[0][0];
  if (winner === -1) nextBattle(); else buyRelic(winner);
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

function drawBackdrop() {
  const lw = viewport.surfaceW;
  const lh = viewport.surfaceH;
  const g = ctx.createLinearGradient(0, 0, lw, lh);
  g.addColorStop(0, "#17101f");
  g.addColorStop(.48, "#0f1718");
  g.addColorStop(1, "#231527");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, lw, lh);

  ctx.save();
  ctx.globalAlpha = .2;
  ctx.strokeStyle = "rgba(220,180,70,.16)";
  ctx.lineWidth = 1;
  for (let x = -80; x < lw + 120; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 220, lh);
    ctx.stroke();
  }
  ctx.globalAlpha = .35;
  ctx.fillStyle = "rgba(0,0,0,.38)";
  ctx.fillRect(0, lh - 110, lw, 110);
  const vignette = ctx.createRadialGradient(lw / 2, lh * .42, Math.min(lw, lh) * .18, lw / 2, lh * .42, Math.max(lw, lh) * .68);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.48)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, lw, lh);
  ctx.restore();
}

function draw() {
  resizeCanvas();
  buttons = [];
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.cssW, viewport.cssH);
  fill("#08070b", 0, 0, viewport.cssW, viewport.cssH);
  ctx.save();
  ctx.scale(viewport.scale, viewport.scale);
  drawBackdrop();
  ctx.translate(viewport.contentX, viewport.contentY);
  if (!game || appScene === "menu") {
    drawMenu();
  } else {
    drawTable();
    drawFlyingCards();
    if (game.phase === "shop") drawShop();
    if (game.phase === "victory" || game.phase === "defeat") drawEnd();
    if (game.peekCard) drawPeekOverlay();
  }
  if (statsPlayerId) drawStatsOverlay();
  if (rulesOpen) drawRulesOverlay();
  if (relicsOpen) drawRelicsOverlay();
  if (menuOpen) {
    buttons = [];
    drawGameMenu();
  }
  if (flashTimer > 0) drawFlash();
  ctx.restore();
}

function drawMenu() {
  const lw = layoutW();
  const lh = layoutH();
  const cx = lw / 2;
  const portrait = viewport.portrait;
  const table = portrait ? { x: 34, y: 54, w: lw - 68, h: Math.min(1210, lh - 108) } : { x: cx - 422, y: 70, w: 844, h: 660 };
  shadow(0, 28, 70, "rgba(0,0,0,.45)", () => {
    gradientRound(table.x, table.y, table.w, table.h, 24, [
      [0, "#1d3028"],
      [.55, "#111d19"],
      [1, "#21182a"]
    ], true);
  });
  strokeRound(table.x, table.y, table.w, table.h, 24, "rgba(220,180,70,.4)", 3);
  strokeRound(table.x + 12, table.y + 12, table.w - 24, table.h - 24, 18, "rgba(238,231,215,.08)", 1);

  if (!portrait) {
    drawCardFace({ rank: "A", suit: "S", up: true }, table.x + 90, table.y + 74, false);
    drawCardFace({ rank: "K", suit: "H", up: true }, table.x + table.w - 180, table.y + 92, false);
    drawCardFace({ up: false }, table.x + table.w - 118, table.y + 250, false);
  }

  ctx.save();
  ctx.shadowColor = "rgba(220,180,70,.35)";
  ctx.shadowBlur = 18;
  text("DUNGEON", cx, portrait ? 168 : 188, portrait ? 58 : 76, C.gold, "center", "serif");
  ctx.restore();
  text("of CARDS", cx, portrait ? 234 : 264, portrait ? 56 : 72, C.parchment, "center", "serif");
  text("A blackjack roguelike", cx, portrait ? 302 : 316, portrait ? 29 : 25, C.muted, "center");
  const lines = [
    "Win chips to damage dealer-monsters.",
    "Lose chips and the dungeon takes blood.",
    "Collect relics, bend the rules, beat the final boss."
  ];
  lines.forEach((line, i) => text(line, cx, (portrait ? 382 : 372) + i * (portrait ? 40 : 34), portrait ? 22 : 21, C.text, "center"));
  const buttonW = portrait ? 480 : 300;
  const buttonX = cx - buttonW / 2;
  const buttonY = portrait ? 650 : 475;
  addButton(buttonX, portrait ? 548 : 414, buttonW, portrait ? 72 : 44, `Player: ${savedPlayerName("You")}`, openNameEditor);
  addButton(buttonX, buttonY, buttonW, portrait ? 78 : 52, "Single Player", () => {
    role = "solo";
    localPlayerId = hostId;
    newGame([{ id: hostId, name: savedPlayerName("You") }]);
  }, true);
  addButton(buttonX, buttonY + (portrait ? 102 : 60), buttonW, portrait ? 78 : 52, "Host Game", hostLobby);
  addButton(buttonX, buttonY + (portrait ? 204 : 120), buttonW, portrait ? 78 : 52, "Join Game", joinLobby);
  addButton(buttonX, buttonY + (portrait ? 306 : 180), buttonW, portrait ? 72 : 44, `Mode: ${freePlayPreference ? "Free Play" : "Classic Turns"}`, () => {
    freePlayPreference = !freePlayPreference;
    localStorage.setItem("dungeon-free-play", String(freePlayPreference));
  });
  text("H/S/D/P/R actions - Enter ready/continue - M music", cx, lh - 34, portrait ? 18 : 16, C.muted, "center");
}

function drawTable() {
  const felt = viewport.portrait
    ? { x: 24, y: 24, w: layoutW() - 48, h: 700 }
    : { x: 40, y: 40, w: layoutW() - (isTouchLandscape() ? 570 : 380), h: 720 };
  const theme = feltTheme();
  shadow(0, 26, 60, "rgba(0,0,0,.5)", () => {
    gradientRound(felt.x, felt.y, felt.w, felt.h, 22, [
      [0, theme[0]], [.52, theme[1]], [1, theme[2]]
    ], true);
  });
  strokeRound(felt.x, felt.y, felt.w, felt.h, 22, game.enemy.color || "#4f744f", 8);
  strokeRound(felt.x + 12, felt.y + 12, felt.w - 24, felt.h - 24, 16, "rgba(238,231,215,.08)", 1);
  strokeRound(felt.x + 20, felt.y + 20, felt.w - 40, felt.h - 40, 13, "rgba(220,180,70,.08)", 1);
  ctx.save();
  ctx.globalAlpha = .11;
  ctx.strokeStyle = "#eee7d7";
  ctx.lineWidth = 1;
  for (let y = felt.y + 82; y < felt.y + felt.h - 30; y += 62) {
    ctx.beginPath();
    ctx.moveTo(felt.x + 34, y);
    ctx.lineTo(felt.x + felt.w - 34, y + 16);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(220,180,70,.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(felt.x + felt.w / 2, felt.y + 190, Math.min(310, felt.w * .34), 125, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = .07;
  text("DUNGEON OF CARDS", felt.x + felt.w / 2, felt.y + felt.h - 34, viewport.portrait ? 22 : 25, C.gold, "center", "serif");
  ctx.restore();
  drawDeck(felt.x + felt.w - 125, felt.y + 50);
  drawDealer(felt);
  drawSeats(felt);
  drawSidePanel();
}

function drawDealer(felt) {
  const portrait = viewport.portrait;
  const dealerX = felt.x + felt.w / 2 - (portrait ? 100 : 120);
  const badgeX = felt.x + felt.w / 2;
  const barX = felt.x + 22;
  const barY = portrait ? felt.y + 252 : felt.y + 248;
  const barW = felt.w - 44;
  text("Dealer", felt.x + 38, felt.y + 38, portrait ? 23 : 18, C.muted);
  drawHand(game.dealer, dealerX, felt.y + 56, false);
  const shown = game.dealer.some((c) => !c.up) ? `${visibleTotal(game.dealer)}+?` : handTotal({ cards: game.dealer });
  badge(badgeX, felt.y + 205, game.dealer.length ? `Total ${shown}` : "Waiting", C.muted);
  const e = game.enemy;
  gradientRound(barX, barY, barW, 78, 14, [
    [0, "#19101f"],
    [.6, "#0e0b13"],
    [1, "#20162a"]
  ]);
  strokeRound(barX, barY, barW, 78, 14, "rgba(220,180,70,.2)", 1);
  shadow(0, 0, 18, e.color, () => fill(e.color, barX + 16, barY + 15, 50, 50, 25));
  text(e.icon, barX + 41, barY + 44, e.icon.length > 2 ? 14 : 22, C.black, "center", "serif");
  text(e.name, barX + 82, barY + 28, portrait ? 23 : 22, C.gold);
  const meterW = portrait ? 180 : 220;
  const meterX = barX + barW - meterW - 30;
  const descriptionW = portrait ? 300 : Math.max(160, Math.min(460, barW - meterW - 150));
  wrapTextSized(e.description, barX + 82, barY + 56, descriptionW, portrait ? 19 : 16, portrait ? 17 : 15, C.muted, 1);
  meter(meterX, barY + 29, meterW, 14, e.hp / e.maxHp, C.red, C.gold);
  text(`${e.hp}/${e.maxHp}`, meterX + meterW / 2, barY + 63, portrait ? 18 : 14, C.text, "center");
  buttons.push({ x: barX, y: barY, w: barW, h: 78, onClick: () => rulesOpen = true });
}

function drawSeats(felt) {
  const active = game.seats[game.activeSeat];
  game.seats.forEach((seat, idx) => {
    const portrait = viewport.portrait;
    const columnW = felt.w / 2;
    const seatW = portrait ? 315 : Math.min(370, columnW - 50);
    const x = portrait ? felt.x + 46 + (idx % 2) * 350 : felt.x + 50 + (idx % 2) * columnW;
    const y = portrait ? felt.y + 372 + Math.floor(idx / 2) * 156 : felt.y + 365 + Math.floor(idx / 2) * 170;
    const isActive = game.phase === "player" && (game.freePlay ? !seat.finished : active?.id === seat.id);
    if (isActive) {
      shadow(0, 0, 26, "rgba(220,180,70,.42)", () => {
        gradientRound(x - 18, y - 42, seatW, 150, 14, [[0, "rgba(68,55,35,.9)"], [1, "rgba(20,30,24,.9)"]]);
      });
    } else {
      fill("rgba(5,8,7,.28)", x - 18, y - 42, seatW, 150, 14);
    }
    strokeRound(x - 18, y - 42, seatW, 150, 14, isActive ? C.gold : "rgba(238,231,215,.11)", isActive ? 3 : 1);
    const rank = playerRankIcon(seat);
    const displayName = `${rank}${seat.name}${seat.id === localPlayerId ? " (You)" : ""}`;
    text(fitLabel(displayName, seatW - 125, portrait ? 20 : 18), x, y - 18, portrait ? 20 : 18, isActive ? C.gold : C.text);
    text(seatStatus(seat), x + seatW - 40, y - 18, portrait ? 18 : 14, C.muted, "right");
    if (seat.hands.length) {
      const slotW = Math.max(24, (seatW - CARD_W - 22) / seat.hands.length);
      seat.hands.forEach((hand, hidx) => {
        const hx = x + hidx * slotW;
        drawHand(hand.cards, hx, y + 10, hidx === seat.active && isActive, CARD_W + slotW);
        badge(hx + 45, y + 148, handLabel(hand), handColor(hand));
      });
    } else {
      drawChips(x + 38, y + 50, seat.bet);
      badge(x + 110, y + 70, `Bet ${seat.bet}g`, C.gold);
    }
    buttons.push({ x: x - 18, y: y - 42, w: seatW, h: 150, onClick: () => statsPlayerId = seat.id });
  });
}

function drawSidePanel() {
  if (viewport.portrait) {
    drawBottomPanel();
    return;
  }
  if (isTouchLandscape()) {
    drawTouchLandscapePanel();
    return;
  }
  const x = layoutW() - 310;
  shadow(0, 24, 55, "rgba(0,0,0,.45)", () => {
    gradientRound(x, 40, 270, 720, 18, [
      [0, "#241a30"],
      [.44, "#14101b"],
      [1, "#1b1423"]
    ], true);
  });
  strokeRound(x, 40, 270, 720, 18, "rgba(220,180,70,.28)", 2);
  gradientRound(x + 14, 52, 176, 42, 10, [[0, "rgba(220,180,70,.13)"], [1, "rgba(220,180,70,.02)"]], true);
  strokeRound(x + 14, 52, 176, 42, 10, "rgba(220,180,70,.20)", 1);
  text("DUNGEON", x + 102, 70, 17, C.gold, "center", "serif");
  text("OF CARDS", x + 102, 86, 10, C.muted, "center", "serif");
  addButton(x + 196, 52, 52, 34, "Menu", () => menuOpen = true);
  fill("rgba(238,231,215,.06)", x + 20, 100, 230, 1);
  text(`Floor ${game.floor + 1}/${enemyTemplates.length}`, x + 22, 112, 18, C.text);
  text(`Gold ${game.gold}g`, x + 22, 140, 18, C.gold);
  meter(x + 22, 166, 226, 12, game.hp / game.maxHp, C.red, C.green);
  text(`HP ${game.hp}/${game.maxHp}`, x + 135, 196, 15, C.text, "center");
  if (game.code) badge(x + 135, 226, `Lobby ${game.code}`, C.gold);
  gradientRound(x + 22, 242, 226, 44, 10, [[0, "rgba(220,180,70,.14)"], [1, "rgba(220,180,70,.04)"]], true);
  strokeRound(x + 22, 242, 226, 44, 10, "rgba(220,180,70,.18)", 1);
  text(phaseTitle(), x + 135, 271, 22, C.text, "center");
  drawActionButtons(x + 22, 295);
  drawRelicPanel(x + 22, 500, 226);
  fill("rgba(238,231,215,.06)", x + 22, 646, 226, 1);
  text("Log", x + 22, 674, 18, C.gold);
  game.log.slice(0, 3).forEach((line, i) => text(line, x + 22, 700 + i * 20, 13, C.muted));
}

function drawBottomPanel() {
  const x = 24;
  const y = 750;
  const w = layoutW() - 48;
  const h = Math.max(720, layoutH() - y - 28);
  shadow(0, 18, 45, "rgba(0,0,0,.45)", () => {
    gradientRound(x, y, w, h, 18, [
      [0, "#241a30"],
      [.46, "#15101c"],
      [1, "#10151a"]
    ], true);
  });
  strokeRound(x, y, w, h, 18, "rgba(220,180,70,.3)", 2);
  text("DUNGEON OF CARDS", x + w / 2, y + 48, 30, C.gold, "center", "serif");
  addButton(x + w - 140, y + 18, 112, 54, "Menu", () => menuOpen = true);

  const leftX = x + 24;
  const rightStatX = x + w - 250;
  text(`Floor ${game.floor + 1}/${enemyTemplates.length}`, leftX, y + 98, 24, C.text);
  text(`Gold ${game.gold}g`, leftX, y + 134, 24, C.gold);
  meter(rightStatX, y + 96, 220, 18, game.hp / game.maxHp, C.red, C.green);
  text(`HP ${game.hp}/${game.maxHp}`, rightStatX + 110, y + 136, 21, C.text, "center");
  if (game.code) badge(x + w / 2, y + 178, `Lobby ${game.code}`, C.gold);

  gradientRound(leftX, y + 192, w - 48, 58, 12, [[0, "rgba(220,180,70,.14)"], [1, "rgba(220,180,70,.04)"]], true);
  strokeRound(leftX, y + 192, w - 48, 58, 12, "rgba(220,180,70,.18)", 1);
  text(phaseTitle(), x + w / 2, y + 230, 29, C.text, "center");
  drawActionButtons(leftX, y + 264);

  fill("rgba(238,231,215,.06)", leftX, y + 620, w - 48, 1);
  drawRelicPanel(leftX, y + 660, 320);
  text("Log", x + 392, y + 660, 24, C.gold);
  game.log.slice(0, 5).forEach((line, i) => text(line, x + 392, y + 698 + i * 29, 19, C.muted));
}

function drawRelicPanel(x, y, w) {
  const portrait = viewport.portrait;
  text("Relics", x, y, portrait ? 24 : 18, C.gold);
  if (!game.relics.length) {
    text("None yet", x, y + (portrait ? 38 : 28), portrait ? 19 : 14, C.muted);
    return;
  }
  const newest = game.relics.find((r) => r.name === lastRelicName);
  const shown = newest
    ? [newest, ...game.relics.filter((r) => r.name !== newest.name)]
    : game.relics;
  shown.slice(0, 2).forEach((r, i) => drawRelicRow(r, x, y + (portrait ? 40 : 28) + i * (portrait ? 84 : 62), w, r.name === lastRelicName));
  if (game.relics.length > 2) {
    text(`+${game.relics.length - 2} more`, x, y + (portrait ? 220 : 154), portrait ? 17 : 13, C.muted);
  }
  buttons.push({ x, y: y - 20, w, h: portrait ? 250 : 180, onClick: () => { relicsOpen = true; relicPage = 0; } });
}

function drawTouchLandscapePanel() {
  const x = layoutW() - 510;
  const w = 470;
  gradientRound(x, 30, w, 740, 20, [[0, "#241a30"], [.44, "#14101b"], [1, "#1b1423"]], true);
  strokeRound(x, 30, w, 740, 20, "rgba(220,180,70,.32)", 3);
  text("DUNGEON OF CARDS", x + 190, 82, 25, C.gold, "center", "serif");
  addButton(x + 370, 46, 78, 92, "Menu", () => menuOpen = true);
  text(`Floor ${game.floor + 1}/${enemyTemplates.length}`, x + 24, 142, 27, C.text);
  text(`Gold ${game.gold}g`, x + 245, 142, 27, C.gold);
  meter(x + 24, 174, w - 48, 20, game.hp / game.maxHp, C.red, C.green);
  text(`HP ${game.hp}/${game.maxHp}`, x + w / 2, 222, 23, C.text, "center");
  text(phaseTitle(), x + w / 2, 278, 30, C.text, "center");
  drawActionButtons(x + 20, 310);
  text("Relics", x + 24, 604, 24, C.gold);
  const relicSummary = game.relics.length ? `${game.relics.length} collected — tap to view` : "None yet";
  text(relicSummary, x + 24, 642, 20, C.muted);
  buttons.push({ x: x + 18, y: 574, w: w - 36, h: 94, onClick: () => { relicsOpen = true; relicPage = 0; } });
  const latest = game.log[0] || "";
  text(fitLabel(latest, w - 48, 18), x + 24, 718, 18, C.muted);
}

function drawRelicRow(relic, x, y, w, highlight = false) {
  const portrait = viewport.portrait;
  const rowH = portrait ? 74 : 54;
  gradientRound(x, y - 14, w, rowH, 8, highlight ? [[0, "#3a2c45"], [1, "#211827"]] : [[0, "#1d1624"], [1, "#100d15"]]);
  strokeRound(x, y - 14, w, rowH, 8, highlight ? C.gold : "rgba(238,231,215,.12)", 1);
  badge(x + (portrait ? 28 : 22), y + (portrait ? 20 : 12), relic.icon, C.gold);
  text(relic.name, x + (portrait ? 62 : 50), y + (portrait ? 8 : 4), portrait ? 18 : 14, C.gold);
  wrapTextSized(relic.description, x + (portrait ? 62 : 50), y + (portrait ? 34 : 24), w - (portrait ? 74 : 58), portrait ? 18 : 14, portrait ? 15 : 12, C.muted, 2);
}

function drawActionButtons(x, y) {
  if (viewport.portrait) {
    const gap = 14;
    const bw = Math.floor((layoutW() - 96 - gap) / 2);
    const bh = 64;
    const full = bw * 2 + gap;
    if (game.phase === "betting") {
      addButton(x, y, bw, bh, "-5", () => action("betDown"));
      addButton(x + bw + gap, y, bw, bh, "+5", () => action("betUp"));
      addButton(x, y + 76, bw, bh, "Min", () => action("minBet"));
      addButton(x + bw + gap, y + 76, bw, bh, "Max", () => action("maxBet"));
      addButton(x, y + 152, full, 72, mySeat()?.ready ? "Unready" : "Ready", () => action("ready"), true);
      return;
    }
    if (game.phase === "insurance") {
      addButton(x, y, bw, bh, "Insure", () => action("insuranceYes"), true);
      addButton(x + bw + gap, y, bw, bh, "No", () => action("insuranceNo"));
      return;
    }
    if (game.phase === "player") {
      const mine = activeHand(mySeat());
      const myTurn = game.freePlay ? !mySeat()?.finished : game.seats[game.activeSeat]?.id === localPlayerId;
      addButton(x, y, bw, bh, "Hit", () => action("hit"), true, myTurn);
      addButton(x + bw + gap, y, bw, bh, "Stand", () => action("stand"), false, myTurn);
      addButton(x, y + 76, bw, bh, "Double", () => action("double"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noDouble && game.gold >= (mine?.bet || 0));
      addButton(x + bw + gap, y + 76, bw, bh, "Split", () => action("split"), false, myTurn && canSplitLocal(mine));
      addButton(x, y + 152, full, bh, "Surrender", () => action("surrender"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noSurrender);
      if (game.foresightUsesLeft > 0) {
        addButton(x, y + 228, full, bh, `Peek (${game.foresightUsesLeft})`, () => action("peek"), true, myTurn);
      }
      return;
    }
    if (["roundOver", "victory", "defeat"].includes(game.phase)) {
      addButton(x, y, full, 76, game.phase === "roundOver" ? "Continue" : "Return", () => action("continue"), true);
    }
    return;
  }
  if (isTouchLandscape()) {
    const gap = 10;
    const bw = 100;
    const bh = 105;
    if (game.phase === "betting") {
      addButton(x, y, bw, bh, "-5", () => action("betDown"));
      addButton(x + 110, y, bw, bh, "+5", () => action("betUp"));
      addButton(x + 220, y, bw, bh, "Min", () => action("minBet"));
      addButton(x + 330, y, bw, bh, "Max", () => action("maxBet"));
      addButton(x, y + bh + gap, 430, 110, mySeat()?.ready ? "Unready" : "Ready", () => action("ready"), true);
      return;
    }
    if (game.phase === "insurance") {
      addButton(x, y, 210, 110, "Insure", () => action("insuranceYes"), true);
      addButton(x + 220, y, 210, 110, "No", () => action("insuranceNo"));
      return;
    }
    if (game.phase === "player") {
      const mine = activeHand(mySeat());
      const myTurn = game.freePlay ? !mySeat()?.finished : game.seats[game.activeSeat]?.id === localPlayerId;
      addButton(x, y, bw, bh, "Hit", () => action("hit"), true, myTurn);
      addButton(x + 110, y, bw, bh, "Stand", () => action("stand"), false, myTurn);
      addButton(x + 220, y, bw, bh, "Double", () => action("double"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noDouble && game.gold >= (mine?.bet || 0));
      addButton(x + 330, y, bw, bh, "Split", () => action("split"), false, myTurn && canSplitLocal(mine));
      addButton(x, y + bh + gap, 430, 105, "Surrender", () => action("surrender"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noSurrender);
      return;
    }
    if (["roundOver", "victory", "defeat"].includes(game.phase)) {
      addButton(x, y, 430, 110, game.phase === "roundOver" ? "Continue" : "Return", () => action("continue"), true);
    }
    return;
  }
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
    const myTurn = game.freePlay ? !mySeat()?.finished : game.seats[game.activeSeat]?.id === localPlayerId;
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
  const lw = layoutW();
  const lh = layoutH();
  const portrait = viewport.portrait;
  fill("rgba(0,0,0,.76)", 0, 0, lw, lh);
  gradientRound(30, 42, lw - 60, 128, 18, [[0, "rgba(35,25,45,.96)"], [1, "rgba(10,8,13,.92)"]]);
  strokeRound(30, 42, lw - 60, 128, 18, "rgba(220,180,70,.35)", 2);
  text("THE WANDERING MERCHANT", lw / 2, 98, portrait ? 34 : 42, C.gold, "center", "serif");
  text("Choose a relic, or descend with what you have.", lw / 2, 145, portrait ? 20 : 20, C.muted, "center");
  if (portrait) {
    game.shop.slice(0, 3).forEach((r, i) => drawShopRelicCard(r, i, 80, 205 + i * 340));
    addButton(lw / 2 - 170, 1225, 340, 72, "Skip Shop", () => action("skipShop"));
  } else {
    const cardsX = lw / 2 - 455;
    game.shop.slice(0, 3).forEach((r, i) => drawShopRelicCard(r, i, cardsX + i * 315, 205));
    addButton(lw / 2 - 112, 595, 224, 54, "Skip Shop", () => action("skipShop"));
  }
}

function drawShopRelicCard(relic, index, x, y) {
  const cost = 45 + game.floor * 15;
  const canBuy = game.gold >= cost;
  const portrait = viewport.portrait;
  const cardW = portrait ? layoutW() - 160 : 280;
  const cardH = portrait ? 318 : 320;
  shadow(0, 18, 38, "rgba(0,0,0,.42)", () => {
    gradientRound(x, y, cardW, cardH, 14, canBuy
      ? [[0, "#2c2438"], [.62, "#17111e"], [1, "#22152b"]]
      : [[0, "#211b27"], [1, "#111017"]], true);
  });
  strokeRound(x, y, cardW, cardH, 14, canBuy ? C.gold : C.goldDim, canBuy ? 3 : 2);
  fill("rgba(220,180,70,.08)", x + 14, y + 14, cardW - 28, portrait ? 88 : 76, 12);
  fill("#120e16", x + 20, y + 20, portrait ? 78 : 64, portrait ? 78 : 64, 14);
  strokeRound(x + 20, y + 20, portrait ? 78 : 64, portrait ? 78 : 64, 14, C.goldDim, 2);
  text(relic.icon, x + (portrait ? 59 : 52), y + (portrait ? 70 : 62), relic.icon.length > 1 ? (portrait ? 24 : 19) : (portrait ? 34 : 28), C.gold, "center", "serif");
  text(relic.name, x + (portrait ? 116 : 100), y + (portrait ? 49 : 45), portrait ? 27 : 20, C.gold);
  wrapTextSized(relic.description, x + (portrait ? 116 : 100), y + (portrait ? 82 : 72), cardW - (portrait ? 150 : 130), portrait ? 22 : 17, portrait ? 18 : 14, C.text, 2);
  fill("rgba(7,5,10,.46)", x + 24, y + (portrait ? 122 : 112), cardW - 48, portrait ? 104 : 116, 10);
  strokeRound(x + 24, y + (portrait ? 122 : 112), cardW - 48, portrait ? 104 : 116, 10, "rgba(238,231,215,.12)", 1);
  wrapTextSized(relic.description, x + 42, y + (portrait ? 154 : 144), cardW - 84, portrait ? 24 : 20, portrait ? 19 : 16, C.text, 3);
  const votes = Object.values(game.relicVotes || {}).filter((v) => v === index).length;
  const voted = game.relicVotes?.[localPlayerId] === index;
  const label = game.code ? `${voted ? "Voted" : "Vote"}${votes ? ` (${votes})` : ""}` : `Buy ${cost}g`;
  addButton(x + 40, y + (portrait ? 244 : 250), cardW - 80, portrait ? 62 : 50, label, () => action(`buy:${index}`), true, canBuy);
}

function drawPeekOverlay() {
  const alpha = Math.min(1, game.peekTimer / .6, (4 - game.peekTimer) / .35);
  const lw = layoutW();
  ctx.save();
  ctx.globalAlpha = Math.max(.2, alpha);
  fill("rgba(0,0,0,.58)", 0, 0, lw, layoutH());
  text("NEXT CARD", lw / 2, 215, 34, "#9ee8ff", "center", "serif");
  drawCardFace(game.peekCard, lw / 2 - CARD_W / 2, 250, true);
  ctx.restore();
}

function drawEnd() {
  const lw = layoutW();
  fill("rgba(0,0,0,.76)", 0, 0, lw, layoutH());
  const victory = game.phase === "victory";
  text(victory ? "VICTORY" : "DEFEAT", lw / 2, 235, viewport.portrait ? 54 : 68, victory ? C.gold : C.red, "center", "serif");
  text(victory ? "The dungeon folds its hand." : "The house collects.", lw / 2, 305, viewport.portrait ? 21 : 26, C.text, "center");
  text(`Final gold: ${game.gold}g`, lw / 2, 365, 22, C.gold, "center");
  const relicText = game.relics.length ? game.relics.map((r) => r.name).join(", ") : "None";
  text("Relics:", lw / 2, 420, 20, C.gold, "center");
  const lines = wrapLines(relicText, Math.min(820, lw - 80), 16);
  lines.forEach((line, i) => text(line, lw / 2, 448 + i * 22, 16, C.text, "center"));
  addButton(lw / 2 - 140, Math.min(layoutH() - 90, 490 + lines.length * 22), 280, 54, game.code ? "Play Again — Same Lobby" : "Return to Menu", () => action("continue"), true);
}

function drawFlash() {
  const w = Math.min(520, ctx.measureText(flash).width + 50);
  const cx = layoutW() / 2;
  shadow(0, 12, 28, "rgba(0,0,0,.45)", () => fill("rgba(18,14,22,.92)", cx - w / 2, 24, w, 42, 10));
  strokeRound(cx - w / 2, 24, w, 42, 10, "rgba(220,180,70,.45)", 1);
  text(flash, cx, 52, 18, C.gold, "center");
}

function drawGameMenu() {
  const lw = layoutW();
  const lh = layoutH();
  const panelW = viewport.portrait ? 520 : 430;
  const panelH = viewport.portrait ? 410 : 340;
  const x = lw / 2 - panelW / 2;
  const y = Math.max(72, lh / 2 - panelH / 2);
  fill("rgba(0,0,0,.62)", 0, 0, lw, lh);
  shadow(0, 24, 60, "rgba(0,0,0,.5)", () => {
    gradientRound(x, y, panelW, panelH, 18, [[0, "#302640"], [1, "#15101c"]], true);
  });
  strokeRound(x, y, panelW, panelH, 18, "rgba(220,180,70,.45)", 2);
  text("Game Menu", lw / 2, y + 62, viewport.portrait ? 34 : 28, C.gold, "center", "serif");
  text("Return to the table or go back home.", lw / 2, y + 104, viewport.portrait ? 21 : 16, C.muted, "center");
  addButton(x + 42, y + 138, panelW - 84, viewport.portrait ? 72 : 56, "Resume", () => menuOpen = false, true);
  addButton(x + 42, y + (viewport.portrait ? 226 : 204), panelW - 84, viewport.portrait ? 72 : 56, "Change Name", openNameEditor);
  addButton(x + 42, y + (viewport.portrait ? 314 : 270), panelW - 84, viewport.portrait ? 72 : 56, "Home Screen", goHome);
}

function goHome() {
  menuOpen = false;
  appScene = "menu";
  game = null;
  role = "solo";
  localPlayerId = hostId;
  cardAnimations = [];
  seenCardIds = new Set();
  hideSignal();
  peer?.peer?.destroy?.();
  peer = null;
  if (location.search) history.replaceState(null, "", location.pathname);
}

function drawHand(cards, x, y, highlight, maxWidth = Infinity) {
  const step = cards.length < 2 ? 0 : Math.max(14, Math.min(62, (maxWidth - CARD_W) / (cards.length - 1)));
  cards.forEach((card, i) => {
    const cx = x + i * step;
    const cy = y + Math.sin(i * .6) * 2;
    const anim = prepareCardAnimation(card, cx, cy);
    if (anim && animationProgress(anim) < .92) return;
    drawCardFace(card, cx, cy, highlight && i === cards.length - 1);
  });
}

function prepareCardAnimation(card, x, y) {
  if (!card?._dealId || appScene !== "game") return null;
  let anim = cardAnimations.find((a) => a.id === card._dealId);
  if (anim) {
    anim.toX = x;
    anim.toY = y;
    return anim;
  }
  if (seenCardIds.has(card._dealId)) return null;
  seenCardIds.add(card._dealId);
  const from = deckPosition();
  anim = {
    id: card._dealId,
    card: { ...card },
    fromX: from.x,
    fromY: from.y,
    toX: x,
    toY: y,
    start: performance.now() + (Number(card._dealDelay) || 0),
    duration: 430
  };
  cardAnimations.push(anim);
  return anim;
}

function drawFlyingCards() {
  cardAnimations.forEach((anim) => {
    const progress = animationProgress(anim);
    if (progress <= 0 || progress >= 1) return;
    const ease = 1 - Math.pow(1 - progress, 3);
    const lift = Math.sin(progress * Math.PI) * 46;
    const x = lerp(anim.fromX, anim.toX, ease);
    const y = lerp(anim.fromY, anim.toY, ease) - lift;
    const scale = .78 + ease * .22;
    const rot = lerp(-.18, .03, ease);
    ctx.save();
    ctx.globalAlpha = Math.min(1, progress * 4);
    ctx.translate(x + CARD_W / 2, y + CARD_H / 2);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    drawCardFace(anim.card, -CARD_W / 2, -CARD_H / 2, true);
    ctx.restore();
  });
}

function animationProgress(anim) {
  return clamp((performance.now() - anim.start) / anim.duration, 0, 1);
}

function deckPosition() {
  const felt = viewport.portrait
    ? { x: 24, y: 24, w: layoutW() - 48, h: 700 }
    : { x: 40, y: 40, w: layoutW() - (isTouchLandscape() ? 570 : 380), h: 720 };
  return { x: felt.x + felt.w - 125, y: felt.y + 50 };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  if (highlight) {
    shadow(0, 0, 18, "rgba(220,180,70,.55)", () => fill(C.gold, x - 5, y - 5, CARD_W + 10, CARD_H + 10, 12));
  }
  if (card.up === false) {
    shadow(0, 7, 13, "rgba(0,0,0,.36)", () => gradientRound(x, y, CARD_W, CARD_H, 9, [[0, "#4a2f66"], [1, "#23133a"]], true));
    gradientRound(x + 8, y + 8, CARD_W - 16, CARD_H - 16, 7, [[0, "#654482"], [1, "#38244e"]], true);
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
  shadow(0, 7, 12, "rgba(0,0,0,.28)", () => gradientRound(x, y, CARD_W, CARD_H, 9, [[0, "#fff2cb"], [.55, C.parchment], [1, "#cdbb8f"]], true));
  strokeRound(x, y, CARD_W, CARD_H, 9, "#3c3228", 2);
  strokeRound(x + 4, y + 4, CARD_W - 8, CARD_H - 8, 6, "rgba(255,255,255,.22)", 1);
  const red = card.suit === "H" || card.suit === "D";
  const color = red ? "#aa2323" : "#191923";
  const suit = { S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663" }[card.suit];
  text(card.rank, x + 8, y + 28, card.rank === "10" ? 22 : 26, color, "left", "serif");
  text(suit, x + 8 + (card.rank === "10" ? 13 : 10), y + 47, 15, color, "center", "serif");
  text(suit, x + CARD_W / 2, y + CARD_H / 2 + 18, 44, color, "center", "serif");
  text(card.rank, x + CARD_W - 8, y + CARD_H - 10, card.rank === "10" ? 18 : 21, color, "right", "serif");
  text(suit, x + CARD_W - 18, y + CARD_H - 32, 14, color, "center", "serif");
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
  const portrait = viewport.portrait;
  const stops = !enabled
    ? [[0, "#282631"], [1, "#1a1820"]]
    : primary
      ? [[0, hot ? "#ffe081" : "#f0cb64"], [1, "#b8892f"]]
      : [[0, hot ? "#433650" : "#2d2439"], [1, hot ? "#271f33" : "#19131f"]];
  shadow(0, hot ? 8 : 4, hot ? 18 : 10, "rgba(0,0,0,.32)", () => gradientRound(x, y, w, h, 9, stops, true));
  strokeRound(x, y, w, h, 9, enabled ? (primary ? "#ffe28a" : "rgba(220,180,70,.55)") : "#47414f", primary ? 2 : 1.5);
  fill("rgba(255,255,255,.12)", x + 2, y + 2, w - 4, Math.max(1, h * .34), 7);
  strokeRound(x + 4, y + 4, w - 8, h - 8, 6, enabled ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.03)", 1);
  const fontSize = portrait ? Math.min(28, Math.max(23, h * .36)) : isTouchLandscape() ? 28 : 17;
  text(label, x + w / 2, y + h / 2 + (portrait ? 9 : isTouchLandscape() ? 10 : 7), fontSize, primary ? C.black : enabled ? C.text : C.muted, "center");
}

function badge(x, y, label, color) {
  const portrait = viewport.portrait;
  const size = portrait ? 19 : 15;
  ctx.font = `700 ${size}px sans-serif`;
  const width = Math.max(portrait ? 58 : 42, ctx.measureText(label).width + (portrait ? 32 : 24));
  const height = portrait ? 40 : 32;
  gradientRound(x - width / 2, y - height / 2, width, height, height / 2, [[0, "#1b1621"], [1, "#08070b"]], true);
  strokeRound(x - width / 2, y - height / 2, width, height, height / 2, color, 1.5);
  text(label, x, y + (portrait ? 7 : 6), size, color, "center");
}

function meter(x, y, w, h, value, c1, c2) {
  fill("#08070b", x, y, w, h, h / 2);
  strokeRound(x, y, w, h, h / 2, "rgba(238,231,215,.08)", 1);
  const filled = Math.max(0, Math.min(1, value)) * w;
  if (filled <= 0) return;
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, c1);
  g.addColorStop(.58, "#dcb446");
  g.addColorStop(1, c2);
  fill(g, x, y, filled, h, h / 2);
  if (filled > 6) fill("rgba(255,255,255,.16)", x + 2, y + 2, filled - 4, Math.max(1, h * .28), h / 3);
}

function phaseTitle() {
  return {
    betting: "Betting",
    insurance: "Insurance",
    player: game.freePlay ? "Free Play — Everyone Acts" : game.seats[game.activeSeat]?.id === localPlayerId ? "Your Turn" : `${game.seats[game.activeSeat]?.name}'s Turn`,
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

function feltTheme() {
  const e = game.enemy;
  if (e.tiesLose) return ["#4a252d", "#2b141b", "#12090d"];
  if (e.luck) return ["#382956", "#201735", "#0e0a18"];
  if (e.hitFee) return ["#554322", "#2f2513", "#151007"];
  if (e.noDouble || e.noSurrender) return ["#243d50", "#142633", "#081118"];
  return ["#234331", "#12251c", "#07120f"];
}

function houseRules() {
  const e = game.enemy;
  const rules = [];
  if (e.tiesLose) rules.push("Ties count as dealer wins");
  if (e.bjPays65) rules.push("Blackjack pays only 6:5");
  if (e.noSurrender) rules.push("Surrender is forbidden");
  if (e.noInsurance) rules.push("Insurance is forbidden");
  if (e.noDouble) rules.push("Doubling down is forbidden");
  if (e.dealerPeek === false) rules.push("Dealer does not peek for blackjack");
  if (e.hitFee) rules.push(`Each hit costs ${e.hitFee} gold`);
  if (e.hitsSoft17 !== false) rules.push("Dealer hits soft 17");
  if (!rules.length) rules.push("Standard dungeon blackjack rules");
  return rules.slice(0, 7);
}

function playerRankIcon(seat) {
  if ((game?.seats?.length || 0) < 2) return "";
  const values = game.seats.map((s) => Number(s.profit) || 0);
  const value = Number(seat.profit) || 0;
  if (value === Math.max(...values) && values.some((v) => v < value)) return "♛ ";
  if (value === Math.min(...values) && values.some((v) => v > value)) return "△ ";
  return "";
}

function fitLabel(value, maxWidth, size) {
  let result = String(value);
  ctx.font = `700 ${size}px sans-serif`;
  while (result.length > 3 && ctx.measureText(result).width > maxWidth) result = `${result.slice(0, -2)}…`;
  return result;
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

function gradientRound(x, y, w, h, r, stops, vertical = false) {
  const g = vertical ? ctx.createLinearGradient(x, y, x, y + h) : ctx.createLinearGradient(x, y, x + w, y + h);
  stops.forEach(([pos, color]) => g.addColorStop(pos, color));
  fill(g, x, y, w, h, r);
}

function shadow(offsetX, offsetY, blur, color, drawFn) {
  ctx.save();
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  drawFn();
  ctx.restore();
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
    x: cssX / viewport.scale - viewport.contentX,
    y: cssY / viewport.scale - viewport.contentY
  };
}

function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function layoutW() {
  return viewport.logicalW || W;
}

function layoutH() {
  return viewport.logicalH || H;
}

function isTouchLandscape() {
  return !viewport.portrait && viewport.cssH <= 540 && viewport.cssW <= 1100;
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
  viewport.portrait = cssH > cssW * 1.12;
  if (viewport.portrait) {
    viewport.scale = Math.min(cssW / PORTRAIT_W, cssH / PORTRAIT_MIN_H);
    viewport.surfaceW = cssW / viewport.scale;
    viewport.surfaceH = cssH / viewport.scale;
    viewport.logicalW = PORTRAIT_W;
    viewport.logicalH = viewport.surfaceH;
    viewport.contentX = (viewport.surfaceW - viewport.logicalW) / 2;
    viewport.contentY = 0;
  } else {
    viewport.scale = Math.min(cssW / LANDSCAPE_MIN_W, cssH / H);
    viewport.surfaceW = cssW / viewport.scale;
    viewport.surfaceH = cssH / viewport.scale;
    viewport.logicalW = viewport.surfaceW;
    viewport.logicalH = H;
    viewport.contentX = 0;
    viewport.contentY = (viewport.surfaceH - viewport.logicalH) / 2;
  }
}

function drawStatsOverlay() {
  const seat = game?.seats.find((s) => s.id === statsPlayerId);
  if (!seat) { statsPlayerId = ""; return; }
  buttons = [];
  const lw = layoutW(), lh = layoutH();
  const w = Math.min(viewport.portrait ? 650 : 620, lw - 60);
  const h = viewport.portrait ? 620 : 470;
  const x = (lw - w) / 2, y = Math.max(45, (lh - h) / 2);
  fill("rgba(0,0,0,.72)", 0, 0, lw, lh);
  gradientRound(x, y, w, h, 18, [[0, "#302640"], [1, "#15101c"]], true);
  strokeRound(x, y, w, h, 18, C.goldDim, 2);
  text(`${playerRankIcon(seat)}${seat.name}`, x + 34, y + 58, viewport.portrait ? 34 : 28, C.gold, "left", "serif");
  const profit = Number(seat.profit) || 0;
  text(`Total ${profit >= 0 ? "+" : ""}${profit}g`, x + w - 34, y + 58, 23, profit >= 0 ? C.green : C.red, "right");
  const gx = x + 40, gy = y + 115, gw = w - 80, gh = h - 205;
  fill("rgba(0,0,0,.28)", gx, gy, gw, gh, 12);
  strokeRound(gx, gy, gw, gh, 12, "rgba(238,231,215,.14)", 1);
  const history = seat.profitHistory?.length ? seat.profitHistory : [0];
  const lo = Math.min(0, ...history), hi = Math.max(0, ...history), range = Math.max(1, hi - lo);
  const zeroY = gy + gh - ((0 - lo) / range) * gh;
  ctx.strokeStyle = "rgba(238,231,215,.18)"; ctx.beginPath(); ctx.moveTo(gx, zeroY); ctx.lineTo(gx + gw, zeroY); ctx.stroke();
  ctx.strokeStyle = profit >= 0 ? C.green : C.red; ctx.lineWidth = 4; ctx.beginPath();
  history.forEach((v, i) => {
    const px = gx + (history.length === 1 ? gw / 2 : i * gw / (history.length - 1));
    const py = gy + gh - ((v - lo) / range) * gh;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
  ctx.stroke();
  text(`${history.length - 1} completed round${history.length === 2 ? "" : "s"}`, x + 40, y + h - 112, 17, C.muted);
  addButton(x + w / 2 - 100, y + h - 75, 200, 48, "Close", () => statsPlayerId = "");
}

function drawRulesOverlay() {
  buttons = [];
  const lw = layoutW(), lh = layoutH(), w = Math.min(650, lw - 60), h = viewport.portrait ? 660 : 510;
  const x = (lw - w) / 2, y = Math.max(40, (lh - h) / 2);
  fill("rgba(0,0,0,.72)", 0, 0, lw, lh);
  gradientRound(x, y, w, h, 18, [[0, "#302640"], [1, "#15101c"]], true);
  strokeRound(x, y, w, h, 18, game.enemy.color, 3);
  text("HOUSE RULES", lw / 2, y + 60, 31, C.gold, "center", "serif");
  text(game.enemy.name, lw / 2, y + 101, 22, C.text, "center");
  const rules = houseRules();
  rules.forEach((rule, i) => {
    fill("rgba(238,231,215,.055)", x + 36, y + 132 + i * 54, w - 72, 42, 8);
    text(`• ${rule}`, x + 54, y + 160 + i * 54, viewport.portrait ? 19 : 17, C.text);
  });
  addButton(x + w / 2 - 100, y + h - 72, 200, 48, "Close", () => rulesOpen = false);
}

function drawRelicsOverlay() {
  buttons = [];
  const lw = layoutW(), lh = layoutH(), portrait = viewport.portrait;
  const x = 30, y = 40, w = lw - 60, h = lh - 80;
  fill("rgba(0,0,0,.76)", 0, 0, lw, lh);
  gradientRound(x, y, w, h, 18, [[0, "#302640"], [1, "#111018"]], true);
  strokeRound(x, y, w, h, 18, C.goldDim, 2);
  text("RELIC COLLECTION", lw / 2, y + 58, portrait ? 34 : 31, C.gold, "center", "serif");
  const perPage = portrait ? 6 : 8;
  const pages = Math.max(1, Math.ceil(game.relics.length / perPage));
  relicPage = clamp(relicPage, 0, pages - 1);
  const shown = game.relics.slice(relicPage * perPage, relicPage * perPage + perPage);
  const cols = portrait ? 1 : 2;
  const colW = (w - 80 - (cols - 1) * 22) / cols;
  shown.forEach((r, i) => drawRelicRow(r, x + 40 + (i % cols) * (colW + 22), y + 112 + Math.floor(i / cols) * (portrait ? 110 : 105), colW));
  if (!shown.length) text("No relics yet.", lw / 2, y + 180, 22, C.muted, "center");
  addButton(x + 40, y + h - 68, 120, 44, "Previous", () => relicPage--, false, relicPage > 0);
  text(`${relicPage + 1}/${pages}`, lw / 2, y + h - 40, 17, C.muted, "center");
  addButton(x + w - 160, y + h - 68, 120, 44, relicPage + 1 < pages ? "Next" : "Close", () => relicPage + 1 < pages ? relicPage++ : relicsOpen = false);
}
