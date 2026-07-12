import { GuestPeer, HostPeer, createLobbyCode, createSupabaseClient, normalizeLobbyCode } from "./webrtc.js";

const W = 1280;
const H = 800;
const PORTRAIT_W = 760;
const PORTRAIT_MIN_H = 1470;
const LANDSCAPE_MIN_W = 1180;
const FPS = 60;
const APP_VERSION = "0.1.0";
const MIN_BET = 1;
const MAX_BET = 500;
// Match the actual generated floor card-back asset size: 280x420, or 2:3.
// The card is displayed smaller in gameplay, but every front, back, glow, and
// outline uses this asset-derived shape instead of a separate padded frame.
const CARD_ASSET_W = 280;
const CARD_ASSET_H = 420;
const CARD_W = 90;
const CARD_H = Math.round(CARD_W * CARD_ASSET_H / CARD_ASSET_W);
const MAX_PLAYERS = 4;
const hostId = "host";
const LOAN_AMOUNT = 100;
const LOAN_INTEREST = 25;
const LOAN_INTEREST_RATE_PER_ROUND = .15;
const LOAN_WINNING_PAYMENT_RATE = .1;
const DEATH_WARP_MS = 1000;
const DEATH_SILENCE_MS = 900;
const DEATH_REVERSE_FADE_MS = 5200;
const FLOORS = 10;
const AUDIO_CACHE_BUST = Date.now().toString(36);

const rarityTiers = [
  { key: "common", name: "Common", color: "#b9c0c7", scale: 1 },
  { key: "uncommon", name: "Uncommon", color: "#54d66a", scale: 1.35 },
  { key: "rare", name: "Rare", color: "#42a5ff", scale: 1.75 },
  { key: "epic", name: "Epic", color: "#b65cff", scale: 2.25 },
  { key: "legendary", name: "Legendary", color: "#ff9f2f", scale: 3 },
  { key: "mythic", name: "Mythic", color: "#ff4e72", scale: 3.8 }
];

const musicTracks = {
  menu: "menu_theme.mp3",
  floors: [
    "floor_01_lobby_tables.mp3",
    "floor_02_slots_and_side_bets.mp3",
    "floor_03_security_checkpoint.mp3",
    "floor_04_bone_lounge.mp3",
    "floor_05_vault_hall.mp3",
    "floor_06_mirror_casino.mp3",
    "floor_07_dragon_tables.mp3",
    "floor_08_clockwork_pit.mp3",
    "floor_09_black_felt.mp3",
    "floor_10_penthouse.mp3"
  ],
  bosses: [
    "boss_01_floor_01.mp3",
    "boss_02_floor_02.mp3",
    "boss_03_floor_03.mp3",
    "boss_04_floor_04.mp3",
    "boss_05_floor_05.mp3",
    "boss_06_floor_06.mp3",
    "boss_07_floor_07.mp3",
    "boss_08_floor_08.mp3",
    "boss_09_floor_09.mp3",
    "boss_10_floor_10.mp3"
  ]
};

const floorArtIds = [
  "floor_01_lobby_tables",
  "floor_02_slots_and_side_bets",
  "floor_03_security_checkpoint",
  "floor_04_bone_lounge",
  "floor_05_vault_hall",
  "floor_06_mirror_casino",
  "floor_07_dragon_tables",
  "floor_08_clockwork_pit",
  "floor_09_black_felt",
  "floor_10_penthouse"
];

const mapNodeArtFiles = {
  start: "art/floors/shared/start_marker.png",
  elevator: "art/floors/shared/elevator.png",
  tableCommon: "art/floors/shared/table_common.png",
  tableUncommon: "art/floors/shared/table_uncommon.png",
  tableRare: "art/floors/shared/table_rare.png",
  tableEpic: "art/floors/shared/table_epic.png",
  tableLegendary: "art/floors/shared/table_legendary.png",
  tableMythic: "art/floors/shared/table_mythic.png",
  routeLine: "art/floors/shared/route_line.png"
};

floorArtIds.forEach((id, index) => {
  const floor = String(index + 1).padStart(2, "0");
  mapNodeArtFiles[`floor${floor}:background`] = `art/floors/${id}/background.png`;
  mapNodeArtFiles[`floor${floor}:table`] = `art/floors/${id}/table.png`;
  mapNodeArtFiles[`floor${floor}:bossTable`] = `art/floors/${id}/boss_table.png`;
  mapNodeArtFiles[`floor${floor}:bossPortrait`] = `art/floors/${id}/boss_portrait.png`;
  mapNodeArtFiles[`floor${floor}:elevator`] = `art/floors/${id}/elevator.png`;
  mapNodeArtFiles[`floor${floor}:decoration`] = `art/floors/${id}/decoration.png`;
});

const tableSceneArtFiles = {};
floorArtIds.forEach((id, index) => {
  const floor = String(index + 1).padStart(2, "0");
  tableSceneArtFiles[`floor${floor}:background`] = `art/tables/${id}/background.png`;
  tableSceneArtFiles[`floor${floor}:table`] = `art/tables/${id}/table.png`;
  tableSceneArtFiles[`floor${floor}:bossTable`] = `art/tables/${id}/boss_table.png`;
  tableSceneArtFiles[`floor${floor}:decoration`] = `art/tables/${id}/decoration.png`;
});

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
const localDeviceId = getOrCreateDeviceId();
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

let appScene = "splash";
let role = "solo";
let localPlayerId = hostId;
let peer = null;
let game = null;
let buttons = [];
let hover = { x: -1, y: -1 };
let pointerStart = null;
let last = performance.now();
let musicStarted = false;
let musicPausedForFocus = false;
let audio = null;
let deathWarpAudio = null;
let heartbeatAudio = null;
let audioCtx = null;
let audioSource = null;
let currentMusicPath = "";
let currentMusicFallbackPath = "";
let musicFilter = null;
let musicDistortion = null;
let musicGain = null;
let musicDeathMode = false;
let musicDeathStarted = 0;
let musicDeathLastHeartbeat = 0;
let musicDeathWarpPlayed = false;
let deathReverseSource = null;
let deathReverseGain = null;
let flash = "";
let flashTimer = 0;
let toastTimer = 0;
let lastRelicName = "";
let menuOpen = false;
let cardAnimations = [];
let seenCardIds = new Set();
let statsPlayerId = "";
let handCarousel = {};
let handCarouselAnim = {};
let handCarouselActiveIndex = {};
let rulesOpen = false;
let relicsOpen = false;
let logOpen = false;
let relicPage = 0;
let inspectedNodeId = "";
let mapInfoDetail = null;
let signalKind = "";
let developerModeUnlocked = false;
let developerPanelOpen = false;
let developerTapTimes = [];
let developerSplitLimit = clamp(Number(localStorage.getItem("dungeon-dev-split-limit")) || 8, 4, 12);
const modeLabels = {
  classic: "Classic Turns",
  freePlay: "Free Play",
  freeForAll: "Free For All"
};
const savedMode = localStorage.getItem("dungeon-mode");
let modePreference = modeLabels[savedMode] ? savedMode : (localStorage.getItem("dungeon-free-play") === "true" ? "freePlay" : "classic");
const LEADERBOARD_KEY = "dungeon-leaderboard-v1";
const LEADERBOARD_MAX = 50;
const LEADERBOARD_VISIBLE = 5;
const LEADERBOARD_REFRESH_MS = 15000;
const artPreference = "handdrawn";
const handdrawnAssetFiles = {
  splashBackground: "art/ui/splash_background.png",
  mainMenuBackground: "art/ui/main_menu_background.png",
  frame: "art/ui/frame.png",
  divider: "art/ui/divider.png",
  token: "art/ui/token.png",
  chip: "art/ui/chip.png",
  goldMark: "art/marks/gold_mark.png",
  debtMark: "art/marks/debt_mark.png",
  backDiamond: "art/cards/back_diamond.png",
  bloodDrop: "art/effects/blood_drop.png",
  bloodSmear: "art/effects/blood_smear.png",
  signatureFlourish: "art/marks/signature_flourish.png",
  heartbeat: "art/effects/heartbeat.png",
  doodle: "art/ui/doodle.png",
  texture: "art/ui/texture.png",
  suitS: "art/suits/suit_S.png",
  suitH: "art/suits/suit_H.png",
  suitD: "art/suits/suit_D.png",
  suitC: "art/suits/suit_C.png",
  glyphPlus: "art/glyphs/glyph_plus.png",
  glyphMinus: "art/glyphs/glyph_minus.png",
  glyphX: "art/glyphs/glyph_x.png",
  glyphSlash: "art/glyphs/glyph_slash.png",
  glyphPercent: "art/glyphs/glyph_percent.png",
  glyphDollar: "art/glyphs/glyph_dollar.png",
  glyphBang: "art/glyphs/glyph_bang.png",
  glyphQuestion: "art/glyphs/glyph_question.png",
  "tableBase:grunt": "art/table_bases/grunt_table_master.png"
};
for (const ch of "0123456789AJQK") handdrawnAssetFiles[`glyph${ch}`] = `art/glyphs/glyph_${ch}.png`;
for (let i = 1; i <= FLOORS; i++) {
  const floor = String(i).padStart(2, "0");
  handdrawnAssetFiles[`floor${floor}CardBack`] = `art/cards/floor_backs/floor_${floor}_card_back.png`;
  handdrawnAssetFiles[`tableMotif:floor${floor}`] = `art/table_bases/motifs/floor_${floor}_motif.png`;
}
const relicAssetFiles = {
  "Lucky Coin": "lucky_coin.png",
  "Double Crown": "double_crown.png",
  "White Flag": "white_flag.png",
  "Charlie's Hand": "charlies_hand.png",
  "Insurance Policy": "insurance_policy.png",
  "Split Mastery": "split_mastery.png",
  "Vampire's Bargain": "vampires_bargain.png",
  "Pawnbroker's Note": "pawnbrokers_note.png",
  "Phoenix Feather": "phoenix_feather.png",
  "Merchant's Ledger": "merchants_ledger.png",
  "Executioner's Mark": "executioners_mark.png",
  "Dragon's Tooth": "dragons_tooth.png",
  "Gambler's Tip": "gamblers_tip.png",
  "Golden Tongue": "golden_tongue.png",
  "Featherfall Charm": "featherfall_charm.png",
  "Quicksilver Glove": "quicksilver_glove.png",
  "Heart of the Deck": "heart_of_the_deck.png",
  "Usurer's Seal": "usurers_seal.png",
  "Tinker's Thimble": "tinkers_thimble.png",
  "Bone Talisman": "bone_talisman.png",
  "Apprentice's Coin": "apprentices_coin.png",
  "Iron Filing": "iron_filing.png",
  "Magistrate's Writ": "magistrates_writ.png",
  "Duelist's Sigil": "duelists_sigil.png",
  "Dealer's Bane": "dealers_bane.png",
  "Cracked Scrying Lens": "cracked_scrying_lens.png",
  "Croesus' Purse": "croesus_purse.png",
  "Hollow Crown": "hollow_crown.png",
  "Sovereign's Chalice": "sovereigns_chalice.png",
  "Auditor's Quill": "auditors_quill.png",
  "Bone-Hand Charm": "bone_hand_charm.png",
  "Notary's Crown": "notarys_crown.png",
  "Crown of Ten Kings": "crown_of_ten_kings.png",
  "Soulforged Fang": "soulforged_fang.png",
  "Rabbit's Foot": "rabbits_foot.png",
  "Four-Leaf Clover": "four_leaf_clover.png",
  "Dice of the Damned": "dice_of_the_damned.png",
  "Coin of the Fates": "coin_of_the_fates.png",
  "Sepulcher Key": "sepulcher_key.png"
};
for (const [name, file] of Object.entries(relicAssetFiles)) {
  handdrawnAssetFiles[`relic:${name}`] = `art/relics/${file}`;
}
for (const [key, file] of Object.entries(mapNodeArtFiles)) {
  handdrawnAssetFiles[`map:${key}`] = file;
}
for (const [key, file] of Object.entries(tableSceneArtFiles)) {
  handdrawnAssetFiles[`tableScene:${key}`] = file;
}
const handdrawnImages = {};
const tintedHanddrawnCache = new Map();
const chromaKeyedAssetCache = new Map();
const paletteShiftedAssetCache = new Map();
loadHanddrawnAssets();
let hpAnimation = null;
let moneyAnimations = [];
let leaderboardClient = null;
let leaderboardOnline = [];
let leaderboardStatus = "Loading global top 5...";
let leaderboardRefreshAt = 0;
let leaderboardRefreshInFlight = false;
let leaderboardSyncInFlight = false;

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

const relicEffectFamilies = [
  ["push", "pushWins"],
  ["blackjack", "bjPays2"],
  ["surrender", "freeSurrender"],
  ["charlie", "fiveCard"],
  ["insurance", "insurance3"],
  ["split", "extraSplit"],
  ["healing", "heal"],
  ["lossRefund", "refund"],
  ["damage", "damageBonus"],
  ["winGold", "chipBonus"],
  ["bustRefund", "bustRefund"],
  ["luck", "luck"],
  ["foresight", "foresightUses"]
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

function calibratedBossHp(floorIndex, playerCount = game?.seats?.length || 1) {
  const floor = floorIndex + 1;
  const base = [
    480, 650, 850, 1080, 1360,
    1700, 2100, 2550, 3050, 3700
  ][Math.min(floorIndex, FLOORS - 1)] || (300 + floor * 190);
  return Math.max(1, Math.ceil(base * houseHpMultiplier(playerCount)));
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
  pointerStart = { ...p, hit: null };
  startAudio();
  if (hpAnimation) {
    hpAnimation = null;
    return;
  }
  const hit = [...buttons].reverse().find((b) => b.enabled !== false && inRect(p, b));
  if (hit) {
    if (hit.carouselSeat) {
      pointerStart.hit = hit;
      return;
    }
    sfx("click");
    hit.onClick();
  }
});
canvas.addEventListener("pointerup", (ev) => {
  if (!pointerStart?.hit?.carouselSeat) {
    pointerStart = null;
    return;
  }
  const p = eventPoint(ev);
  const hit = pointerStart.hit;
  const dx = p.x - pointerStart.x;
  const direction = Math.abs(dx) > 42
    ? (dx < 0 ? 1 : -1)
    : (p.x < hit.x + hit.w / 2 ? -1 : 1);
  const next = clamp(hit.selected + direction, 0, hit.count - 1);
  if (next !== hit.selected) {
    sfx("click");
    setHandCarousel(hit.carouselSeat, next, hit.count);
  }
  pointerStart = null;
});
canvas.addEventListener("pointercancel", () => {
  pointerStart = null;
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
  if (key === "enter") action(game?.phase === "map" ? "readyMap" : game?.phase === "betting" ? "ready" : "continue");
  if (key === "m") toggleMusic();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseMusicForFocus();
  else resumeMusicForFocus();
});
window.addEventListener("blur", pauseMusicForFocus);
window.addEventListener("focus", resumeMusicForFocus);

requestAnimationFrame(tick);
joinFromSharedLink();
resizeCanvas();
void refreshLeaderboard();

function tick(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (flashTimer > 0) flashTimer -= dt;
  cardAnimations = cardAnimations.filter((a) => now < a.start + a.duration + 850);
  moneyAnimations = moneyAnimations.filter((a) => now < a.start + a.duration + 180);
  if (hpAnimation && now > hpAnimation.start + hpAnimation.duration + 250) hpAnimation = null;
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
  if (game?.phase === "dealerReveal" && role !== "guest") {
    game.dealerTimer -= dt;
    if (game.dealerTimer <= 0) settleRound();
  }
  if (game?.phase === "floorTransition" && Date.now() - (game.floorTransition?.startedAt || Date.now()) > (game.floorTransition?.duration || 2600)) {
    finishFloorTransition();
  }
  updateMusicMood(now);
  recordLeaderboardIfNeeded();
  if ((!game || appScene === "menu") && Date.now() - leaderboardRefreshAt > LEADERBOARD_REFRESH_MS) {
    void refreshLeaderboard();
  }
  draw();
  requestAnimationFrame(tick);
}

function newGame(players, code = "", mode = modePreference) {
  enemyTemplates = buildCampaign();
  lastRelicName = "";
  menuOpen = false;
  cardAnimations = [];
  seenCardIds = new Set();
  const freeForAll = mode === "freeForAll";
  const seats = players.map((p) => ({
    id: p.id,
    name: p.name,
    gold: freeForAll ? 200 : 0,
    debt: 0,
    loanUsed: false,
    bankrupt: false,
    bet: 25,
    ready: false,
    hands: [],
    active: 0,
    finished: false,
    spectating: false,
    profit: 0,
    profitHistory: [0]
  }));
  game = {
    code,
    mode,
    phase: "map",
    floor: 0,
    gold: 200 + Math.max(0, seats.length - 1) * 100,
    hp: 100 + Math.max(0, seats.length - 1) * 40,
    maxHp: 100 + Math.max(0, seats.length - 1) * 40,
    enemy: cloneEnemy(0, seats.length),
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
    completedRounds: 0,
    dealSeq: 0,
    roundDealCount: 0,
    freePlay: mode !== "classic",
    relicVotes: {},
    loanUsed: false,
    loanDebt: 0,
    loanSeatId: "",
    loanReason: "",
    loanRequiredAmount: MIN_BET,
    loanVotes: {},
    loanSignedAt: 0,
    map: null,
    mapVotes: {},
    mapReady: {},
    currentNodeId: "start",
    selectedNodeId: "",
    activeEncounterId: "",
    clearedNodes: ["start"],
    session: crypto.randomUUID?.() ?? String(Date.now())
  };
  game.map = createFloorMap(0);
  inspectedNodeId = "start-1";
  refreshReachableNodes();
  appScene = "game";
}

function cloneEnemy(index, playerCount = game?.seats?.length || 1) {
  const e = enemyTemplates[Math.min(index, enemyTemplates.length - 1)];
  const hp = Math.max(1, Math.ceil(e.hp * houseHpMultiplier(playerCount)));
  return { ...e, baseHp: e.hp, maxHp: hp, hp, dealerPeek: e.dealerPeek !== false };
}

function houseHpMultiplier(playerCount = 1) {
  return 1 + Math.max(0, playerCount - 1) * .6;
}

function rescaleEnemyForPlayers() {
  if (!game?.enemy) return;
  const nextMax = Math.max(1, Math.ceil((game.enemy.baseHp || game.enemy.maxHp || game.enemy.hp || 1) * houseHpMultiplier(game.seats.length)));
  const ratio = game.enemy.maxHp ? game.enemy.hp / game.enemy.maxHp : 1;
  game.enemy.maxHp = nextMax;
  game.enemy.hp = ratio <= 0 ? 0 : Math.max(1, Math.min(nextMax, Math.ceil(nextMax * ratio)));
  if (game.enemy.isBoss) {
    const floorIndex = Math.max(0, (game.floor || 1) - 1);
    game.enemy.roundDamageCap = Math.max(75, Math.ceil(game.enemy.maxHp * (floorIndex < 3 ? .24 : floorIndex < 7 ? .21 : .18)));
  }
}

function createFloorMap(floorIndex) {
  const floor = floorIndex + 1;
  const palette = floorThemeColor(floorIndex);
  const bossColor = bossTableColor(floorIndex);
  const floorKey = floorAssetKey(floorIndex);
  const rewardPicker = createFloorRewardPicker();
  const node = (id, label, kind, x, y, next = [], threatBoost = 0) => {
    const threat = kind === "boss" ? Math.min(5, 2 + Math.ceil(floor / 3)) : clamp(1 + Math.floor(floorIndex / 2) + threatBoost, 1, 5);
    const rarity = rarityForFloor(floorIndex, threatBoost + (kind === "boss" ? 2 : 0));
    const reward = kind === "start" || kind === "elevator" ? null : createRewardRelic(rarity, rewardPicker());
    const encounter = kind === "table" || kind === "boss" ? createMapEnemy(floorIndex, kind, threat, id) : null;
    const color = kind === "boss" ? bossColor : reward?.rarityColor || palette;
    const assetKey = mapNodeAssetKey(kind, rarity, floorKey);
    return { id, label, kind, x, y, next, threat, rarity, reward, encounter, color, bossColor, assetKey };
  };
  const map = {
    floor,
    theme: floorThemeName(floorIndex),
    color: palette,
    bossColor,
    floorKey,
    backgroundAsset: `map:${floorKey}:background`,
    decorationAsset: `map:${floorKey}:decoration`,
    nodes: [
      node("start", "Start", "start", .07, .50, ["start-1"]),
      node("start-1", "Starter Table", "table", .22, .50, ["top-1", "bottom-1"], 0),
      node("top-1", "Upper Table", "table", .38, .30, ["top-2a", "top-2b"], 1),
      node("bottom-1", "Lower Table", "table", .38, .70, ["bottom-2a", "bottom-2b"], 1),
      node("top-2a", "Skybox Table", "table", .55, .17, ["boss"], 1),
      node("top-2b", "Neon Table", "table", .55, .39, ["boss"], 2),
      node("bottom-2a", "Vault Table", "table", .55, .61, ["boss"], 2),
      node("bottom-2b", "Basement Table", "table", .55, .83, ["boss"], 1),
      node("boss", floorBossName(floorIndex), "boss", .75, .50, ["elevator"]),
      node("elevator", "Elevator", "elevator", .92, .50, [])
    ]
  };
  return map;
}

function createFloorRewardPicker() {
  const owned = new Set((game?.relics || []).map((r) => r.baseName || r.name));
  const usedNames = new Set();
  const usedFamilies = new Set();
  const shuffledPool = shuffle(relicPool.filter((r) => !owned.has(r.name)).map((r) => ({ ...r })));
  const fallbackPool = shuffledPool.length ? shuffledPool : shuffle(relicPool.map((r) => ({ ...r })));

  return () => {
    let candidates = fallbackPool.filter((r) => !usedNames.has(r.name));
    if (!candidates.length) candidates = fallbackPool;

    const distinct = candidates.filter((r) => !relicFamilies(r).some((family) => usedFamilies.has(family)));
    const pool = distinct.length ? distinct : candidates;
    const minOverlap = Math.min(...pool.map((r) => relicFamilyOverlap(r, usedFamilies)));
    const best = pool.filter((r) => relicFamilyOverlap(r, usedFamilies) === minOverlap);
    const pick = { ...best[Math.floor(Math.random() * best.length)] };
    usedNames.add(pick.name);
    relicFamilies(pick).forEach((family) => usedFamilies.add(family));
    return pick;
  };
}

function floorBossName(floorIndex) {
  return [
    "Bramble Bookie",
    "Madam Jackpot",
    "The Velvet Warden",
    "Bone Croupier",
    "Vault Baron",
    "Mirror Marquis",
    "Dragon Banker",
    "Clockwork Pit Boss",
    "Black Felt Marshal",
    "The House"
  ][Math.min(floorIndex, FLOORS - 1)];
}

const bossPhasePool = [
  { id: "soft17", name: "Soft Seventeen", text: "Dealer hits soft 17.", rules: { hitsSoft17: true } },
  { id: "pushesLose", name: "No Pushes", text: "Pushes count as dealer wins.", rules: { tiesLose: true } },
  { id: "blackjack65", name: "Short Blackjack", text: "Blackjack pays only 6:5.", rules: { bjPays65: true } },
  { id: "noSurrender", name: "No Exit", text: "Surrender is forbidden.", rules: { noSurrender: true } },
  { id: "noDouble", name: "No Leverage", text: "Doubling down is forbidden.", rules: { noDouble: true } },
  { id: "noInsurance", name: "No Insurance", text: "Insurance is forbidden.", rules: { noInsurance: true } },
  { id: "noPeek", name: "Blind House", text: "Dealer does not peek for blackjack.", rules: { dealerPeek: false } },
  { id: "hitFeeSmall", name: "Table Toll", text: "Each hit costs 5 gold.", rules: { hitFee: 5 } },
  { id: "hitFeeBig", name: "Premium Toll", text: "Each hit costs 10 gold.", rules: { hitFee: 10 }, minFloor: 3 },
  { id: "lossPain", name: "Blood Stakes", text: "Losing hands deal +25% HP damage.", rules: { lossHpMult: 1.25 } },
  { id: "lossPainBig", name: "Bleeding Stakes", text: "Losing hands deal +50% HP damage.", rules: { lossHpMult: 1.5 }, minFloor: 5 },
  { id: "armored", name: "House Shield", text: "Boss takes 20% less damage.", rules: { bossDamageMult: .8 } },
  { id: "ironVault", name: "Iron Vault", text: "Boss takes 35% less damage.", rules: { bossDamageMult: .65 }, minFloor: 6 },
  { id: "blackjackWeak", name: "Blackjack Weakness", text: "Blackjack deals +35% boss damage.", rules: { blackjackDamageMult: 1.35 }, minFloor: 2 },
  { id: "jackpot", name: "Jackpot Fever", text: "Wins deal +20% boss damage; losses deal +20% HP damage.", rules: { winDamageMult: 1.2, lossHpMult: 1.2 } },
  { id: "standTall", name: "Stand Tall", text: "Standing below 15 is forbidden.", rules: { minStandTotal: 15 }, minFloor: 2 },
  { id: "noHighHit", name: "Frozen Nerves", text: "Hitting on 18+ is forbidden.", rules: { maxHitTotal: 17 }, minFloor: 4 },
  { id: "charlieDealer", name: "House Charlie", text: "Dealer 5-card Charlie beats standing hands.", rules: { dealerCharlie: true }, minFloor: 4 },
  { id: "healingHouse", name: "House Recovers", text: "Boss heals 8 HP after non-winning rounds.", rules: { bossHealOnPlayerLoss: 8 }, minFloor: 3 },
  { id: "goldTax", name: "House Cut", text: "Winning hands pay 10% less gold.", rules: { winGoldMult: .9 }, minFloor: 2 },
  { id: "highRoller", name: "High Roller", text: "Wins and losses are both 25% stronger.", rules: { winDamageMult: 1.25, lossHpMult: 1.25 }, minFloor: 5 }
];

const bossSignaturePhases = [
  { name: "Bramble Shield", text: "Boss takes 15% less damage.", rules: { bossDamageMult: .85 } },
  { name: "Reels Spinning", text: "Wins deal +20% damage, but losses hurt +20%.", rules: { winDamageMult: 1.2, lossHpMult: 1.2 } },
  { name: "Security Lockdown", text: "Doubling down is forbidden.", rules: { noDouble: true } },
  { name: "Bone Debt", text: "Losing hands deal +25% HP damage.", rules: { lossHpMult: 1.25 } },
  { name: "Vault Plating", text: "Boss takes 20% less damage.", rules: { bossDamageMult: .8 } },
  { name: "Mirror Push", text: "Pushes count as dealer wins.", rules: { tiesLose: true } },
  { name: "Dragon Ante", text: "Each hit costs 10 gold.", rules: { hitFee: 10 } },
  { name: "Clockwork Limit", text: "Standing below 15 is forbidden.", rules: { minStandTotal: 15 } },
  { name: "Black Felt Law", text: "Blackjack pays only 6:5.", rules: { bjPays65: true } },
  { name: "Final House Edge", text: "Boss takes 35% less damage and pushes lose.", rules: { bossDamageMult: .65, tiesLose: true } }
];

const bossPhaseNames = [
  ["Opening Bet", "Bramble Spread", "Bookie's Bind"],
  ["Welcome Spin", "Reels Are Spinning", "Jackpot Fever"],
  ["Checkpoint", "Lockdown", "Alarm Protocol"],
  ["Bone Ante", "Grave Odds", "Death's Ledger"],
  ["Vault Door", "Iron Lock", "Sealed Treasury"],
  ["Reflected Bet", "Mirror Rule", "Shattered Odds"],
  ["Dragon's Deal", "Burning Ante", "Hoard Fever"],
  ["First Tick", "Clockwork Table", "Midnight Strike"],
  ["Black Felt", "Marshal's Law", "No Appeal"],
  ["House Rules", "The Deck Answers", "Final Hand"]
];

function bossPhasesForFloor(floorIndex) {
  const names = bossPhaseNames[Math.min(floorIndex, bossPhaseNames.length - 1)];
  const used = new Set();
  const phasePick = (phaseIndex) => {
    const minFloor = Math.max(0, floorIndex - 2);
    const eligible = bossPhasePool.filter((p) => !used.has(p.id) && (p.minFloor == null || floorIndex >= p.minFloor) && (p.maxFloor == null || floorIndex <= p.maxFloor));
    const pool = eligible.length ? eligible : bossPhasePool.filter((p) => !used.has(p.id));
    const weighted = pool.filter((p) => (phaseIndex < 2 || !p.maxFloor) && (p.minFloor || 0) <= floorIndex + phaseIndex + 1 && (p.minFloor || 0) >= minFloor - 3);
    const pickPool = weighted.length ? weighted : pool;
    const pick = pickPool[Math.floor(Math.random() * pickPool.length)] || bossPhasePool[0];
    used.add(pick.id);
    return pick;
  };
  const signature = bossSignaturePhases[Math.min(floorIndex, bossSignaturePhases.length - 1)];
  return [
    { threshold: 1, name: names[0], text: signature.text, rules: { ...signature.rules } },
    { threshold: .66, ...phasePick(1), name: names[1] },
    { threshold: .33, ...phasePick(2), name: names[2] }
  ];
}

function floorThemeName(floorIndex) {
  return [
    "Lobby Tables", "Slots & Side Bets", "Security Checkpoint", "Bone Lounge", "Vault Hall",
    "Mirror Casino", "Dragon Tables", "Clockwork Pit", "Black Felt", "Penthouse"
  ][Math.min(floorIndex, 9)];
}

function floorThemeColor(floorIndex) {
  return ["#4e8a57", "#7f8f9c", "#5872b8", "#b8a06a", "#d1a23c", "#8e78d4", "#d66a32", "#65b8d6", "#2d3448", C.gold][Math.min(floorIndex, 9)];
}

const floorCardPalettes = [
  { dark: "#0a290a", main: "#228722", accent: "#97d897" },
  { dark: "#112222", main: "#317777", accent: "#a2cdcd" },
  { dark: "#291d0a", main: "#a07020", accent: "#dbc194" },
  { dark: "#222211", main: "#777731", accent: "#cdcda2" },
  { dark: "#0a291f", main: "#13966a", accent: "#8ee1c5" },
  { dark: "#0a1f29", main: "#226587", accent: "#97c2d8" },
  { dark: "#291f0a", main: "#876522", accent: "#d8c297" },
  { dark: "#191122", main: "#543177", accent: "#b8a2cd" },
  { dark: "#160f24", main: "#483078", accent: "#b0a1cf" },
  { dark: "#26200d", main: "#7e692a", accent: "#d2c59d" }
];

function floorCardPalette(floorIndex) {
  return floorCardPalettes[clamp(Number(floorIndex) || 0, 0, floorCardPalettes.length - 1)] || floorCardPalettes[0];
}

function bossTableColor(floorIndex) {
  return [
    "#7b3f2a",
    "#8bdcff",
    "#3f5f9f",
    "#b7a06f",
    "#d4a21f",
    "#8d79ff",
    "#d65628",
    "#5ac7e2",
    "#1c2236",
    "#f1c75c"
  ][Math.min(floorIndex, 9)];
}

function floorUiPalette(floorIndex) {
  const base = floorThemeColor(floorIndex);
  const palettes = [
    null,
    {
      accent: "#8bdcff",
      accentDim: "#496372",
      border: "#aebbc5",
      title: "#d8e3e9",
      titleWarm: "#f0f5f8",
      panelTop: "rgba(104,122,136,.38)",
      panelMid: "#151a21",
      panelBottom: "#090c12",
      panelWash: "rgba(180,198,210,.12)",
      primaryTop: "#e7edf1",
      primaryBottom: "#748898",
      primaryStroke: "#f4fbff",
      primaryText: "#09131a",
      buttonHot: "#a9e8ff",
      buttonIdle: "rgba(139,220,255,.34)",
      buttonBottom: "#111721"
    }
  ];
  return palettes[Math.min(floorIndex, 9)] || {
    accent: base,
    accentDim: shade(base, -40),
    border: base,
    title: C.gold,
    titleWarm: C.gold,
    panelTop: hexToRgba(base, .34),
    panelMid: "#15101c",
    panelBottom: "#10151a",
    panelWash: hexToRgba(base, .12),
    primaryTop: "#f0cb64",
    primaryBottom: "#b8892f",
    primaryStroke: "#ffe28a",
    primaryText: C.black,
    buttonHot: lighten(base, .12),
    buttonIdle: hexToRgba(base, .42),
    buttonBottom: "#19131f"
  };
}

function floorAssetKey(floorIndex) {
  const floor = String(clamp(floorIndex, 0, floorArtIds.length - 1) + 1).padStart(2, "0");
  return `floor${floor}`;
}

function mapNodeAssetKey(kind, rarity, floorKey) {
  if (kind === "start") return "map:start";
  if (kind === "elevator") return `map:${floorKey}:elevator`;
  if (kind === "boss") return `map:${floorKey}:bossTable`;
  return `map:${floorKey}:table`;
}

function rarityForFloor(floorIndex, boost = 0) {
  const roll = floorIndex + boost + Math.floor(Math.random() * 2);
  const index = clamp(Math.floor(roll / 2), 0, rarityTiers.length - 1);
  return rarityTiers[index];
}

function createRewardRelic(rarity, baseRelic = null) {
  const base = baseRelic || relicPool[Math.floor(Math.random() * relicPool.length)];
  const scaled = { ...base, baseName: base.name, rarity: rarity.key, rarityName: rarity.name, rarityColor: rarity.color };
  for (const [key, value] of Object.entries(scaled)) {
    if (typeof value === "number" && !["foresightUses"].includes(key)) {
      scaled[key] = value < 1 ? Number(Math.min(.95, value * rarity.scale).toFixed(2)) : Math.max(1, Math.round(value * rarity.scale));
    }
  }
  if (scaled.foresightUses) scaled.foresightUses = Math.max(1, Math.round(scaled.foresightUses + rarity.scale - 1));
  scaled.name = `${rarity.name} ${base.name}`;
  scaled.description = describeRelic(scaled, base.description);
  return scaled;
}

function describeRelic(relic, fallback) {
  const parts = [];
  if (relic.pushWins) parts.push("Pushes count as wins");
  if (relic.bjPays2) parts.push("Blackjack pays 2:1");
  if (relic.freeSurrender) parts.push("Surrender refunds the full bet");
  if (relic.fiveCard) parts.push("5-card Charlie wins");
  if (relic.insurance3) parts.push("Insurance pays 3:1");
  if (relic.extraSplit) parts.push("Aces may be re-split");
  if (relic.heal) parts.push(`Heal ${relic.heal} HP on winning hands`);
  if (relic.refund) parts.push(`Refund ${Math.round(relic.refund * 100)}% of losing bets`);
  if (relic.damageBonus) parts.push(`Deal +${relic.damageBonus} bonus damage on winning rounds`);
  if (relic.chipBonus) parts.push(`Winning hands pay +${relic.chipBonus}g`);
  if (relic.bustRefund) parts.push(`Busts refund ${Math.round(relic.bustRefund * 100)}%`);
  if (relic.luck) parts.push(`+${relic.luck} Luck`);
  if (relic.foresightUses) parts.push(`${relic.foresightUses} deck peek${relic.foresightUses === 1 ? "" : "s"} per run`);
  return parts.length ? `${parts.slice(0, 2).join(". ")}.` : fallback;
}

function createMapEnemy(floorIndex, kind, threat, id) {
  if (kind === "boss") {
    const boss = cloneEnemy(floorIndex);
    boss.name = floorBossName(floorIndex);
    boss.color = bossTableColor(floorIndex);
    boss.title = `Floor ${floorIndex + 1} - Floor Boss`;
    boss.isBoss = true;
    boss.bossPhase = 0;
    boss.bossPhases = bossPhasesForFloor(floorIndex);
    boss.baseHp = calibratedBossHp(floorIndex, 1);
    boss.maxHp = calibratedBossHp(floorIndex);
    boss.hp = boss.maxHp;
    boss.roundDamageCap = Math.max(75, Math.ceil(boss.maxHp * (floorIndex < 3 ? .24 : floorIndex < 7 ? .21 : .18)));
    boss.description = `${boss.description} Boss phases at 66% and 33% HP.`;
    return boss;
  }
  const poolStart = floorIndex < 3 ? 1 : floorIndex < 6 ? 4 : 7;
  const template = enemyTemplates[Math.min(enemyTemplates.length - 2, poolStart + (Math.abs(hashString(id)) % 3))] || enemyTemplates[0];
  const hp = 45 + floorIndex * 18 + threat * 16;
  return {
    ...template,
    name: tableEnemyName(template.name, threat),
    title: `Floor ${floorIndex + 1} - Grunt Table`,
    hp,
    maxHp: hp,
    dealerPeek: template.dealerPeek !== false
  };
}

function tableEnemyName(name, threat) {
  if (threat >= 5) return `Elite ${name}`;
  if (threat >= 4) return `High-Roller ${name}`;
  return name;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

function capitalize(value) {
  const textValue = String(value || "");
  return textValue ? textValue[0].toUpperCase() + textValue.slice(1) : "";
}

function addPlayerSeat(id, name = "") {
  if (!game) return false;
  if (game.seats.some((s) => s.id === id)) return true;
  if (game.seats.length >= MAX_PLAYERS) return false;
  const playerName = name || `Guest ${game.seats.length}`;
  game.seats.push({ id, name: playerName, gold: isFreeForAll() ? 200 : 0, debt: 0, loanUsed: false, bankrupt: false, bet: 25, ready: false, hands: [], active: 0, finished: false, spectating: false, profit: 0, profitHistory: [0] });
  if (!isFreeForAll()) game.gold += 100;
  game.maxHp += 40;
  game.hp += 40;
  rescaleEnemyForPlayers();
  log(`${playerName} joined the table.`);
  return true;
}

function kickPlayer(id) {
  if (role !== "host" || id === hostId || !game) return;
  const index = game.seats.findIndex((s) => s.id === id);
  if (index < 0) return;
  const [removed] = game.seats.splice(index, 1);
  peer?.disconnect(id);
  if (!isFreeForAll()) game.gold = Math.max(0, game.gold - 100);
  game.maxHp = Math.max(100, game.maxHp - 40);
  game.hp = Math.min(game.hp, game.maxHp);
  if (game.activeSeat >= game.seats.length) game.activeSeat = Math.max(0, game.seats.length - 1);
  delete handCarousel[id];
  delete handCarouselAnim[id];
  delete handCarouselActiveIndex[id];
  statsPlayerId = "";
  rescaleEnemyForPlayers();
  log(`${removed.name} was removed from the lobby.`);
  broadcast();
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

function drawCard(faceUp = true, currentTotal = 0, target = "player", dealKind = "deal") {
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
    const dealt = { ...card, up: faceUp, _dealId: `${game.session}:${game.dealSeq}`, _dealDelay: delay, _dealKind: dealKind };
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

  if (game.phase === "loanOffer") {
    if (!canSeeLoanOffer(playerId)) return;
    if (name === "signLoan") {
      if (sharedLoanNeedsVote()) voteLoan(playerId, true);
      else signLoan(playerId);
    }
    if (name === "declineLoan") {
      if (sharedLoanNeedsVote()) voteLoan(playerId, false);
      else declineLoan(playerId);
    }
    return;
  }

  if (game.phase === "map") {
    if (name.startsWith("inspect:")) {
      inspectedNodeId = name.slice(8);
      return;
    }
    if (name.startsWith("select:")) {
      selectMapNode(playerId, name.slice(7));
      return;
    }
    if (name.startsWith("enterMap:")) {
      enterSoloMapNode(playerId, name.slice(9));
      return;
    }
    if (name === "readyMap") {
      readyMapPlayer(playerId);
      return;
    }
    return;
  }

  if (game.phase === "betting") {
    const max = maxBetForSeat(seat);
    const min = max >= MIN_BET ? MIN_BET : 0;
    if (name === "betDown") seat.bet = clamp(seat.bet - 5, min, max);
    if (name === "betUp") seat.bet = clamp(seat.bet + 5, min, max);
    if (name === "minBet") seat.bet = min;
    if (name === "maxBet") {
      seat.bet = safeMaxBetForSeat(seat);
      warnHitFeeReserve(seat, true);
    }
    if (name === "ready") {
      if (!seat.ready && !warnHitFeeReserve(seat, false)) return;
      seat.ready = !seat.ready;
      sfx(seat.ready ? "ready" : "click");
      log(`${seat.name} ${seat.ready ? "is ready" : "is adjusting their bet"}.`);
      if (game.seats.every((s) => s.ready) && game.seats.some((s) => s.bet > 0)) dealRound();
    }
    return;
  }

  if (game.phase === "insurance") {
    const h = seat.hands[0];
    if (name === "insuranceYes" && h && !seat.insuranceAnswered) {
      const cost = Math.floor(seat.bet / 2);
      if (spendGold(seat, cost)) h.insurance = cost;
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
  if (totalBets <= 0) return;
  const sharedRiskBankroll = Math.max(1, Number(game.gold) || 0);
  if (isFreeForAll()) {
    for (const s of game.seats) {
      if (s.bet > seatBankroll(s)) s.bet = Math.max(0, seatBankroll(s));
      s.roundRiskBankroll = Math.max(1, seatBankroll(s));
      if (s.bet > 0) spendGold(s, s.bet);
    }
    if (!game.seats.some((s) => s.bet > 0)) return;
  } else {
    if (game.gold < totalBets) {
      if (game.gold <= 0) triggerBankruptcyDeath("You are out of gold", loanSigner());
      return;
    }
    game.gold -= totalBets;
  }
  if (!isFreeForAll() && (game.enemy.hitFee || 0) > game.gold) {
    triggerBankruptcyDeath("You cannot pay the table toll", loanSigner(), game.enemy.hitFee || MIN_BET);
    sfx("lose");
    broadcast();
    return;
  }
  game.activeSeat = 0;
  game.dealer = [];
  game.roundDealCount = 0;
  for (const s of game.seats) {
    s.hands = s.bet > 0 ? [newHand(s.bet, isFreeForAll() ? s.roundRiskBankroll : sharedRiskBankroll)] : [];
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

function newHand(bet, riskBankroll = 0) {
  return { cards: [], bet, riskBankroll, status: "playing", doubled: false, split: false, splitAces: false, insurance: 0 };
}

function currentRiskBankroll(seat, totalBet = 0) {
  const wallet = isFreeForAll() ? seatBankroll(seat) : Number(game.gold) || 0;
  return Math.max(1, wallet + Math.max(0, totalBet));
}

function addToHand(hand, target, dealKind = "deal") {
  hand.cards.push(drawCard(true, handTotal(hand), target, dealKind));
}

function peekCheck() {
  const dealerBj = game.enemy.dealerPeek && isBlackjackCards(game.dealer);
  if (dealerBj) {
    game.dealer[1].up = true;
    game.phase = "dealerReveal";
    game.dealerTimer = 1.25;
    log("Dealer reveals blackjack.");
    sfx("flip");
    broadcast();
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
  const maxHitTotal = Number(bossRuleValue("maxHitTotal", 0)) || 0;
  if (maxHitTotal && handTotal(hand) > maxHitTotal) return flashMsg(`Boss rule: cannot hit above ${maxHitTotal}`);
  const fee = game.enemy.hitFee || 0;
  if (fee) {
    if (!spendGold(seat, fee)) {
      if (isFreeForAll()) {
        updateSeatBankruptcy(seat);
        triggerBankruptcyDeath(`${seat.name} cannot pay the hit toll`, seat, fee);
        broadcast();
        return;
      }
      triggerBankruptcyDeath("You cannot pay the hit toll", seat, fee);
      sfx("lose");
      broadcast();
      return;
    }
  }
  addToHand(hand, "player", "hit");
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
  const minStandTotal = Number(bossRuleValue("minStandTotal", 0)) || 0;
  if (h && minStandTotal && handTotal(h) < minStandTotal) return flashMsg(`Boss rule: stand at ${minStandTotal}+`);
  if (h) h.status = "stand";
  advanceHand(seatIndex);
}

function selectMapNode(playerId, nodeId) {
  refreshReachableNodes();
  const node = getMapNode(nodeId);
  if (!node || !node.reachable || node.kind === "start" || node.kind === "elevator") return;
  game.mapVotes ||= {};
  game.mapReady ||= {};
  game.mapVotes[playerId] = nodeId;
  game.mapReady[playerId] = false;
  game.selectedNodeId = nodeId;
  inspectedNodeId = nodeId;
  const seat = game.seats.find((s) => s.id === playerId);
  log(`${seat?.name || "A player"} votes for ${node.label}.`);
}

function readyMapPlayer(playerId) {
  refreshReachableNodes();
  const reachable = reachableMapNodes().filter((n) => n.kind !== "elevator");
  if (reachable.length === 1 && !game.mapVotes?.[playerId]) {
    selectMapNode(playerId, reachable[0].id);
  }
  const voted = game.mapVotes?.[playerId];
  if (!voted || !getMapNode(voted)?.reachable) return flashMsg("Choose a reachable table first");
  game.mapReady ||= {};
  game.mapReady[playerId] = !game.mapReady[playerId];
  const seat = game.seats.find((s) => s.id === playerId);
  log(`${seat?.name || "A player"} ${game.mapReady[playerId] ? "is ready to travel" : "is reconsidering the route"}.`);
  const voters = game.seats.filter((s) => !s.spectating);
  if (voters.length && voters.every((s) => game.mapReady?.[s.id])) travelToVotedNode();
}

function travelToVotedNode() {
  const counts = new Map();
  for (const s of game.seats.filter((seat) => !seat.spectating)) {
    const vote = game.mapVotes?.[s.id];
    if (vote && getMapNode(vote)?.reachable) counts.set(vote, (counts.get(vote) || 0) + 1);
  }
  let winner = "";
  let best = -1;
  for (const [nodeId, count] of counts) {
    if (count > best) {
      winner = nodeId;
      best = count;
    }
  }
  if (!winner) return;
  startMapEncounter(winner);
}

function startMapEncounter(nodeId) {
  const node = getMapNode(nodeId);
  if (!node || !node.encounter) return;
  game.activeEncounterId = nodeId;
  game.enemy = { ...node.encounter, hp: node.encounter.hp, maxHp: node.encounter.maxHp || node.encounter.hp };
  applyBossPhaseRules(true);
  game.mapVotes = {};
  game.mapReady = {};
  game.selectedNodeId = nodeId;
  resetRound();
  log(`The party sits at ${node.label}. Reward: ${node.reward?.name || "none"}.`);
}

function activeBossPhaseRules(enemy = game?.enemy) {
  if (!enemy?.isBoss || !Array.isArray(enemy.bossPhases)) return {};
  const phaseIndex = clamp(Number(enemy.bossPhase) || 0, 0, enemy.bossPhases.length - 1);
  return enemy.bossPhases.slice(0, phaseIndex + 1).reduce((rules, phase) => ({ ...rules, ...(phase.rules || {}) }), {});
}

function bossRuleValue(key, fallback = null) {
  const rules = activeBossPhaseRules();
  return Object.prototype.hasOwnProperty.call(rules, key) ? rules[key] : fallback;
}

function applyBossPhaseRules(initial = false) {
  const enemy = game?.enemy;
  if (!enemy?.isBoss || !Array.isArray(enemy.bossPhases) || !enemy.maxHp) return false;
  const ratio = enemy.hp / enemy.maxHp;
  let nextPhase = 0;
  enemy.bossPhases.forEach((phase, i) => {
    if (ratio <= phase.threshold) nextPhase = i;
  });
  const changed = nextPhase !== (Number(enemy.bossPhase) || 0);
  enemy.bossPhase = nextPhase;
  const rules = activeBossPhaseRules(enemy);
  for (const [key, value] of Object.entries(rules)) {
    if (["lossHpMult", "bossDamageMult", "blackjackDamageMult", "exact21DamageMult", "winDamageMult", "bossHealOnPlayerLoss", "winGoldMult", "minStandTotal", "maxHitTotal", "dealerCharlie"].includes(key)) continue;
    if (key === "hitFee") enemy.hitFee = Math.max(Number(enemy.hitFee) || 0, Number(value) || 0);
    else enemy[key] = value;
  }
  if (initial || changed) {
    const phase = enemy.bossPhases[nextPhase];
    if (phase) {
      log(`${enemy.name} phase ${nextPhase + 1}: ${phase.name}. ${phase.text}`);
      notify(`${phase.name}: ${phase.text}`);
      if (!initial) {
        sfx("phase");
        flashMsg(`${phase.name}: ${phase.text}`);
      }
    }
  }
  return changed;
}

function completeMapEncounter() {
  const node = getMapNode(game.activeEncounterId);
  if (!node) return;
  game.clearedNodes = [...new Set([...(game.clearedNodes || []), node.id])];
  game.currentNodeId = node.id;
  if (node.reward) gainRelic(node.reward);
  game.activeEncounterId = "";
  if (node.kind === "boss") {
    if (game.floor >= FLOORS - 1) {
      game.phase = "victory";
      log("The Penthouse boss folds. The climb is won.");
      return;
    }
    const fromFloor = game.floor + 1;
    const toFloor = fromFloor + 1;
    game.phase = "floorTransition";
    game.floorTransition = { from: fromFloor, to: toFloor, startedAt: Date.now(), duration: 2800 };
    sfx("floorClear");
    log(`Floor ${fromFloor} cleared. Elevator climbing to Floor ${toFloor}.`);
  } else {
    const next = (node.next || []).find((id) => getMapNode(id)?.kind === "boss");
    inspectedNodeId = next || node.next?.[0] || node.id;
    game.phase = "map";
  }
  game.mapVotes = {};
  game.mapReady = {};
  game.selectedNodeId = "";
  game.seats.forEach((s) => {
    s.spectating = false;
    s.ready = false;
    s.finished = false;
    s.hands = [];
  });
  if (game.phase === "map") refreshReachableNodes();
}

function finishFloorTransition() {
  if (!game || game.phase !== "floorTransition") return;
  const targetFloor = clamp((game.floorTransition?.to || game.floor + 2) - 1, 0, FLOORS - 1);
  game.floor = targetFloor;
  game.map = createFloorMap(game.floor);
  game.currentNodeId = "start";
  game.clearedNodes = ["start"];
  inspectedNodeId = "start-1";
  game.floorTransition = null;
  game.phase = "map";
  if (game.relicPopup) game.relicPopup.shownAt = Date.now();
  log(`Elevator doors open onto Floor ${game.floor + 1}: ${game.map.theme}.`);
  refreshReachableNodes();
}

function gainRelic(relic) {
  if (!relic) return;
  game.relics.push(relic);
  game.foresightUsesLeft += relic.foresightUses || 0;
  lastRelicName = relic.name;
  game.relicPopup = { relic, shownAt: Date.now() };
  notify(`${relic.name}: ${relic.description}`);
  log(`Gained relic: ${relic.name}.`);
}

function getMapNode(nodeId) {
  return game?.map?.nodes?.find((n) => n.id === nodeId);
}

function reachableMapNodes() {
  refreshReachableNodes();
  return game?.map?.nodes?.filter((n) => n.reachable) || [];
}

function refreshReachableNodes() {
  if (!game?.map) return;
  const current = getMapNode(game.currentNodeId || "start");
  const nextIds = new Set(current?.next || []);
  game.map.nodes.forEach((node) => {
    node.cleared = (game.clearedNodes || []).includes(node.id);
    node.current = node.id === game.currentNodeId;
    node.reachable = nextIds.has(node.id) && !node.cleared;
    node.locked = !node.cleared && !node.current && !node.reachable;
  });
}

function doubleDown(seatIndex) {
  const seat = game.seats[seatIndex];
  const h = activeHand(seat);
  if (!h || h.cards.length !== 2 || game.enemy.noDouble || !spendGold(seat, h.bet)) return flashMsg("Double unavailable");
  h.bet *= 2;
  h.riskBankroll = Math.max(Number(h.riskBankroll) || 0, currentRiskBankroll(seat, h.bet));
  h.doubled = true;
  addToHand(h, "player");
  h.status = isBust(h) ? "bust" : "stand";
  sfx(isBust(h) ? "bust" : "deal");
  advanceHand(seatIndex);
}

function split(seatIndex) {
  const seat = game.seats[seatIndex];
  const h = activeHand(seat);
  if (!h || h.cards.length !== 2 || cardValue(h.cards[0]) !== cardValue(h.cards[1]) || seatBankroll(seat) < h.bet || seat.hands.length >= maxSplitHands()) {
    return flashMsg("Split unavailable");
  }
  if (h.splitAces && h.cards[0].rank === "A" && !has("extraSplit")) return flashMsg("Aces cannot be re-split");
  spendGold(seat, h.bet);
  const moved = h.cards.pop();
  const splitRiskBankroll = Math.max(Number(h.riskBankroll) || 0, currentRiskBankroll(seat, h.bet * 2));
  h.riskBankroll = splitRiskBankroll;
  const h2 = newHand(h.bet, splitRiskBankroll);
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
  const hpBefore = game.hp;
  let net = 0;
  let localNet = 0;
  let winHands = 0;
  let grossLoss = 0;
  let lifeLoss = 0;
  let bossDamage = 0;
  const results = [];
  for (const seat of game.seats) {
    let seatNet = 0;
    seat.loanPaidThisRound = 0;
    for (const h of seat.hands) {
      const result = settleHand(seat, h, dealerTotal, dealerBj);
      net += result.net;
      seatNet += result.net;
      grossLoss += result.grossLoss || 0;
      lifeLoss += result.lifeLoss || 0;
      bossDamage += result.bossDamage || Math.max(0, result.net);
      if (result.net > 0) winHands++;
      results.push(`${seat.name}: ${result.msg}`);
    }
    if (seat.loanPaidThisRound > 0) results.push(`${seat.name}: loan payment -${seat.loanPaidThisRound}g`);
    if (seat.id === localPlayerId) localNet = seatNet;
    seat.profit = (Number(seat.profit) || 0) + seatNet;
    seat.profitHistory = [...(seat.profitHistory || [0]), seat.profit].slice(-40);
  }
  game.completedRounds = (Number(game.completedRounds) || 0) + 1;
  const bankruptSeat = updateFreeForAllBankruptcy(results);
  if (net > 0) {
    const bonus = relicSum("damageBonus");
    const rawDamage = Math.max(1, Math.round(bossDamage + bonus));
    const damageCap = game.enemy?.isBoss ? Number(game.enemy.roundDamageCap || 0) : 0;
    const damage = damageCap ? Math.min(rawDamage, damageCap) : rawDamage;
    game.enemy.hp = Math.max(0, game.enemy.hp - damage);
    applyBossPhaseRules(false);
    const heal = relicSum("heal") * Math.max(1, winHands);
    if (heal) game.hp = Math.min(game.maxHp, game.hp + heal);
    sfx("win");
  }
  if (grossLoss > 0) {
    const dmg = Math.min(game.hp, Math.max(1, Math.round(lifeLoss)));
    game.hp -= dmg;
    results.push(`Blood toll: -${dmg} HP`);
    if (net <= 0) sfx("lose");
  } else if (net <= 0) {
    sfx("push");
  }
  if (net <= 0) {
    const bossHeal = Number(bossRuleValue("bossHealOnPlayerLoss", 0)) || 0;
    if (bossHeal && game.enemy?.hp > 0) {
      game.enemy.hp = Math.min(game.enemy.maxHp, game.enemy.hp + bossHeal);
      results.push(`${game.enemy.name} recovers ${bossHeal} HP`);
    }
  }
  if (hpBefore > game.hp) queueHpAnimation(hpBefore, game.hp, game.maxHp);
  if ((isFreeForAll() ? localNet : net) !== 0) queueMoneyAnimation(isFreeForAll() ? localNet : net);
  game.roundNet = net;
  results.slice(0, 6).reverse().forEach(log);
  if (sharedBankrupt()) {
    triggerBankruptcyDeath("You are out of gold", loanSigner());
  } else if (bankruptSeat) {
    triggerBankruptcyDeath(`${bankruptSeat.name} is bankrupt`, bankruptSeat);
  } else if (freeForAllAllOut()) {
    triggerBankruptcyDeath("Every bankroll is gone", loanSigner());
  } else {
    game.phase = game.hp <= 0 ? "defeat" : "roundOver";
  }
  broadcast();
}

function enterSoloMapNode(playerId, nodeId) {
  if (game.seats.filter((s) => !s.spectating).length > 1) return selectMapNode(playerId, nodeId);
  refreshReachableNodes();
  const node = getMapNode(nodeId);
  if (!node || !node.reachable || node.kind === "elevator") return;
  game.mapVotes ||= {};
  game.mapVotes[playerId] = nodeId;
  startMapEncounter(nodeId);
}

function settleHand(seat, h, dealerTotal, dealerBj) {
  const bjMult = has("bjPays2") ? 2 : (game.enemy.bjPays65 ? 1.2 : 1.5);
  const chipBonus = relicSum("chipBonus");
  const pushWins = has("pushWins");
  const cappedRefund = (amount) => Math.max(0, Math.min(amount, h.bet - 1));
  if (h.insurance) {
    if (dealerBj) {
      const insurancePayout = h.insurance * (has("insurance3") ? 4 : 3);
      addGold(seat, insurancePayout, insurancePayout);
    }
  }
  if (h.status === "surrender") {
    const refund = has("freeSurrender") ? h.bet : Math.floor(h.bet / 2);
    addGold(seat, refund, 0);
    const lost = has("freeSurrender") ? 0 : h.bet - refund;
    return lossResultPayload(seat, h, lost, has("freeSurrender") ? "Surrender refunded" : `Surrender -${lost}g`, lost);
  }
  if (isBust(h)) {
    const refund = cappedRefund(Math.floor(h.bet * (relicSum("refund") + relicSum("bustRefund"))));
    addGold(seat, refund, 0);
    return lossResultPayload(seat, h, h.bet - refund, `Bust -${h.bet - refund}g`, h.bet);
  }
  if (isBlackjack(h)) {
    if (dealerBj) {
      if (pushWins) return winResult(seat, h, Math.floor(h.bet * bjMult) + chipBonus, "BJ push wins");
      if (game.enemy.tiesLose) return lossResultPayload(seat, h, h.bet, "BJ tie loses", h.bet);
      addGold(seat, h.bet, 0);
      return { net: 0, grossLoss: 0, msg: "BJ push" };
    }
    return winResult(seat, h, Math.floor(h.bet * bjMult) + chipBonus, "BLACKJACK");
  }
  if (dealerBj) return loseResult(seat, h, "Dealer blackjack");
  if (has("fiveCard") && h.cards.length >= 5 && !isBust(h)) return winResult(seat, h, h.bet + chipBonus, "5-Card Charlie");
  const total = handTotal(h);
  if (dealerTotal > 21) return winResult(seat, h, h.bet + chipBonus, "Dealer bust");
  if (bossRuleValue("dealerCharlie", false) && game.dealer.length >= 5 && dealerTotal <= 21) return loseResult(seat, h, "House Charlie");
  if (total > dealerTotal) return winResult(seat, h, h.bet + chipBonus, `${total} beats ${dealerTotal}`);
  if (total < dealerTotal) return loseResult(seat, h, `${total} loses to ${dealerTotal}`);
  if (pushWins) return winResult(seat, h, h.bet + chipBonus, "Push wins");
  if (game.enemy.tiesLose) return lossResultPayload(seat, h, h.bet, "Tie loses", h.bet);
  addGold(seat, h.bet, 0);
  return { net: 0, grossLoss: 0, msg: `Push ${total}` };
}

function winResult(seat, h, amount, msg) {
  const paidAmount = Math.max(1, Math.round(amount * (Number(bossRuleValue("winGoldMult", 1)) || 1)));
  addGold(seat, h.bet + paidAmount, paidAmount);
  return { net: paidAmount, grossLoss: 0, bossDamage: bossDamageForWin(h, amount), msg: `${msg} +${paidAmount}g` };
}

function lossResultPayload(seat, h, lostAmount, msg, grossLoss = lostAmount) {
  return {
    net: -lostAmount,
    grossLoss,
    lifeLoss: lifeLossForBetLoss(seat, h, Math.max(lostAmount, grossLoss)) * (Number(bossRuleValue("lossHpMult", 1)) || 1),
    msg
  };
}

function bossDamageForWin(hand, amount) {
  let mult = Number(bossRuleValue("bossDamageMult", 1)) || 1;
  mult *= Number(bossRuleValue("winDamageMult", 1)) || 1;
  if (isBlackjack(hand)) mult *= Number(bossRuleValue("blackjackDamageMult", 1)) || 1;
  if (handTotal(hand) === 21) mult *= Number(bossRuleValue("exact21DamageMult", 1)) || 1;
  return Math.max(1, Math.round(amount * mult));
}

function lifeLossForBetLoss(seat, hand, betAtRisk) {
  if (betAtRisk <= 0) return 0;
  const bankroll = Math.max(1, Number(hand.riskBankroll) || currentRiskBankroll(seat, betAtRisk));
  const wager = clamp(betAtRisk, 0, bankroll);
  const floors = Math.max(1, enemyTemplates.length || 1);
  const floorProgress = floors <= 1 ? 0 : clamp((Number(game.floor) || 0) / (floors - 1), 0, 1);
  const remaining = Math.max(0, bankroll - wager);
  const floorRate = .45 + floorProgress * .7;
  const pressure = ((3 * bankroll - 2 * remaining) * floorRate) / (3 * bankroll);
  let damageRate = Math.pow(Math.max(0, pressure), 2.2);
  if (floorProgress > .82 && wager >= bankroll * .98) damageRate = 1.2;
  return Math.max(1, Math.ceil(game.maxHp * clamp(damageRate, .01, 1.25)));
}

function loseResult(seat, h, msg) {
  const refund = Math.max(0, Math.min(Math.floor(h.bet * relicSum("refund")), h.bet - 1));
  addGold(seat, refund, 0);
  return lossResultPayload(seat, h, h.bet - refund, `${msg} -${h.bet - refund}g`, h.bet);
}

function continueAfterRound() {
  if (game.phase === "victory" || game.phase === "defeat") {
    stopDeathAudioClips();
    if (game.code) restartLobbyRun();
    else appScene = "menu";
    return;
  }
  if (game.enemy.hp <= 0) {
    completeMapEncounter();
  } else {
    resetRound();
  }
}

function buyRelic(index) {
  const relic = game.shop[index];
  if (!relic) return;
  const cost = 45 + game.floor * 15;
  const buyer = mySeat() || game.seats[0];
  if (!game.code) {
    if (!spendGold(buyer, cost)) return flashMsg("Not enough gold");
  } else if (!isFreeForAll() && !spendGold(buyer, cost)) {
    return flashMsg("Not enough gold");
  }
  sfx("coinDown");
  gainRelic(relic);
  nextBattle();
}

function nextBattle() {
  game.floor++;
  game.enemy = cloneEnemy(game.floor);
  resetRound();
}

function resetRound() {
  enterBettingRound({ chargeInterest: true });
}

function enterBettingRound({ chargeInterest = false } = {}) {
  game.phase = "betting";
  if (chargeInterest) applyLoanInterest();
  if (sharedBankrupt()) {
    triggerBankruptcyDeath("You are out of gold", loanSigner());
    return;
  }
  game.dealer = [];
  game.roundDealCount = 0;
  cardAnimations = [];
  seenCardIds = new Set();
  game.seats.forEach((s) => {
    updateSeatBankruptcy(s);
    s.ready = false;
    s.hands = [];
    s.finished = false;
    s.active = 0;
    const max = maxBetForSeat(s);
    const min = max >= MIN_BET ? MIN_BET : 0;
    s.bet = s.bankrupt ? 0 : clamp(s.bet, min, max);
    if (s.bankrupt && !canTakeLoan(s)) s.ready = true;
  });
  if (freeForAllAllOut()) {
    game.phase = "defeat";
    log("Every bankroll is gone. The table closes.");
  }
}

function applyLoanInterest() {
  if (!game) return;
  if (isFreeForAll()) {
    for (const seat of game.seats) {
      const debt = Math.max(0, Number(seat.debt) || 0);
      if (debt > 0) {
        const interest = Math.max(1, Math.ceil(debt * LOAN_INTEREST_RATE_PER_ROUND));
        seat.debt += interest;
        log(`${seat.name}'s loan gains ${interest}g interest.`);
      }
    }
    return;
  }
  const debt = Math.max(0, Number(game.loanDebt) || 0);
  if (debt > 0) {
    const interest = Math.max(1, Math.ceil(debt * LOAN_INTEREST_RATE_PER_ROUND));
    game.loanDebt += interest;
    log(`The loan gains ${interest}g interest.`);
  }
}

function chooseRelics() {
  const owned = new Set(game.relics.map((r) => r.name));
  const offered = new Set(game.offeredRelicNames || []);
  let pool = relicPool.filter((r) => !owned.has(r.name) && !offered.has(r.name));
  if (!pool.length) pool = relicPool.filter((r) => !owned.has(r.name));
  const picks = chooseHeterogeneousRelics(pool, 3);
  game.offeredRelicNames = [...new Set([...(game.offeredRelicNames || []), ...picks.map((r) => r.name)])];
  return picks;
}

function chooseHeterogeneousRelics(pool, count) {
  const candidates = shuffle(pool.map((r) => ({ ...r })));
  const picks = [];
  const usedFamilies = new Set();
  for (const relic of candidates) {
    const families = relicFamilies(relic);
    if (families.some((family) => usedFamilies.has(family))) continue;
    picks.push(relic);
    families.forEach((family) => usedFamilies.add(family));
    if (picks.length >= count) return picks;
  }

  const remaining = candidates.filter((r) => !picks.some((pick) => pick.name === r.name));
  while (picks.length < count && remaining.length) {
    remaining.sort((a, b) => relicFamilyOverlap(a, usedFamilies) - relicFamilyOverlap(b, usedFamilies));
    const relic = remaining.shift();
    picks.push(relic);
    relicFamilies(relic).forEach((family) => usedFamilies.add(family));
  }
  return picks;
}

function relicFamilies(relic) {
  return relicEffectFamilies.filter(([, prop]) => Boolean(relic[prop])).map(([family]) => family);
}

function relicFamilyOverlap(relic, usedFamilies) {
  return relicFamilies(relic).filter((family) => usedFamilies.has(family)).length;
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
  newGame([{ id: hostId, name: savedPlayerName("Host") }], code, modePreference);
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
  showSignal("join", "Join Lobby", "Paste a lobby link or enter the 4-letter code.");
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
      playerId: `guest-${localDeviceId}`,
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
    const id = fromId;
    if (!addPlayerSeat(id, cleanPlayerName(msg.name) || guestNameFor(id))) {
      peer?.send({ type: "lobbyFull" }, id);
      peer?.disconnect(id);
      return;
    }
    peer?.send({ type: "welcome", playerId: id }, id);
    broadcast();
  }
  if (msg.type === "action") {
    if (msg.playerId && msg.playerId !== fromId) return;
    applyAction(fromId, msg.action);
    broadcast();
  }
  if (msg.type === "rename") {
    if (msg.playerId && msg.playerId !== fromId) return;
    const seat = game?.seats.find((s) => s.id === fromId);
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
    const previous = game;
    const next = msg.state;
    if (previous?.session && previous.session === next?.session) {
      if (previous.hp > next.hp) queueHpAnimation(previous.hp, next.hp, next.maxHp);
      const finishedRound = previous.phase !== next.phase && ["roundOver", "victory", "defeat"].includes(next.phase);
      if (finishedRound && next.roundNet) queueMoneyAnimation(next.roundNet);
    }
    game = next;
    appScene = "game";
    if (signalKind !== "name") hideSignal();
    if (signalKind !== "name") notify("Joined the table.");
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
  signalKind = kind;
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

function getOrCreateDeviceId() {
  const key = "dungeon-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() || String(Date.now()) + String(Math.random()).slice(2);
    localStorage.setItem(key, id);
  }
  return id.replace(/[^a-z0-9-]/gi, "").slice(0, 48);
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
  const previousName = savedPlayerName(role === "solo" ? "You" : "Player");
  localStorage.setItem("dungeon-player-name", name);
  const seat = game?.seats.find((s) => s.id === localPlayerId);
  if (seat) seat.name = name;
  if (role === "guest") peer?.send({ type: "rename", playerId: localPlayerId, name });
  if (role === "host") broadcast();
  updateLeaderboardName(name, previousName);
  hideSignal();
  notify(`Playing as ${name}`);
}

function updateLeaderboardName(name, previousName = "") {
  const entries = loadLeaderboard();
  if (!entries.length) return;
  const renamedEntries = entries.map((entry) => ({ ...entry, name }));
  const changed = entries.some((entry) => entry.name !== name || entry.name === previousName);
  if (!changed) return;
  saveLeaderboard(renamedEntries);
  leaderboardOnline = leaderboardOnline.map((entry) => {
    if (!renamedEntries.some((renamedEntry) => renamedEntry.runKey === entry.runKey)) return entry;
    const next = { ...entry, name };
    return next;
  });
  void syncRenamedLeaderboardEntries(renamedEntries).then(() => refreshLeaderboard(true)).catch(() => {
    leaderboardStatus = "Name saved locally - global unavailable";
  });
}

function loadLeaderboard() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]");
    return sortLeaderboard(Array.isArray(raw) ? raw.filter((entry) => entry && entry.runKey) : []);
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(sortLeaderboard(entries).slice(0, LEADERBOARD_MAX)));
  } catch {
    notify("Leaderboard could not be saved on this device.");
  }
}

function displayLeaderboard() {
  return (leaderboardOnline.length ? leaderboardOnline : loadLeaderboard()).slice(0, LEADERBOARD_VISIBLE);
}

function leaderboardDbRow(entry) {
  return {
    run_key: entry.runKey,
    name: entry.name,
    score: entry.score,
    result: entry.result,
    mode: entry.mode,
    floor: entry.floor,
    total_floors: entry.totalFloors,
    gold: entry.gold,
    debt: entry.debt,
    profit: entry.profit,
    rounds: entry.rounds,
    played_at: new Date(entry.date || Date.now()).toISOString()
  };
}

function leaderboardEntryFromDb(row) {
  return {
    runKey: row.run_key,
    name: row.name,
    score: Number(row.score) || 0,
    result: row.result,
    mode: row.mode,
    floor: Number(row.floor) || 1,
    totalFloors: Number(row.total_floors) || 1,
    gold: Number(row.gold) || 0,
    debt: Number(row.debt) || 0,
    profit: Number(row.profit) || 0,
    rounds: Number(row.rounds) || 0,
    date: Date.parse(row.played_at || row.created_at) || Date.now()
  };
}

function leaderboardService() {
  leaderboardClient ||= createSupabaseClient();
  return leaderboardClient;
}

async function refreshLeaderboard(force = false) {
  if (leaderboardRefreshInFlight) return;
  if (!force && Date.now() - leaderboardRefreshAt < 1000) return;
  leaderboardRefreshInFlight = true;
  leaderboardRefreshAt = Date.now();
  try {
    await syncLocalLeaderboardEntries();
    const { data, error } = await leaderboardService()
      .from("leaderboard")
      .select("run_key,name,score,result,mode,floor,total_floors,gold,debt,profit,rounds,played_at,created_at")
      .order("score", { ascending: false })
      .order("played_at", { ascending: false })
      .limit(LEADERBOARD_MAX);
    if (error) throw error;
    leaderboardOnline = sortLeaderboard((data || []).map(leaderboardEntryFromDb)).slice(0, LEADERBOARD_MAX);
    leaderboardStatus = "Global top 5";
  } catch {
    leaderboardStatus = loadLeaderboard().length ? "Local top 5 - global unavailable" : "Global leaderboard unavailable";
  } finally {
    leaderboardRefreshInFlight = false;
  }
}

async function syncLocalLeaderboardEntries() {
  if (leaderboardSyncInFlight) return;
  const localEntries = normalizeLocalLeaderboardName().slice(0, LEADERBOARD_MAX);
  if (!localEntries.length) return;
  leaderboardSyncInFlight = true;
  try {
    const { error } = await leaderboardService()
      .from("leaderboard")
      .upsert(localEntries.map(leaderboardDbRow), { onConflict: "run_key" });
    if (error) throw error;
  } finally {
    leaderboardSyncInFlight = false;
  }
}

function normalizeLocalLeaderboardName() {
  const entries = loadLeaderboard();
  const name = savedPlayerName("");
  if (!name || !entries.length || entries.every((entry) => entry.name === name)) return entries;
  const renamed = entries.map((entry) => ({ ...entry, name }));
  saveLeaderboard(renamed);
  return renamed;
}

async function syncRenamedLeaderboardEntries(entries) {
  const renamed = entries.filter((entry) => entry?.runKey);
  if (!renamed.length) return;
  const { error } = await leaderboardService()
    .from("leaderboard")
    .upsert(renamed.map(leaderboardDbRow), { onConflict: "run_key" });
  if (error) throw error;
  await Promise.all(renamed.map(async (entry) => {
    await leaderboardService()
      .from("leaderboard")
      .update({ name: entry.name })
      .eq("run_key", entry.runKey);
  }));
}

async function syncLeaderboardEntry(entry) {
  try {
    const { error } = await leaderboardService()
      .from("leaderboard")
      .upsert(leaderboardDbRow(entry), { onConflict: "run_key" });
    if (error) throw error;
    await refreshLeaderboard(true);
  } catch {
    leaderboardStatus = "Saved locally - global unavailable";
  }
}

function sortLeaderboard(entries) {
  return [...entries].sort((a, b) =>
    (Number(b.score) || 0) - (Number(a.score) || 0)
    || (Number(b.floor) || 0) - (Number(a.floor) || 0)
    || (Number(b.gold) || 0) - (Number(a.gold) || 0)
    || (Number(b.profit) || 0) - (Number(a.profit) || 0)
    || (Number(b.date) || 0) - (Number(a.date) || 0)
  );
}

function recordLeaderboardIfNeeded() {
  if (!game || !["victory", "defeat"].includes(game.phase)) return;
  if (game.developerTest) return;
  const seat = mySeat() || game.seats?.[0];
  if (!seat) return;
  const runKey = `${game.session || "run"}:${localPlayerId || seat.id || localDeviceId}`;
  const entries = loadLeaderboard();
  if (entries.some((entry) => entry.runKey === runKey)) return;
  const totalFloors = Math.max(1, enemyTemplates.length || 1);
  const floor = clamp((Number(game.floor) || 0) + 1, 1, totalFloors);
  const gold = Math.max(0, Math.round(isFreeForAll() ? seatBankroll(seat) : (Number(game.gold) || 0)));
  const debt = Math.max(0, Math.round(debtForSeat(seat)));
  const profit = Math.round(Number(seat.profit) || 0);
  const victory = game.phase === "victory";
  const score = floor * 100000 + (victory ? 50000 : 0) + gold * 10 + profit - debt * 5;
  const entry = {
    runKey,
    name: cleanPlayerName(seat.name) || savedPlayerName("Player"),
    result: victory ? "Win" : "Loss",
    mode: modeLabels[game.mode] || "Classic Turns",
    floor,
    totalFloors,
    gold,
    debt,
    profit,
    rounds: Number(game.completedRounds) || Math.max(0, (seat.profitHistory?.length || 1) - 1),
    score,
    date: Date.now()
  };
  entries.push(entry);
  saveLeaderboard(entries);
  void syncLeaderboardEntry(entry);
}

function hideSignal() {
  signalKind = "";
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
  const players = game.seats.map((s) => ({ id: s.id, name: s.name }));
  const code = game.code;
  const mode = game.mode || (game.freePlay ? "freePlay" : "classic");
  newGame(players, code, mode);
  log("The lobby deals a fresh dungeon run.");
}

function isFreeForAll() {
  return game?.mode === "freeForAll";
}

function sharedBankrupt() {
  return !!game && !isFreeForAll() && (Number(game.gold) || 0) <= 0;
}

function canOfferBankruptcyLoan(seat = null, requiredAmount = MIN_BET) {
  if (!game) return false;
  const required = Math.max(MIN_BET, Number(requiredAmount) || MIN_BET);
  if (isFreeForAll()) {
    return !!seat && seatBankroll(seat) < required && (Number(seat.debt) || 0) <= 0;
  }
  return (Number(game.gold) || 0) < required && (Number(game.loanDebt) || 0) <= 0;
}

function sharedLoanNeedsVote() {
  return !!game?.code && !isFreeForAll() && game.seats.length > 1;
}

function loanVoters() {
  return game?.seats?.filter((s) => !s.spectating) || [];
}

function canSeeLoanOffer(playerId = localPlayerId) {
  if (!game || game.phase !== "loanOffer") return false;
  if (!isFreeForAll()) return true;
  return playerId === game.loanSeatId;
}

function loanDisplaySigner(playerId = localPlayerId) {
  if (sharedLoanNeedsVote()) return game.seats.find((s) => s.id === playerId) || loanSigner();
  return loanSigner();
}

function triggerBankruptcyDeath(reason, seat = null, requiredAmount = MIN_BET) {
  const signerSeat = seat || game.seats[game.activeSeat] || mySeat() || game.seats[0];
  const hpBefore = Math.max(1, game.hp || game.maxHp || 1);
  const required = Math.max(MIN_BET, Number(requiredAmount) || MIN_BET);
  if (!isFreeForAll()) {
    if (game.hp > 0) queueHpAnimation(game.hp, 0, game.maxHp);
    game.hp = 0;
  }
  game.loanSeatId = signerSeat?.id || "";
  game.loanReason = reason || "Bankruptcy";
  game.loanRequiredAmount = required;
  game.loanVotes = {};
  if (canOfferBankruptcyLoan(signerSeat, required)) {
    game.phase = "loanOffer";
    if (!isFreeForAll()) log(`${reason}. A blood contract is offered.`);
  } else if (isFreeForAll()) {
    eliminateSeat(signerSeat, `${reason}. No contract remains.`);
  } else {
    game.phase = "defeat";
    log(`${reason}. No contract remains.`);
  }
  return hpBefore;
}

function voteLoan(playerId, signed) {
  if (!sharedLoanNeedsVote()) return;
  game.loanVotes ||= {};
  game.loanVotes[playerId] = signed ? "sign" : "decline";
  const seat = game.seats.find((s) => s.id === playerId);
  if (!signed) {
    game.phase = "defeat";
    log(`${seat?.name || "Someone"} refused the blood contract.`);
    return;
  }
  const voters = loanVoters();
  log(`${seat?.name || "A player"} signed the contract vote.`);
  if (voters.every((s) => game.loanVotes?.[s.id] === "sign")) signLoan(game.loanSeatId || hostId);
}

function declineLoan(playerId) {
  if (isFreeForAll()) {
    const seat = game.seats.find((s) => s.id === playerId);
    eliminateSeat(seat, "Declined the contract.");
    return;
  }
  game.phase = "defeat";
  log("The contract goes unsigned.");
}

function eliminateSeat(seat, reason = "Bankrupt.") {
  if (!seat) return;
  seat.bankrupt = true;
  seat.dead = true;
  seat.spectating = true;
  seat.finished = true;
  seat.ready = true;
  seat.bet = 0;
  seat.hands = [];
  log(`${seat.name}: dead.`);
  if (freeForAllAllOut()) {
    game.phase = "defeat";
    log("Every bankroll is gone. The table closes.");
  } else {
    enterBettingRound({ chargeInterest: false });
    log(reason);
  }
}

function signLoan(playerId) {
  if (game.phase !== "loanOffer") return;
  if (isFreeForAll() && game.loanSeatId && playerId !== game.loanSeatId) return flashMsg(`${loanSigner().name} must sign`);
  const seat = game.seats.find((s) => s.id === (game.loanSeatId || playerId));
  if (!canOfferBankruptcyLoan(seat, game.loanRequiredAmount || MIN_BET)) {
    if (isFreeForAll()) eliminateSeat(seat, "No contract remains.");
    else game.phase = "defeat";
    return;
  }
  const reviveHp = Math.max(1, Math.ceil(game.maxHp * .35));
  game.loanSignedAt = performance.now();
  if (isFreeForAll()) {
    seat.gold = seatBankroll(seat) + LOAN_AMOUNT;
    seat.debt = LOAN_AMOUNT + LOAN_INTEREST;
    seat.loanUsed = true;
    seat.bankrupt = false;
    seat.dead = false;
    seat.spectating = false;
    seat.ready = false;
    seat.bet = Math.min(25, maxBetForSeat(seat));
  } else {
    game.gold += LOAN_AMOUNT;
    game.loanDebt = LOAN_AMOUNT + LOAN_INTEREST;
    game.loanUsed = true;
    for (const s of game.seats) s.bet = Math.min(25, maxBetForSeat(s));
  }
  queueHpAnimation(0, reviveHp, game.maxHp);
  game.hp = reviveHp;
  game.loanRequiredAmount = MIN_BET;
  enterBettingRound({ chargeInterest: false });
  if (!isFreeForAll()) log(`Signed in blood. ${Math.round(LOAN_WINNING_PAYMENT_RATE * 100)}% of winnings pay debt, plus ${Math.round(LOAN_INTEREST_RATE_PER_ROUND * 100)}% compounding interest each round.`);
  sfx("life");
}

function updateSeatBankruptcy(seat) {
  if (!isFreeForAll() || !seat) return false;
  if (seat.dead) {
    seat.bankrupt = true;
    seat.spectating = true;
    seat.ready = true;
    seat.bet = 0;
    return false;
  }
  const was = !!seat.bankrupt;
  seat.bankrupt = seatBankroll(seat) < MIN_BET;
  if (seat.bankrupt) {
    seat.bet = 0;
    seat.spectating = true;
  } else {
    seat.spectating = false;
  }
  return !was && seat.bankrupt;
}

function updateFreeForAllBankruptcy(results = []) {
  if (!isFreeForAll()) return null;
  let firstBankrupt = null;
  for (const seat of game.seats) {
    const newlyBankrupt = updateSeatBankruptcy(seat);
    if (newlyBankrupt) {
      results.push(`${seat.name}: bankrupt${canTakeLoan(seat) ? " - loan available" : " - out"}`);
      if (!firstBankrupt) firstBankrupt = seat;
      sfx("lose");
    }
  }
  return firstBankrupt;
}

function freeForAllAllOut() {
  return isFreeForAll()
    && game.seats.length > 0
    && game.seats.every((seat) => seat.dead || (seatBankroll(seat) < MIN_BET && !canTakeLoan(seat)));
}

function canTakeLoan(seat) {
  return canOfferBankruptcyLoan(seat);
}

function cycleModePreference() {
  const modes = ["classic", "freePlay", "freeForAll"];
  modePreference = modes[(modes.indexOf(modePreference) + 1) % modes.length];
  localStorage.setItem("dungeon-mode", modePreference);
  localStorage.setItem("dungeon-free-play", String(modePreference !== "classic"));
}

function cycleArtPreference() {
  loadHanddrawnAssets();
}

function isHanddrawnArt() {
  return true;
}

function maxSplitHands() {
  return developerModeUnlocked && game?.developerTest ? developerSplitLimit : 4;
}

function handleDeveloperSplashTap() {
  const now = performance.now();
  developerTapTimes = [...developerTapTimes.filter((t) => now - t < 4000), now];
  if (!developerModeUnlocked && developerTapTimes.length >= 7) {
    developerModeUnlocked = true;
    developerPanelOpen = true;
    developerTapTimes = [];
    notify("Developer mode unlocked.");
    sfx("win");
    return;
  }
  if (developerModeUnlocked && developerTapTimes.length >= 7) {
    developerPanelOpen = true;
    developerTapTimes = [];
  }
}

function seatBankroll(seat) {
  return isFreeForAll() ? Math.max(0, Number(seat?.gold) || 0) : Math.max(0, Number(game?.gold) || 0);
}

function debtForSeat(seat = mySeat()) {
  return isFreeForAll() ? Math.max(0, Number(seat?.debt) || 0) : Math.max(0, Number(game?.loanDebt) || 0);
}

function seatInDebt(seat) {
  if (!seat) return false;
  if (isFreeForAll()) return (Number(seat.debt) || 0) > 0;
  return (Number(game?.loanDebt) || 0) > 0;
}

function goldLabel() {
  const seat = mySeat() || game.seats[0];
  const debt = debtForSeat(seat);
  const base = isFreeForAll() ? `Bank ${seatBankroll(seat)}g` : `Gold ${game.gold}g`;
  return `${base}${debt ? ` / Debt ${debt}g` : ""}`;
}

function drawGoldDebtLine(x, y, size = 18) {
  const seat = mySeat() || game.seats[0];
  const debt = debtForSeat(seat);
  const base = isFreeForAll() ? `Bank ${seatBankroll(seat)}g` : `Gold ${game.gold}g`;
  const iconSize = size * 1.25;
  drawHandAssetFit("goldMark", x + iconSize / 2, y - size * .32, iconSize, C.gold, "center", .95);
  text(base, x + iconSize + 8, y, size, C.gold);
  if (debt) {
    ctx.save();
    ctx.font = `700 ${size}px sans-serif`;
    const baseW = ctx.measureText(base).width;
    ctx.restore();
    const debtX = x + iconSize + 8 + baseW + 18;
    drawHandAssetFit("debtMark", debtX + iconSize / 2, y - size * .32, iconSize, C.red, "center", .95);
    text(`Debt ${debt}g`, debtX + iconSize + 8, y, size, C.red);
  }
}

function spendGold(seat, amount) {
  if (amount <= 0) return true;
  if (isFreeForAll()) {
    if (seatBankroll(seat) < amount) return false;
    seat.gold -= amount;
    return true;
  }
  if ((game.gold || 0) < amount) return false;
  game.gold -= amount;
  return true;
}

function loanPaymentForWinnings(debt, winnings) {
  if (debt <= 0 || winnings <= 0) return 0;
  return Math.min(debt, Math.ceil(winnings * LOAN_WINNING_PAYMENT_RATE));
}

function addGold(seat, amount, winnings = amount) {
  if (amount <= 0) return;
  if (!isFreeForAll()) {
    const debt = Math.max(0, Number(game.loanDebt) || 0);
    const payment = loanPaymentForWinnings(debt, winnings);
    if (payment > 0) {
      game.loanDebt = debt - payment;
      if (game.loanDebt <= 0) game.loanUsed = false;
      game.loanPaidThisRound = (Number(game.loanPaidThisRound) || 0) + payment;
    }
    const remainder = amount - payment;
    if (remainder > 0) game.gold += remainder;
    return;
  }
  const debt = Math.max(0, Number(seat?.debt) || 0);
  const payment = loanPaymentForWinnings(debt, winnings);
  if (payment > 0) {
    seat.debt = debt - payment;
    if (seat.debt <= 0) seat.loanUsed = false;
    seat.loanPaidThisRound = (Number(seat.loanPaidThisRound) || 0) + payment;
  }
  const remainder = amount - payment;
  if (remainder > 0) seat.gold = seatBankroll(seat) + remainder;
}

function maxBetForSeat(seat) {
  if (isFreeForAll()) return Math.max(0, Math.min(MAX_BET, seatBankroll(seat)));
  const committedByOthers = game.seats.reduce((sum, other) => sum + (other === seat ? 0 : Math.max(0, other.bet || 0)), 0);
  return Math.max(0, Math.min(MAX_BET, game.gold - committedByOthers));
}

function moneyAfterBetForSeat(seat) {
  if (isFreeForAll()) return seatBankroll(seat) - Math.max(0, seat.bet || 0);
  const totalBets = game.seats.reduce((sum, s) => sum + Math.max(0, s.bet || 0), 0);
  return game.gold - totalBets;
}

function safeMaxBetForSeat(seat) {
  const max = maxBetForSeat(seat);
  const fee = Number(game?.enemy?.hitFee) || 0;
  if (!fee || max <= MIN_BET) return max;
  return Math.max(MIN_BET, max - fee);
}

function warnHitFeeReserve(seat, fromMaxButton = false) {
  const fee = Number(game?.enemy?.hitFee) || 0;
  if (!fee || !seat || seat.bet <= 0) return true;
  const remaining = moneyAfterBetForSeat(seat);
  if (remaining >= fee) {
    if (fromMaxButton && maxBetForSeat(seat) !== seat.bet) {
      flashMsg(`This floor charges ${fee}g per hit. Saved ${fee}g.`);
    }
    return true;
  }
  const message = `This floor charges ${fee}g per hit. Leave at least ${fee}g after betting.`;
  flashMsg(message);
  log(`${seat.name}: ${message}`);
  sfx("lose");
  return false;
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
    currentMusicPath = desiredMusicPath();
    audio = new Audio(currentMusicPath);
    audio.loop = true;
    audio.volume = .35;
    audio.playbackRate = 1;
    audio.preservesPitch = true;
    audio.mozPreservesPitch = true;
    audio.webkitPreservesPitch = true;
    audio.addEventListener("error", handleMusicError);
  }
  if (!deathWarpAudio) {
    deathWarpAudio = new Audio("./assets/audio/sfx/death_warp.wav");
    deathWarpAudio.preload = "auto";
    deathWarpAudio.volume = .22;
  }
  if (!heartbeatAudio) {
    heartbeatAudio = new Audio("./assets/audio/sfx/heartbeat.wav");
    heartbeatAudio.preload = "auto";
    heartbeatAudio.volume = .24;
  }
  if (!audioCtx) audioCtx = new AudioContext();
  setupMusicChain();
  switchMusicIfNeeded();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  if (!musicStarted) {
    audio.play().then(() => musicStarted = true).catch(() => {});
  }
}

function musicPath(filename) {
  return `./assets/audio/music/${filename}?v=${AUDIO_CACHE_BUST}`;
}

function fallbackMusicPathFor(path) {
  return path.includes(".mp3") ? path.replace(".mp3", ".ogg") : "";
}

function desiredMusicPath() {
  if (!game || appScene === "splash" || appScene === "menu") return musicPath(musicTracks.menu);
  const floorIndex = clamp(Number(game.floor) || 0, 0, musicTracks.floors.length - 1);
  const activeNode = getMapNode(game.activeEncounterId);
  const inBossTable = game.phase !== "map" && activeNode?.kind === "boss";
  const file = inBossTable ? musicTracks.bosses[floorIndex] : musicTracks.floors[floorIndex];
  return musicPath(file || musicTracks.menu);
}

function handleMusicError() {
  if (!audio || currentMusicFallbackPath) return;
  const fallbackPath = fallbackMusicPathFor(currentMusicPath);
  if (!fallbackPath) return;
  const shouldPlay = musicStarted && !audio.muted && !document.hidden;
  currentMusicFallbackPath = fallbackPath;
  audio.pause();
  audio.src = fallbackPath;
  audio.currentTime = 0;
  audio.loop = true;
  audio.volume = .35;
  audio.load();
  if (shouldPlay) audio.play().catch(() => {});
}

function switchMusicIfNeeded() {
  if (!audio || musicDeathMode) return;
  const nextPath = desiredMusicPath();
  if (currentMusicPath === nextPath) return;
  const shouldPlay = musicStarted && !audio.paused && !audio.muted && !document.hidden;
  currentMusicPath = nextPath;
  currentMusicFallbackPath = "";
  audio.pause();
  audio.src = nextPath;
  audio.currentTime = 0;
  audio.loop = true;
  audio.volume = .35;
  audio.load();
  if (shouldPlay) audio.play().catch(() => {});
}

function playClip(clip, volume = .22) {
  if (!clip || audio?.muted || document.hidden) return;
  try {
    clip.pause();
    clip.currentTime = 0;
    clip.volume = volume;
    clip.play().catch(() => {});
  } catch {
  }
}

function stopClip(clip) {
  if (!clip) return;
  try {
    clip.pause();
    clip.currentTime = 0;
  } catch {
  }
}

function stopDeathAudioClips() {
  stopDeathReverseMusic();
  stopClip(deathWarpAudio);
  stopClip(heartbeatAudio);
  musicDeathMode = false;
  musicDeathStarted = 0;
  musicDeathLastHeartbeat = 0;
  musicDeathWarpPlayed = false;
}

function setupMusicChain() {
  if (!audioCtx || !audio || audioSource) return;
  audioSource = audioCtx.createMediaElementSource(audio);
  musicFilter = audioCtx.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 18000;
  musicFilter.Q.value = .5;
  musicDistortion = audioCtx.createWaveShaper();
  musicDistortion.curve = makeDistortionCurve(0);
  musicDistortion.oversample = "4x";
  musicGain = audioCtx.createGain();
  musicGain.gain.value = 1;
  audioSource.connect(musicFilter).connect(musicDistortion).connect(musicGain).connect(audioCtx.destination);
}

function stopDeathReverseMusic() {
  if (deathReverseGain) {
    deathReverseGain.gain.cancelScheduledValues(audioCtx.currentTime);
    deathReverseGain.gain.setTargetAtTime(0, audioCtx.currentTime, .08);
  }
  if (deathReverseSource) {
    try {
      deathReverseSource.stop(audioCtx.currentTime + .16);
    } catch {
    }
  }
  deathReverseSource = null;
  deathReverseGain = null;
}

function makeDistortionCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const k = Math.max(0, amount);
  for (let i = 0; i < samples; i++) {
    const x = i * 2 / samples - 1;
    curve[i] = k ? (Math.PI + k) * x / (Math.PI + k * Math.abs(x)) : x;
  }
  return curve;
}

function updateMusicMood(now = performance.now()) {
  if (!audio) return;
  const death = game?.phase === "loanOffer" || game?.phase === "defeat";
  if (death) {
    const lightDeathAudio = isIOSDevice();
    if (!musicDeathMode) {
      musicDeathStarted = now;
      musicDeathLastHeartbeat = 0;
      musicDeathWarpPlayed = false;
      stopDeathReverseMusic();
      audio.pause();
      audio.volume = 0;
      if (musicGain) musicGain.gain.setTargetAtTime(0, audioCtx.currentTime, .08);
    }
    if (!musicDeathWarpPlayed) {
      musicDeathWarpPlayed = true;
      playClip(deathWarpAudio, lightDeathAudio ? .13 : .2);
    }
    const beatGap = lightDeathAudio ? 2100 : 1500;
    if (now - musicDeathLastHeartbeat > beatGap) {
      musicDeathLastHeartbeat = now;
      playClip(heartbeatAudio, lightDeathAudio ? .12 : .2);
    }
    musicDeathMode = true;
    return;
  }
  switchMusicIfNeeded();
  if (!musicDeathMode) return;
  stopDeathAudioClips();
  audio.playbackRate = 1;
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
  audio.volume = .35;
  if (musicFilter) {
    musicFilter.frequency.setTargetAtTime(18000, audioCtx.currentTime, .18);
    musicFilter.Q.setTargetAtTime(.5, audioCtx.currentTime, .18);
  }
  if (musicGain) musicGain.gain.setTargetAtTime(1, audioCtx.currentTime, .18);
  if (musicDistortion) musicDistortion.curve = makeDistortionCurve(0);
  if (musicStarted && audio.paused && !audio.muted && !document.hidden) audio.play().catch(() => {});
}

function toggleMusic() {
  if (!audio) return;
  audio.muted = !audio.muted;
  if (audio.muted) {
    stopDeathAudioClips();
  }
  flashMsg(audio.muted ? "Music muted" : "Music on");
}

function pauseMusicForFocus() {
  stopDeathAudioClips();
  if (!audio || audio.paused || audio.muted) return;
  musicPausedForFocus = true;
  audio.pause();
}

function resumeMusicForFocus() {
  if (!audio || !musicPausedForFocus || audio.muted || document.hidden) return;
  musicPausedForFocus = false;
  audio.play().catch(() => {});
}

function sfx(kind) {
  if (kind === "heartbeat") {
    playClip(heartbeatAudio, isIOSDevice() ? .12 : .2);
    return;
  }
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  const now = audioCtx.currentTime;
  const blip = (freq, start, duration, volume = .14, type = "square", endFreq = freq) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + start + duration);
    gain.gain.setValueAtTime(.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(volume, now + start + .006);
    gain.gain.setValueAtTime(volume * .72, now + start + duration * .45);
    gain.gain.exponentialRampToValueAtTime(.0001, now + start + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + start);
    osc.stop(now + start + duration + .02);
  };
  if (kind === "click") {
    blip(620, 0, .06, .105);
    return;
  }
  if (kind === "ready") {
    blip(520, 0, .09, .13);
    blip(780, .085, .11, .14);
    blip(1040, .18, .08, .105);
    return;
  }
  if (kind === "coin") {
    blip(740, 0, .08, .12);
    blip(990, .065, .095, .145);
    blip(1320, .145, .09, .12);
    return;
  }
  if (kind === "coinDown") {
    blip(520, 0, .085, .13);
    blip(320, .07, .13, .145, "square", 190);
    blip(180, .18, .1, .095, "square", 120);
    return;
  }
  if (kind === "life") {
    blip(150, 0, .2, .24, "square", 52);
    blip(78, .025, .26, .18, "sawtooth", 38);
    blip(310, .02, .045, .11, "square", 180);
    return;
  }
  if (kind === "phase") {
    blip(180, 0, .16, .18, "sawtooth", 300);
    blip(420, .11, .18, .16, "square", 620);
    blip(840, .25, .22, .13, "triangle", 520);
    return;
  }
  if (kind === "floorClear") {
    blip(420, 0, .12, .14, "triangle", 620);
    blip(660, .1, .14, .16, "triangle", 900);
    blip(980, .22, .18, .17, "triangle", 1320);
    blip(1480, .4, .24, .14, "triangle", 1040);
    return;
  }
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
  if (appScene === "splash") {
    drawSplash();
  } else if (!game || appScene === "menu") {
    drawMenu();
  } else {
    if (game.phase === "map") {
      drawDungeonMap();
    } else if (game.phase === "floorTransition") {
      drawFloorTransition();
    } else {
      drawTable();
      drawFlyingCards();
      if (game.phase === "shop") drawShop();
      if (game.phase === "loanOffer" && canSeeLoanOffer()) drawLoanOffer();
      if (game.phase === "victory" || game.phase === "defeat") drawEnd();
      if (game.peekCard) drawPeekOverlay();
      if (game.developerTest) drawDeveloperTableNavigatorControls();
    }
  }
  if (statsPlayerId) drawStatsOverlay();
  if (rulesOpen) drawRulesOverlay();
  if (relicsOpen) drawRelicsOverlay();
  if (logOpen) drawLogOverlay();
  if (mapInfoDetail) drawMapInfoOverlay();
  if (game?.relicPopup && game.phase !== "floorTransition") drawRelicRewardPopup();
  drawFeedbackAnimations();
  if (menuOpen) {
    buttons = [];
    drawGameMenu();
  }
  if (developerPanelOpen) {
    buttons = [];
    drawDeveloperPanel();
  }
  if (flashTimer > 0) drawFlash();
  ctx.restore();
}

function drawSplash() {
  const lw = layoutW();
  const lh = layoutH();
  const cx = lw / 2;
  const cy = lh / 2;
  if (drawRawAssetCover("splashBackground", 0, 0, lw, lh, .98)) {
    fill("rgba(5,4,10,.34)", 0, 0, lw, lh);
    const glow = ctx.createRadialGradient(cx, cy - 20, 80, cx, cy - 20, Math.max(lw, lh) * .48);
    glow.addColorStop(0, "rgba(20,13,30,.14)");
    glow.addColorStop(1, "rgba(0,0,0,.66)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, lw, lh);
  }
  ctx.save();
  ctx.shadowColor = "rgba(220,180,70,.72)";
  ctx.shadowBlur = 26;
  text("DUNGEON", cx, cy - 92, viewport.portrait ? 58 : 72, C.gold, "center", "serif");
  text("OF CARDS", cx, cy - 30, viewport.portrait ? 48 : 60, C.parchment, "center", "serif");
  ctx.restore();
  text("Wizard Stab Studio presents", cx, cy + 14, viewport.portrait ? 24 : 24, C.muted, "center", "serif");
  text(`v${APP_VERSION}`, cx, cy + 48, viewport.portrait ? 18 : 16, hexToRgba(C.parchment, .68), "center");
  buttons.push({ x: cx - 280, y: cy - 150, w: 560, h: 130, onClick: handleDeveloperSplashTap });
  addButton(cx - 150, cy + 88, 300, viewport.portrait ? 72 : 54, "Enter Casino", () => appScene = "menu", true);
  if (developerModeUnlocked) {
    addButton(cx - 150, cy + (viewport.portrait ? 178 : 156), 300, viewport.portrait ? 72 : 54, "Developer", () => developerPanelOpen = true);
  }
}

function drawMenu() {
  const lw = layoutW();
  const lh = layoutH();
  const portrait = viewport.portrait;
  const table = portrait ? { x: 34, y: 54, w: lw - 68, h: Math.min(1325, lh - 108) } : { x: 40, y: 70, w: Math.min(844, lw - 390), h: 660 };
  const cx = table.x + table.w / 2;
  const side = portrait ? null : { x: table.x + table.w + 28, y: table.y, w: Math.max(280, lw - (table.x + table.w + 68)), h: table.h };
  const hasMenuArt = drawRawAssetCover("mainMenuBackground", 0, 0, lw, lh, .98);
  if (hasMenuArt) fill("rgba(5,4,10,.24)", 0, 0, lw, lh);
  const theme = floorThemeColor(0);
  shadow(0, 28, 70, "rgba(0,0,0,.45)", () => {
    gradientRound(table.x, table.y, table.w, table.h, 24, [
      [0, hexToRgba(theme, hasMenuArt ? .36 : .72)],
      [.55, hasMenuArt ? "rgba(12,10,16,.68)" : "#111d19"],
      [1, "rgba(33,24,42,.76)"]
    ], true);
  });
  strokeRound(table.x, table.y, table.w, table.h, 24, hexToRgba(theme, .8), 3);
  strokeRound(table.x + 12, table.y + 12, table.w - 24, table.h - 24, 18, "rgba(238,231,215,.08)", 1);
  if (!hasMenuArt) drawMenuAmbience(table, portrait);
  if (side) drawMenuSidePanel(side);
  if (developerModeUnlocked) addButton(table.x + 22, table.y + 22, portrait ? 112 : 80, portrait ? 48 : 34, "Dev", () => developerPanelOpen = true);

  if (!portrait && !hasMenuArt) {
    drawMenuShowCard({ rank: "A", suit: "S", up: true }, table.x + 90, table.y + 74, -.08, 1);
    drawMenuShowCard({ rank: "K", suit: "H", up: true }, table.x + table.w - 180, table.y + 92, .07, 1);
    drawMenuShowCard({ up: false }, table.x + table.w - 118, table.y + 250, .12, .96);
  }

  const shimmer = .5 + .5 * Math.sin(performance.now() * .0021);
  ctx.save();
  ctx.shadowColor = `rgba(220,180,70,${.34 + shimmer * .22})`;
  ctx.shadowBlur = 18 + shimmer * 10;
  text("DUNGEON", cx, portrait ? 168 : 188, portrait ? 58 : 76, C.gold, "center", "serif");
  ctx.restore();
  text("of CARDS", cx, portrait ? 234 : 264, portrait ? 56 : 72, C.parchment, "center", "serif");
  text("A blackjack roguelike", cx, portrait ? 302 : 316, portrait ? 29 : 25, C.muted, "center");
  const lines = [
    "Win chips to damage dealer-monsters.",
    "Lose chips and the dungeon takes blood.",
    "Collect relics, bend the rules, beat the final boss."
  ];
  const copyY = portrait ? 382 : 344;
  const copyGap = portrait ? 40 : 28;
  lines.forEach((line, i) => text(line, cx, copyY + i * copyGap, portrait ? 22 : 19, C.text, "center"));
  const buttonW = portrait ? 480 : 300;
  const buttonX = cx - buttonW / 2;
  const playerButtonY = portrait ? 520 : 420;
  const buttonY = portrait ? 620 : 474;
  const buttonGap = portrait ? 92 : 54;
  addButton(buttonX, playerButtonY, buttonW, portrait ? 72 : 44, `Player: ${savedPlayerName("You")}`, openNameEditor);
  addButton(buttonX, buttonY, buttonW, portrait ? 78 : 52, "Single Player", () => {
    role = "solo";
    localPlayerId = hostId;
    newGame([{ id: hostId, name: savedPlayerName("You") }]);
  }, true);
  addButton(buttonX, buttonY + buttonGap, buttonW, portrait ? 78 : 52, "Host Game", hostLobby);
  addButton(buttonX, buttonY + buttonGap * 2, buttonW, portrait ? 78 : 52, "Join Game", joinLobby);
  addButton(buttonX, buttonY + buttonGap * 3, buttonW, portrait ? 72 : 44, `Mode: ${modeLabels[modePreference]}`, () => {
    cycleModePreference();
  });
  if (portrait) {
    const boardY = buttonY + buttonGap * 4 + 28;
    const boardH = Math.max(220, Math.min(275, table.y + table.h - boardY - 34));
    drawLeaderboardPanel(table.x + 44, boardY, table.w - 88, boardH);
  } else {
    drawLeaderboardPanel(side.x + 18, side.y + 24, side.w - 36, side.h - 48);
  }
  text("H/S/D/P/R actions - Enter ready/continue - M music", cx, lh - 34, portrait ? 18 : 16, C.muted, "center");
}

function drawMenuSidePanel(side) {
  const theme = floorThemeColor(0);
  shadow(0, 22, 55, "rgba(0,0,0,.42)", () => {
    gradientRound(side.x, side.y, side.w, side.h, 18, [[0, hexToRgba(theme, .34)], [.55, "#100d16"], [1, "#22172b"]], true);
  });
  strokeRound(side.x, side.y, side.w, side.h, 18, hexToRgba(theme, .56), 2);
  strokeRound(side.x + 10, side.y + 10, side.w - 20, side.h - 20, 13, "rgba(238,231,215,.06)", 1);
}

function drawMenuAmbience(table, portrait) {
  const now = performance.now();
  ctx.save();
  ctx.beginPath();
  pathRound(table.x + 14, table.y + 14, table.w - 28, table.h - 28, 18);
  ctx.clip();

  for (let i = 0; i < 7; i++) {
    const u = (now * .00005 + i / 7) % 1;
    const x = table.x + 35 + ((i * 137 + now * .018) % Math.max(1, table.w - 70));
    const y = table.y + table.h - 42 - u * (table.h + 75);
    const size = portrait ? 28 : 20;
    const suit = ["S", "H", "D", "C"][i % 4];
    const color = suit === "H" || suit === "D" ? "rgba(200,60,60,.18)" : "rgba(238,231,215,.14)";
    ctx.globalAlpha = .55;
    text({ S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663" }[suit], x, y, size, color, "center", "serif");
  }

  ctx.globalAlpha = .14;
  const sweep = table.x - table.w * .28 + ((now * .045) % (table.w * 1.56));
  const glint = ctx.createLinearGradient(sweep - 60, table.y, sweep + 60, table.y + table.h);
  glint.addColorStop(0, "rgba(255,255,255,0)");
  glint.addColorStop(.5, "rgba(255,232,150,.42)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint;
  ctx.fillRect(sweep - 75, table.y, 150, table.h);
  ctx.globalAlpha = 1;

  drawMenuChipRain(table, portrait, now);
  const chipY = table.y + table.h - (portrait ? 170 : 205) + Math.sin(now * .0023) * 7;
  drawChips(table.x + 78, chipY, 135, .88);
  drawChips(table.x + table.w - 120, chipY + Math.cos(now * .002) * 9, 80, .88);
  if (portrait) {
    drawMenuShowCard({ up: false }, table.x + table.w - 136, table.y + 98 + Math.sin(now * .0017) * 8, .1, .82);
    drawMenuShowCard({ rank: "Q", suit: "D", up: true }, table.x + 72, table.y + 118 + Math.cos(now * .0015) * 7, -.1, .82);
  }
  ctx.restore();
}

function drawMenuChipRain(table, portrait, now) {
  const denoms = chipDenoms();
  const count = portrait ? 18 : 22;
  for (let i = 0; i < count; i++) {
    const denom = denoms[(i * 7 + 3) % denoms.length];
    const speed = portrait ? .000085 : .000075;
    const u = (now * speed * (1 + (i % 5) * .09) + i * .137) % 1;
    const drift = Math.sin(now * .0011 + i * 1.73) * (portrait ? 18 : 26);
    const x = table.x + 34 + ((i * 91) % Math.max(1, table.w - 68)) + drift;
    const y = table.y - 54 + u * (table.h + 116);
    const scale = (portrait ? .48 : .42) + (i % 4) * .07;
    const rot = now * .0016 * (i % 2 ? 1 : -1) + i * .82;
    drawChipToken(x, y, denom, scale, rot, .34);
  }
}

function drawMenuShowCard(card, x, y, rotation = 0, scale = 1) {
  ctx.save();
  ctx.translate(x + CARD_W / 2, y + CARD_H / 2);
  ctx.rotate(rotation + Math.sin(performance.now() * .0016 + x * .01) * .025);
  ctx.scale(scale, scale);
  drawCardFace(card, -CARD_W / 2, -CARD_H / 2, false);
  ctx.restore();
}

function drawLeaderboardPanel(x, y, w, h) {
  const portrait = viewport.portrait;
  const roomy = !portrait && h > 240;
  const entries = displayLeaderboard();
  gradientRound(x, y, w, h, 14, [[0, "rgba(12,9,16,.82)"], [1, "rgba(34,25,44,.78)"]], true);
  strokeRound(x, y, w, h, 14, "rgba(220,180,70,.34)", 1.5);
  text("LEADERBOARD", x + 22, y + (portrait ? 39 : roomy ? 38 : 29), portrait ? 25 : roomy ? 22 : 16, C.gold, "left", "serif");
  text(fitLabel(leaderboardStatus, w * .48, portrait ? 17 : roomy ? 14 : 12), x + w - 22, y + (portrait ? 38 : roomy ? 37 : 29), portrait ? 17 : roomy ? 14 : 12, C.muted, "right");
  if (!entries.length) {
    text("No completed runs yet.", x + w / 2, y + h / 2 + 18, portrait ? 22 : roomy ? 18 : 15, C.muted, "center");
    return;
  }
  const rowTop = y + (portrait ? 68 : roomy ? 82 : 45);
  const rowH = portrait ? 40 : roomy ? 78 : 13;
  entries.forEach((entry, i) => {
    const ry = rowTop + i * rowH;
    if (portrait || roomy) fill(i % 2 ? "rgba(238,231,215,.035)" : "rgba(220,180,70,.055)", x + 14, ry - (roomy ? 31 : 23), w - 28, roomy ? 62 : 34, 8);
    const rankX = x + (portrait ? 28 : roomy ? 30 : 18);
    const nameX = x + (portrait ? 76 : roomy ? 76 : 54);
    const statsX = x + w - (portrait ? 24 : roomy ? 28 : 18);
    const nameSize = portrait ? 22 : roomy ? 19 : 13;
    const statSize = portrait ? 17 : roomy ? 14 : 12;
    const name = fitLabel(entry.name || "Player", w * (portrait ? .33 : .30), nameSize);
    const profit = Number(entry.profit) || 0;
    const debt = Number(entry.debt) || 0;
    const stat = `${entry.result} F${entry.floor}/${entry.totalFloors} ${entry.gold}g ${profit >= 0 ? "+" : ""}${profit}${debt ? ` D${debt}` : ""}`;
    text(`#${i + 1}`, rankX, ry, nameSize, i === 0 ? C.gold : C.muted);
    text(name, nameX, ry, nameSize, C.text);
    text(fitLabel(stat, Math.max(120, statsX - nameX - w * (roomy ? .12 : .34)), statSize), statsX, roomy ? ry + 24 : ry, statSize, entry.result === "Win" ? C.green : C.muted, "right");
    if (roomy) text(fitLabel(entry.mode || "Classic Turns", w - 82, 12), nameX, ry + 24, 12, C.muted);
  });
}

function drawTable() {
  const felt = viewport.portrait
    ? { x: 24, y: 42, w: layoutW() - 48, h: 730 }
    : { x: 40, y: 50, w: layoutW() - (isTouchLandscape() ? 570 : 380), h: 730 };
  const scene = tableSceneAssets();
  const theme = feltTheme();
  const ui = activeFloorUi();
  shadow(0, 26, 60, "rgba(0,0,0,.5)", () => {
    gradientRound(felt.x, felt.y, felt.w, felt.h, 22, [
      [0, theme[0]], [.52, theme[1]], [1, theme[2]]
    ], true);
  });
  if (scene.background) {
    drawRawAssetCover(scene.background, felt.x + 6, felt.y + 6, felt.w - 12, felt.h - 12, .9);
    fill("rgba(5,4,8,.12)", felt.x, felt.y, felt.w, felt.h, 22);
  }
  strokeRound(felt.x, felt.y, felt.w, felt.h, 22, ui.border || game.enemy.color || "#4f744f", 8);
  strokeRound(felt.x + 12, felt.y + 12, felt.w - 24, felt.h - 24, 16, "rgba(238,231,215,.08)", 1);
  strokeRound(felt.x + 20, felt.y + 20, felt.w - 40, felt.h - 40, 13, hexToRgba(ui.accent, .1), 1);
  if (!scene.table) {
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
    if (isHanddrawnArt() && handAssetReady("texture")) {
      for (let i = 0; i < 3; i++) {
        drawHandAsset("texture", felt.x + 58 + i * 34, felt.y + 120 + i * 145, Math.min(520, felt.w - 116), 120, "rgba(238,231,215,.12)", .32);
      }
    }
  }
  ctx.save();
  ctx.strokeStyle = hexToRgba(ui.accent, .12);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(felt.x + felt.w / 2, felt.y + 190, Math.min(310, felt.w * .34), 125, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = .07;
  text("DUNGEON OF CARDS", felt.x + felt.w / 2, felt.y + felt.h - 34, viewport.portrait ? 22 : 25, ui.titleWarm, "center", "serif");
  ctx.restore();
  drawEncounterTableArt(felt, scene);
  drawDeck(felt.x + felt.w - 125, felt.y + 50);
  drawDealer(felt);
  drawSeats(felt);
  drawSidePanel();
}

function tableSceneAssets() {
  const floorKey = floorAssetKey(Number(game?.floor) || 0);
  const activeNode = getMapNode(game?.activeEncounterId);
  const boss = activeNode?.kind === "boss";
  return {
    boss,
    background: tableSceneAsset(`${floorKey}:background`),
    table: tableSceneAsset(`${floorKey}:${boss ? "bossTable" : "table"}`),
    decoration: tableSceneAsset(`${floorKey}:decoration`)
  };
}

function tableSceneAsset(key) {
  const assetKey = `tableScene:${key}`;
  return handAssetReady(assetKey) ? assetKey : "";
}

function drawEncounterTableArt(felt, scene) {
  if (!scene.table && scene.boss) return;
  const portrait = viewport.portrait;
  const targetW = Math.min(felt.w * (portrait ? .96 : .9), portrait ? 700 : 1260);
  const targetH = portrait ? 390 : 520;
  const x = felt.x + felt.w / 2 - targetW / 2;
  const y = felt.y + (portrait ? 96 : 86);
  let tableRect = null;
  if (scene.boss) {
    tableRect = containRectForAsset(scene.table, x, y, targetW, targetH);
    drawRawAssetContain(scene.table, x, y, targetW, targetH, .98);
  } else {
    tableRect = containRectForAsset("tableBase:grunt", x, y, targetW, targetH);
    const shifted = drawPaletteShiftedAssetContain("tableBase:grunt", floorCardPalette(Number(game?.floor) || 0), x, y, targetW, targetH, .95);
    if (!shifted && scene.table) {
      tableRect = containRectForAsset(scene.table, x, y, targetW, targetH);
      drawRawAssetContain(scene.table, x, y, targetW, targetH, .94);
    }
  }
  drawTablePlaqueMotif(tableRect);
  if (scene.decoration) {
    drawRawAssetContain(scene.decoration, felt.x + 32, felt.y + felt.h - 230, portrait ? 170 : 190, portrait ? 170 : 190, .35);
  }
}

function containRectForAsset(key, x, y, w, h) {
  if (!handAssetReady(key)) return { x, y, w, h };
  const size = handAssetSize(key);
  const scale = Math.min(w / Math.max(1, size.w), h / Math.max(1, size.h));
  const dw = size.w * scale;
  const dh = size.h * scale;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}

function drawTablePlaqueMotif(tableRect) {
  if (!tableRect) return false;
  const floor = String(clamp((Number(game?.floor) || 0) + 1, 1, FLOORS)).padStart(2, "0");
  const key = `tableMotif:floor${floor}`;
  if (!handAssetReady(key)) return false;
  // Matches the blank rounded-square plaque baked into the recolorable table master.
  const cx = tableRect.x + tableRect.w * .5;
  const cy = tableRect.y + tableRect.h * .705;
  const size = Math.min(tableRect.w * .12, tableRect.h * .225, viewport.portrait ? 112 : 148);
  const x = cx - size / 2;
  const y = cy - size / 2;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "saturate(.72) contrast(.88) brightness(.92)";
  drawRawAssetContain(key, x, y, size, size, .8);
  ctx.restore();
  return true;
}

function drawDealer(felt) {
  const portrait = viewport.portrait;
  const ui = activeFloorUi();
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
    [0, ui.panelTop],
    [.6, ui.panelMid],
    [1, ui.panelBottom]
  ]);
  strokeRound(barX, barY, barW, 78, 14, hexToRgba(ui.border, .24), 1);
  shadow(0, 0, 18, e.color, () => fill(e.color, barX + 16, barY + 15, 50, 50, 25));
  text(e.icon, barX + 41, barY + 44, e.icon.length > 2 ? 14 : 22, C.black, "center", "serif");
  const meterW = portrait ? 180 : 220;
  const meterX = barX + barW - meterW - 30;
  const descriptionW = portrait ? 300 : Math.max(160, Math.min(460, barW - meterW - 150));
  textFit(e.name, barX + 82, barY + 28, Math.max(120, meterX - barX - 102), portrait ? 23 : 22, ui.titleWarm);
  wrapTextSized(e.description, barX + 82, barY + 56, descriptionW, portrait ? 19 : 16, portrait ? 17 : 15, C.muted, 1);
  if (e.isBoss) drawBossHealthBar(e, meterX, barY + 29, meterW, 14);
  else meter(meterX, barY + 29, meterW, 14, e.hp / e.maxHp, C.red, C.gold);
  text(`${e.hp}/${e.maxHp}`, meterX + meterW / 2, barY + 63, portrait ? 18 : 14, C.text, "center");
  buttons.push({ x: barX, y: barY, w: barW, h: 78, onClick: () => rulesOpen = true });
}

function bossPhaseColor(index) {
  return ["#59d67a", "#f0c84e", "#e85b54"][clamp(index, 0, 2)] || C.gold;
}

function drawBossHealthBar(enemy, x, y, w, h) {
  if (!enemy?.isBoss || !Array.isArray(enemy.bossPhases)) {
    meter(x, y, w, h, enemy?.maxHp ? enemy.hp / enemy.maxHp : 0, C.red, C.gold);
    return;
  }
  const value = clamp(enemy.hp / enemy.maxHp, 0, 1);
  const phaseIndex = clamp(Number(enemy.bossPhase) || 0, 0, enemy.bossPhases.length - 1);
  const phaseColor = bossPhaseColor(phaseIndex);
  fill("#08070b", x, y, w, h, h / 2);
  strokeRound(x, y, w, h, h / 2, "rgba(238,231,215,.12)", 1.5);
  ctx.save();
  ctx.globalAlpha = .34;
  const segments = [
    { from: .66, to: 1, color: bossPhaseColor(0) },
    { from: .33, to: .66, color: bossPhaseColor(1) },
    { from: 0, to: .33, color: bossPhaseColor(2) }
  ];
  for (const seg of segments) {
    fill(seg.color, x + w * seg.from, y, w * (seg.to - seg.from), h, h / 2);
  }
  ctx.restore();
  const filled = value * w;
  if (filled > 0) {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, phaseColor);
    g.addColorStop(.62, lighten(phaseColor, .22));
    g.addColorStop(1, "#fff0a8");
    shadow(0, 0, 14, hexToRgba(phaseColor, .58), () => fill(g, x, y, filled, h, h / 2));
    if (filled > 6) fill("rgba(255,255,255,.18)", x + 2, y + 2, filled - 4, Math.max(1, h * .28), h / 3);
  }
  const active = enemy.bossPhases[clamp(Number(enemy.bossPhase) || 0, 0, enemy.bossPhases.length - 1)];
  if (active) textFit(active.name, x + w / 2, y - 7, w, viewport.portrait ? 14 : 11, activeFloorUi().title, "center");
}

function drawDungeonMap() {
  refreshReachableNodes();
  const lw = layoutW();
  const lh = layoutH();
  const portrait = viewport.portrait;
  const mapX = portrait ? 24 : 42;
  const mapY = portrait ? 150 : 126;
  const mapW = portrait ? lw - 48 : lw - 380;
  const mapH = portrait ? Math.min(720, lh - 650) : lh - 204;
  const panelX = portrait ? 24 : lw - 315;
  const panelY = portrait ? mapY + mapH + 24 : 126;
  const panelW = portrait ? lw - 48 : 275;
  const panelH = portrait ? Math.max(520, lh - panelY - 28) : mapH;
  const ui = activeFloorUi();

  shadow(0, 28, 70, "rgba(0,0,0,.5)", () => {
    gradientRound(mapX, mapY, mapW, mapH, 24, [[0, ui.panelTop], [.52, ui.panelMid], [1, ui.panelBottom]], true);
  });
  strokeRound(mapX, mapY, mapW, mapH, 24, ui.border, 4);
  strokeRound(mapX + 14, mapY + 14, mapW - 28, mapH - 28, 18, "rgba(238,231,215,.08)", 1);
  drawMapCarpet(mapX, mapY, mapW, mapH);
  drawMapHeader(lw, portrait);
  drawMapConnections(mapX, mapY, mapW, mapH);
  game.map.nodes.forEach((node) => drawPolishedMapNode(node, mapX, mapY, mapW, mapH));
  drawPolishedMapPanel(panelX, panelY, panelW, panelH);
  if (game.developerTest) drawDeveloperMapNavigatorControls(mapX, mapY, mapW, mapH, panelX, panelY, panelW);
}

function drawMapCarpet(x, y, w, h) {
  if (drawRawAssetCover(game.map.backgroundAsset, x + 10, y + 10, w - 20, h - 20, .92)) {
    fill("rgba(5,4,8,.18)", x, y, w, h, 24);
    drawRawAssetContain(game.map.decorationAsset, x + w * .36, y + h * .12, w * .28, h * .22, .72);
    return;
  }
  ctx.save();
  ctx.globalAlpha = .15;
  ctx.strokeStyle = game.map.color;
  ctx.lineWidth = 2;
  for (let yy = y + 44; yy < y + h - 34; yy += 56) {
    ctx.beginPath();
    ctx.moveTo(x + 34, yy);
    ctx.lineTo(x + w - 34, yy + 18);
    ctx.stroke();
  }
  ctx.globalAlpha = .07;
  for (let xx = x + 74; xx < x + w - 44; xx += 86) {
    ctx.beginPath();
    ctx.moveTo(xx, y + 28);
    ctx.lineTo(xx - 36, y + h - 28);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloorTransition() {
  const lw = layoutW(), lh = layoutH(), portrait = viewport.portrait;
  const t = game.floorTransition || { from: 1, to: 2, startedAt: Date.now(), duration: 2800 };
  const progress = clamp((Date.now() - t.startedAt) / Math.max(1, t.duration), 0, 1);
  const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  const from = clamp(t.from || 1, 1, FLOORS);
  const to = clamp(t.to || from + 1, 1, FLOORS);
  fill("rgba(0,0,0,.58)", 0, 0, lw, lh);
  const ui = activeFloorUi();
  const panelW = Math.min(portrait ? lw - 48 : 720, lw - 60);
  const panelH = Math.min(portrait ? 760 : 520, lh - 70);
  const x = (lw - panelW) / 2;
  const y = (lh - panelH) / 2;
  shadow(0, 18, 42, "rgba(0,0,0,.5)", () => gradientRound(x, y, panelW, panelH, 24, [[0, hexToRgba(activeFloorColor(), .42)], [.5, "#15101c"], [1, "#080d12"]], true));
  strokeRound(x, y, panelW, panelH, 24, ui.accent, 3);
  text("FLOOR CLEARED", x + panelW / 2, y + 66, portrait ? 38 : 34, C.gold, "center", "serif");
  text(`Elevator climbing to Floor ${to}`, x + panelW / 2, y + 108, portrait ? 23 : 20, C.text, "center");

  const shaftX = x + panelW / 2;
  const shaftTop = y + (portrait ? 160 : 145);
  const footerY = y + panelH - 45;
  const shaftBottom = footerY - (portrait ? 96 : 82);
  const shaftH = Math.max(220, shaftBottom - shaftTop);
  strokeRound(shaftX - 78, shaftTop - 24, 156, shaftH + 48, 28, "rgba(238,231,215,.18)", 2);
  fill("rgba(0,0,0,.28)", shaftX - 62, shaftTop - 10, 124, shaftH + 20, 22);
  const floorY = (floor) => shaftTop + shaftH - ((floor - 1) / Math.max(1, FLOORS - 1)) * shaftH;
  const fromY = floorY(from);
  const toY = floorY(to);
  const elevatorY = fromY + (toY - fromY) * eased;
  ctx.save();
  pathRound(shaftX - 86, shaftTop - 34, 172, shaftH + 68, 30);
  ctx.clip();
  for (let floor = 1; floor <= FLOORS; floor++) {
    const fy = floorY(floor);
    const dist = Math.abs(fy - elevatorY);
    const active = floor === to && progress > .72;
    const passed = floor < to;
    const scale = active ? 1.34 : Math.max(.72, 1.08 - dist / 240);
    const alpha = clamp(1 - dist / (shaftH * .95), .28, 1);
    ctx.globalAlpha = alpha;
    const r = (portrait ? 27 : 23) * scale;
    fill(active ? ui.primaryTop : passed ? hexToRgba(C.gold, .82) : "rgba(238,231,215,.22)", shaftX - r, fy - r, r * 2, r * 2, r);
    strokeRound(shaftX - r, fy - r, r * 2, r * 2, r, active ? "#fff3ad" : "rgba(255,255,255,.25)", active ? 3 : 1.5);
    text(String(floor), shaftX, fy + (portrait ? 11 : 9) * scale, (portrait ? 34 : 28) * scale, active ? C.black : C.text, "center", "serif");
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  const glow = Math.sin(progress * Math.PI) * .85 + .15;
  shadow(0, 0, 28, hexToRgba(C.gold, .45 * glow), () => strokeRound(shaftX - 96, elevatorY - 47, 192, 94, 32, C.gold, 4));
  text("New tables. New rules. Higher stakes.", x + panelW / 2, footerY, portrait ? 20 : 18, C.muted, "center");
}

function drawMapHeader(lw, portrait) {
  const ui = activeFloorUi();
  const titleY = portrait ? 58 : 34;
  const themeY = portrait ? 94 : 64;
  const statY = portrait ? 125 : 96;
  text(`FLOOR ${game.floor + 1}/${FLOORS}`, lw / 2, titleY, portrait ? 30 : 26, ui.titleWarm, "center", "serif");
  text(game.map.theme, lw / 2, themeY, portrait ? 24 : 20, C.text, "center");
  const summary = `Gold ${game.gold}g  •  HP ${game.hp}/${game.maxHp}  •  ${game.relics.length} relic${game.relics.length === 1 ? "" : "s"}`;
  if (portrait) {
    text(summary, lw / 2, statY, 18, C.muted, "center");
  } else {
    const pillW = Math.min(520, Math.max(360, lw * .32));
    const pillX = lw / 2 - pillW / 2;
    fill("rgba(8,6,12,.72)", pillX, statY - 21, pillW, 32, 16);
    strokeRound(pillX, statY - 21, pillW, 32, 16, hexToRgba(activeFloorColor(), .55), 1.5);
    text(summary, lw / 2, statY, 15, C.text, "center");
  }
  addButton(lw - (portrait ? 142 : 124), portrait ? 40 : 28, portrait ? 112 : 90, portrait ? 54 : 38, "Menu", () => menuOpen = true);
}

function drawDeveloperMapNavigatorControls(mapX, mapY, mapW, mapH, panelX, panelY, panelW) {
  const portrait = viewport.portrait;
  const barX = mapX + 18;
  const barY = mapY + 18;
  const barW = portrait ? Math.min(mapW - 36, 520) : Math.min(mapW - 36, 600);
  const barH = portrait ? 162 : 92;
  shadow(0, 16, 32, "rgba(0,0,0,.38)", () => {
    gradientRound(barX, barY, barW, barH, 16, [[0, "rgba(48,35,63,.95)"], [1, "rgba(13,10,18,.94)"]], true);
  });
  strokeRound(barX, barY, barW, barH, 16, "rgba(95,200,234,.65)", 2);
  text("DEV MAP NAVIGATOR", barX + 18, barY + (portrait ? 27 : 25), portrait ? 17 : 13, "#8be3ff");
  text(`Floor ${game.floor + 1}/${FLOORS}`, barX + barW - 18, barY + (portrait ? 27 : 25), portrait ? 17 : 13, C.gold, "right");
  const selected = getMapNode(inspectedNodeId);
  const hasEncounter = !!selected?.encounter;
  const canClear = hasEncounter || !!game.activeEncounterId;
  const buttonY = barY + (portrait ? 46 : 38);
  const gap = 8;
  const rowW = barW - 28;
  if (portrait) {
    const half = (rowW - gap) / 2;
    addButton(barX + 14, buttonY, half, 48, "← Floor", devMapPreviousFloor, false, game.floor > 0);
    addButton(barX + 14 + half + gap, buttonY, half, 48, "Floor →", devMapNextFloor, false, game.floor < FLOORS - 1);
    addButton(barX + 14, buttonY + 56, half, 48, "Enter", devMapEnterSelected, true, hasEncounter);
    addButton(barX + 14 + half + gap, buttonY + 56, half, 48, "Clear", devMapClearEncounter, false, canClear);
  } else {
    const buttonW = (rowW - gap * 3) / 4;
    addButton(barX + 14, buttonY, buttonW, 42, "← Floor", devMapPreviousFloor, false, game.floor > 0);
    addButton(barX + 14 + (buttonW + gap), buttonY, buttonW, 42, "Floor →", devMapNextFloor, false, game.floor < FLOORS - 1);
    addButton(barX + 14 + (buttonW + gap) * 2, buttonY, buttonW, 42, "Enter", devMapEnterSelected, true, hasEncounter);
    addButton(barX + 14 + (buttonW + gap) * 3, buttonY, buttonW, 42, "Clear", devMapClearEncounter, false, canClear);
  }
  if (selected?.encounter) {
    const hintY = portrait ? panelY - 12 : mapY + mapH - 18;
    text(`Selected: ${selected.label}`, portrait ? panelX + panelW / 2 : mapX + mapW / 2, hintY, portrait ? 15 : 13, "#8be3ff", "center");
  }
}

function drawDeveloperTableNavigatorControls() {
  if (!game?.developerTest) return;
  const lw = layoutW();
  const portrait = viewport.portrait;
  const w = portrait ? Math.min(lw - 32, 560) : 660;
  const h = portrait ? 150 : 78;
  const x = lw / 2 - w / 2;
  const y = portrait ? 18 : 18;
  shadow(0, 16, 34, "rgba(0,0,0,.44)", () => {
    gradientRound(x, y, w, h, 16, [[0, "rgba(48,35,63,.96)"], [1, "rgba(9,8,13,.95)"]], true);
  });
  strokeRound(x, y, w, h, 16, "rgba(95,200,234,.7)", 2);
  const node = getMapNode(game.activeEncounterId) || getMapNode(inspectedNodeId);
  text(`DEV TABLE TESTER • Floor ${game.floor + 1}/${FLOORS}${node ? ` • ${node.label}` : ""}`, x + 18, y + (portrait ? 27 : 25), portrait ? 16 : 13, "#8be3ff");
  const gap = 8;
  const rowY = y + (portrait ? 46 : 32);
  if (portrait) {
    const half = (w - 44) / 2;
    addButton(x + 14, rowY, half, 44, "← Floor", devMapPreviousFloor, false, game.floor > 0);
    addButton(x + 22 + half, rowY, half, 44, "Floor →", devMapNextFloor, false, game.floor < FLOORS - 1);
    addButton(x + 14, rowY + 52, half, 44, "Back to Map", devMapReturnToMap, true);
    addButton(x + 22 + half, rowY + 52, half, 44, "Clear Table", devMapClearEncounter, false, !!game.activeEncounterId);
  } else {
    const buttonW = (w - 44 - gap * 3) / 4;
    addButton(x + 14, rowY, buttonW, 38, "← Floor", devMapPreviousFloor, false, game.floor > 0);
    addButton(x + 14 + (buttonW + gap), rowY, buttonW, 38, "Floor →", devMapNextFloor, false, game.floor < FLOORS - 1);
    addButton(x + 14 + (buttonW + gap) * 2, rowY, buttonW, 38, "Back to Map", devMapReturnToMap, true);
    addButton(x + 14 + (buttonW + gap) * 3, rowY, buttonW, 38, "Clear Table", devMapClearEncounter, false, !!game.activeEncounterId);
  }
}

function drawMapConnections(mapX, mapY, mapW, mapH) {
  ctx.save();
  ctx.lineCap = "round";
  const selectedRouteId = game.mapVotes?.[localPlayerId] || inspectedNodeId;
  const ui = activeFloorUi();
  for (const node of game.map.nodes) {
    const from = mapPoint(node, mapX, mapY, mapW, mapH);
    for (const nextId of node.next || []) {
      const next = getMapNode(nextId);
      if (!next) continue;
      const to = mapPoint(next, mapX, mapY, mapW, mapH);
      const selectedReachableEdge = nextId === selectedRouteId && next.reachable && (node.current || node.cleared);
      const clearedEdge = node.cleared && next.cleared;
      ctx.strokeStyle = selectedReachableEdge ? hexToRgba(ui.accent, .9) : clearedEdge ? "rgba(92,190,120,.58)" : "rgba(238,231,215,.32)";
      ctx.lineWidth = selectedReachableEdge ? 5.5 : clearedEdge ? 4.5 : 3.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      const midX = (from.x + to.x) / 2;
      ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x, to.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPolishedMapNode(node, mapX, mapY, mapW, mapH) {
  const p = mapPoint(node, mapX, mapY, mapW, mapH);
  const portrait = viewport.portrait;
  const size = portrait ? 82 : 70;
  const w = node.kind === "elevator" ? size * .86 : node.kind === "boss" ? size * 1.18 : size;
  const h = node.kind === "elevator" ? size * 2.08 : node.kind === "boss" ? size * 1.18 : size;
  const x = p.x - w / 2;
  const y = p.y - h / 2;
  const selected = inspectedNodeId === node.id || game.mapVotes?.[localPlayerId] === node.id;
  const selectedReachable = selected && node.reachable;
  const selectedFuture = selected && !node.reachable && !node.cleared && !node.current;
  const ui = activeFloorUi();
  const border = node.cleared ? C.green : selectedReachable ? ui.accent : selectedFuture ? "rgba(218,225,232,.92)" : node.current ? ui.title : node.reachable ? "rgba(238,231,215,.66)" : "rgba(238,231,215,.46)";
  const fillColor = node.kind === "start" ? C.blue : node.kind === "elevator" ? "#5fc8ea" : node.kind === "boss" ? node.color || game.map.bossColor : node.color;
  const nodeAsset = mapNodeDrawableAsset(node);
  const lockedAlpha = node.locked ? .78 : 1;
  const drewNodeAsset = !!nodeAsset && drawRawAssetContain(nodeAsset, x - w * .16, y - h * .16, w * 1.32, h * 1.32, lockedAlpha);
  ctx.save();
  ctx.globalAlpha = lockedAlpha;
  if (!drewNodeAsset) {
    shadow(0, selected ? 0 : 16, selected ? 34 : 22, selected ? fillColor : "rgba(0,0,0,.48)", () => {
      if (node.kind === "start") {
        fill(fillColor, x, y, w, h, w / 2);
      } else if (node.kind === "boss") {
        polygon(p.x, p.y, w / 2, 8, fillColor);
      } else {
        gradientRound(x, y, w, h, 14, [[0, lighten(fillColor, .22)], [.58, fillColor], [1, "#17111d"]], true);
        fill("rgba(255,255,255,.14)", x + 9, y + 9, w - 18, 10, 6);
      }
    });
  }
  ctx.globalAlpha = 1;
  const strokeWidth = selectedReachable || selectedFuture ? 5 : node.reachable || node.cleared || node.current ? 4 : 3;
  if (node.kind === "boss") polygonStroke(p.x, p.y, w / 2, 8, border, strokeWidth);
  else strokeRound(x, y, w, h, node.kind === "start" ? w / 2 : 14, border, strokeWidth);
  const label = node.kind === "elevator" ? "" : node.kind === "start" ? "GO" : node.kind === "boss" ? "BOSS" : node.reward?.icon || "T";
  const hideAssetLabel = drewNodeAsset && (node.kind === "start" || node.kind === "table");
  if (node.kind === "boss") {
    const badgeW = Math.max(88, w * 1.08);
    const badgeH = portrait ? 30 : 26;
    const badgeY = y - badgeH / 2 - (portrait ? 8 : 6);
    shadow(0, 0, 18, "rgba(0,0,0,.55)", () => {
      gradientRound(p.x - badgeW / 2, badgeY, badgeW, badgeH, badgeH / 2, [[0, ui.primaryTop], [1, ui.primaryBottom]], true);
    });
    strokeRound(p.x - badgeW / 2, badgeY, badgeW, badgeH, badgeH / 2, ui.primaryStroke, 2);
    text("Floor Boss", p.x, badgeY + (portrait ? 21 : 18), portrait ? 15 : 13, ui.primaryText, "center", "serif");
  } else if (label && !hideAssetLabel) {
    text(label, p.x, p.y + 8, 24, C.black, "center", "serif");
  }
  if (node.kind === "table" || node.kind === "boss") {
    const tagW = Math.min(116, Math.max(74, w + 24));
    const tagH = portrait ? 42 : 34;
    const tagX = p.x - tagW / 2;
    const tagY = y + h + 7;
    const textX = tagX + tagW / 2;
    fill("rgba(0,0,0,.52)", tagX, tagY, tagW, tagH, 9);
    strokeRound(tagX, tagY, tagW, tagH, 9, "rgba(238,231,215,.12)", 1);
    text(node.rarity.name, textX, tagY + (portrait ? 18 : 14), portrait ? 15 : 11, node.rarity.color, "center");
    text(`Threat ${node.threat}`, textX, tagY + (portrait ? 36 : 28), portrait ? 12 : 10, C.muted, "center");
  } else {
    text(node.label, p.x, y + h + (portrait ? 24 : 18), portrait ? 15 : 11, C.muted, "center");
  }
  ctx.restore();
  buttons.push({ x, y, w, h: h + 50, onClick: () => { inspectedNodeId = node.id; } });
}

function mapNodeDrawableAsset(node) {
  const preferred = node.assetKey;
  if (handAssetReady(preferred)) return preferred;
  if (node.kind === "start" && handAssetReady("map:start")) return "map:start";
  if (node.kind === "elevator") {
    const floorElevator = `map:${game.map.floorKey}:elevator`;
    if (handAssetReady(floorElevator)) return floorElevator;
    if (handAssetReady("map:elevator")) return "map:elevator";
  }
  if (node.kind === "boss") {
    const floorBoss = `map:${game.map.floorKey}:bossTable`;
    if (handAssetReady(floorBoss)) return floorBoss;
  }
  if (node.kind === "table") {
    const floorTable = `map:${game.map.floorKey}:table`;
    if (handAssetReady(floorTable)) return floorTable;
    const rarityKey = `map:table${capitalize(node.rarity?.key || "common")}`;
    if (handAssetReady(rarityKey)) return rarityKey;
    if (handAssetReady("map:tableCommon")) return "map:tableCommon";
  }
  return "";
}

function drawPolishedMapPanel(x, y, w, h) {
  const portrait = viewport.portrait;
  const selected = getMapNode(inspectedNodeId) || reachableMapNodes()[0] || getMapNode(game.currentNodeId);
  const solo = game.seats.filter((s) => !s.spectating).length <= 1;
  const theme = activeFloorColor();
  const ui = activeFloorUi();
  shadow(0, 24, 55, "rgba(0,0,0,.45)", () => {
    gradientRound(x, y, w, h, 20, [[0, ui.panelTop], [.48, ui.panelMid], [1, ui.panelBottom]], true);
  });
  strokeRound(x, y, w, h, 20, hexToRgba(ui.border, .66), 2);
  fill(ui.panelWash, x + 16, y + 16, w - 32, 54, 14);
  strokeRound(x + 16, y + 16, w - 32, 54, 14, hexToRgba(ui.border, .28), 1);
  text("Route Planner", x + w / 2, y + 51, portrait ? 28 : 21, ui.titleWarm, "center", "serif");
  if (!selected) return;

  const node = selected;
  const contentX = x + 24;
  const contentW = w - 48;
  const status = node.reachable ? "Reachable now" : node.cleared ? "Cleared" : node.current ? "Current position" : "Future path preview";
  const statusColor = node.reachable ? C.green : node.cleared ? C.green : C.muted;
  textFit(node.label, contentX, y + 104, contentW, portrait ? 26 : 20, C.text);
  badge(contentX + 72, y + 132, status, statusColor);

  const rewardY = y + (portrait ? 172 : 158);
  drawMapRewardCard(node, contentX, rewardY, contentW, portrait);
  const encounterY = rewardY + (portrait ? 128 : 116);
  drawMapEncounterCard(node, contentX, encounterY, contentW, portrait);

  if (solo) {
    drawSoloMapControls(x, y, w, h, node, portrait);
  } else {
    drawPartyMapControls(x, y, w, h, node, portrait);
  }
}

function drawMapRewardCard(node, x, y, w, portrait) {
  const ui = activeFloorUi();
  const h = portrait ? 104 : 94;
  fill("rgba(8,6,12,.44)", x, y, w, h, 14);
  strokeRound(x, y, w, h, 14, node.reward ? node.rarity.color : "rgba(238,231,215,.12)", node.reward ? 2 : 1);
  if (!node.reward) {
    text(node.kind === "elevator" ? "Elevator" : "No reward", x + 18, y + 34, portrait ? 20 : 15, ui.title);
    wrapTextSized(node.kind === "elevator" ? "Beat the mini boss to open the doors." : "Gather the party and start the climb.", x + 18, y + 62, w - 36, portrait ? 18 : 13, portrait ? 15 : 12, C.muted, 2);
    buttons.push({ x, y, w, h, onClick: () => { mapInfoDetail = { title: node.kind === "elevator" ? "Elevator" : "Route Start", subtitle: node.label, color: ui.title, body: node.kind === "elevator" ? "Beat the floor boss to unlock the elevator and climb to the next casino floor." : "This is where the party starts the floor. Pick a reachable table to choose the next fight." }; } });
    return;
  }
  drawRelicIcon(node.reward, x + 37, y + 50, portrait ? 58 : 50, node.rarity.color);
  textFit(node.reward.name, x + 66, y + 34, w - 82, portrait ? 21 : 16, node.rarity.color);
  wrapTextSized(node.reward.description, x + 66, y + 60, w - 84, portrait ? 18 : 13, portrait ? 15 : 12, C.text, 2);
  buttons.push({ x, y, w, h, onClick: () => { mapInfoDetail = { title: node.reward.name, subtitle: `${node.rarity.name} relic reward`, color: node.rarity.color, body: node.reward.description, relic: node.reward }; } });
}

function drawMapEncounterCard(node, x, y, w, portrait) {
  if (!node.encounter) return;
  const ui = activeFloorUi();
  const h = portrait ? 112 : 104;
  fill("rgba(0,0,0,.28)", x, y, w, h, 14);
  strokeRound(x, y, w, h, 14, "rgba(238,231,215,.12)", 1);
  textFit(node.encounter.name, x + 18, y + 31, w - 34, portrait ? 20 : 15, ui.title);
  text(`Threat ${node.threat}/5`, x + 18, y + (portrait ? 59 : 54), portrait ? 18 : 13, C.text);
  wrapTextSized(node.encounter.description, x + 18, y + (portrait ? 84 : 77), w - 36, portrait ? 17 : 12, portrait ? 14 : 11, C.muted, 2);
  buttons.push({ x, y, w, h, onClick: () => { mapInfoDetail = { title: node.encounter.name, subtitle: `Threat ${node.threat}/5`, color: ui.title, body: `${node.encounter.description} Higher threat tables hit harder, pay better relic rarity, and usually have nastier house rules.` }; } });
}

function drawMapInfoOverlay() {
  const lw = layoutW();
  const lh = layoutH();
  const portrait = viewport.portrait;
  const w = portrait ? Math.min(lw - 44, 620) : 520;
  const hasRelicArt = !!mapInfoDetail.relic;
  const h = portrait ? 360 : 300;
  const x = lw / 2 - w / 2;
  const y = lh / 2 - h / 2;
  const bodyY = y + 118;
  buttons = [];
  fill("rgba(0,0,0,.64)", 0, 0, lw, lh);
  const ui = activeFloorUi();
  shadow(0, 24, 70, "rgba(0,0,0,.55)", () => {
    gradientRound(x, y, w, h, 22, [[0, ui.panelTop], [.5, ui.panelMid], [1, ui.panelBottom]], true);
  });
  strokeRound(x, y, w, h, 22, mapInfoDetail.color || ui.title, 2);
  textFit(mapInfoDetail.title, x + 28, y + 48, hasRelicArt ? w - (portrait ? 172 : 144) : w - 56, portrait ? 28 : 23, mapInfoDetail.color || ui.title, "left", "serif");
  if (mapInfoDetail.subtitle) text(mapInfoDetail.subtitle, x + 28, y + 78, portrait ? 18 : 14, C.muted);
  if (hasRelicArt) {
    const iconSize = portrait ? 104 : 88;
    drawRelicIcon(mapInfoDetail.relic, x + w - 28 - iconSize / 2, y + 28 + iconSize / 2, iconSize, mapInfoDetail.color || ui.title);
  }
  wrapTextSized(mapInfoDetail.body || "", x + 28, bodyY, w - 56, portrait ? 22 : 17, portrait ? 18 : 15, C.text, portrait ? 8 : 7);
  addButton(x + 28, y + h - (portrait ? 80 : 66), w - 56, portrait ? 58 : 48, "Close", () => { mapInfoDetail = null; }, true);
}

function drawRelicRewardPopup() {
  const relic = game.relicPopup?.relic;
  if (!relic) {
    game.relicPopup = null;
    return;
  }
  const age = Date.now() - (game.relicPopup.shownAt || Date.now());
  if (age > 12000) {
    game.relicPopup = null;
    return;
  }
  const lw = layoutW();
  const lh = layoutH();
  const portrait = viewport.portrait;
  const w = portrait ? Math.min(lw - 44, 620) : 560;
  const h = portrait ? 420 : 340;
  const x = lw / 2 - w / 2;
  const y = lh / 2 - h / 2;
  const color = relic.rarityColor || C.gold;
  buttons = [];
  fill("rgba(0,0,0,.66)", 0, 0, lw, lh);
  shadow(0, 28, 80, "rgba(0,0,0,.6)", () => {
    gradientRound(x, y, w, h, 24, [[0, hexToRgba(color, .32)], [.44, "#18101f"], [1, "#10161a"]], true);
  });
  strokeRound(x, y, w, h, 24, color, 3);
  fill("rgba(255,255,255,.08)", x + 18, y + 18, w - 36, 72, 16);
  text("TABLE CLEARED", x + w / 2, y + 51, portrait ? 26 : 20, C.muted, "center", "serif");
  text("Relic Acquired", x + w / 2, y + 82, portrait ? 32 : 26, C.gold, "center", "serif");
  drawRelicIcon(relic, x + w / 2, y + (portrait ? 158 : 142), portrait ? 96 : 82, color);
  textFit(relic.name, x + w / 2, y + (portrait ? 234 : 210), w - 72, portrait ? 34 : 28, color, "center");
  wrapTextSized(relic.description, x + 50, y + (portrait ? 282 : 250), w - 100, portrait ? 26 : 21, portrait ? 21 : 17, C.text, 3);
  addButton(x + 38, y + h - (portrait ? 82 : 66), w - 76, portrait ? 58 : 48, "Continue", () => { game.relicPopup = null; }, true);
}

function drawSoloMapControls(x, y, w, h, node, portrait) {
  const canEnter = node.reachable && node.kind !== "elevator";
  const label = canEnter ? "Enter Table" : node.cleared ? "Already Cleared" : "Inspecting";
  addButton(x + 24, y + h - (portrait ? 86 : 68), w - 48, portrait ? 62 : 50, label, () => action(`enterMap:${node.id}`), true, canEnter);
}

function drawPartyMapControls(x, y, w, h, node, portrait) {
  const votes = game.mapVotes || {};
  const baseY = y + h - (portrait ? 214 : 188);
  const ui = activeFloorUi();
  fill("rgba(238,231,215,.06)", x + 24, baseY - 12, w - 48, 1);
  text("Party route", x + 24, baseY + 18, portrait ? 20 : 15, ui.title);
  game.seats.forEach((seat, i) => {
    const voteNode = getMapNode(votes[seat.id]);
    const ready = game.mapReady?.[seat.id];
    const prefix = ready ? "Ready" : "Open";
    textFit(`${prefix}: ${seat.name} -> ${voteNode?.label || "choosing"}`, x + 24, baseY + 48 + i * (portrait ? 24 : 19), w - 48, portrait ? 16 : 12, ready ? C.green : C.muted);
  });
  const myVote = votes[localPlayerId] === node.id;
  const canVote = node.reachable && node.kind !== "elevator";
  const ready = !!game.mapReady?.[localPlayerId];
  const buttonW = Math.floor((w - 58) / 2);
  addButton(x + 24, y + h - (portrait ? 86 : 68), buttonW, portrait ? 62 : 50, myVote ? "Voted" : "Vote", () => action(`select:${node.id}`), true, canVote);
  addButton(x + 34 + buttonW, y + h - (portrait ? 86 : 68), buttonW, portrait ? 62 : 50, ready ? "Unready" : "Ready", () => action("readyMap"), true, !!votes[localPlayerId] || reachableMapNodes().length === 1);
}

function drawMapNode(node, mapX, mapY, mapW, mapH) {
  const p = mapPoint(node, mapX, mapY, mapW, mapH);
  const portrait = viewport.portrait;
  const size = portrait ? 82 : 70;
  const w = node.kind === "elevator" ? size * .9 : node.kind === "boss" ? size * 1.15 : size;
  const h = node.kind === "elevator" ? size * 2.1 : node.kind === "boss" ? size * 1.15 : size;
  const x = p.x - w / 2;
  const y = p.y - h / 2;
  const selected = inspectedNodeId === node.id || game.mapVotes?.[localPlayerId] === node.id;
  const border = node.cleared ? C.green : node.reachable ? C.gold : selected ? C.parchment : "rgba(238,231,215,.22)";
  const alpha = node.locked ? .5 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const fillColor = node.kind === "start" ? C.blue : node.kind === "elevator" ? "#5fc8ea" : node.kind === "boss" ? game.map.color : node.color;
  shadow(0, selected ? 0 : 14, selected ? 30 : 20, selected ? node.color || C.gold : "rgba(0,0,0,.45)", () => {
    if (node.kind === "start") {
      fill(fillColor, x, y, w, h, w / 2);
    } else if (node.kind === "boss") {
      polygon(p.x, p.y, w / 2, 8, fillColor);
    } else {
      gradientRound(x, y, w, h, 12, [[0, lighten(fillColor, .18)], [1, fillColor]], true);
    }
  });
  if (node.kind === "boss") polygonStroke(p.x, p.y, w / 2, 8, border, selected ? 5 : 3);
  else strokeRound(x, y, w, h, node.kind === "start" ? w / 2 : 12, border, selected ? 5 : 3);
  const label = node.kind === "elevator" ? "E" : node.kind === "start" ? "▶" : node.kind === "boss" ? "BOSS" : node.reward?.icon || "T";
  text(label, p.x, p.y + (node.kind === "boss" ? 6 : 8), node.kind === "boss" ? 17 : 25, node.kind === "elevator" ? "#fff" : C.black, "center", "serif");
  if (node.kind === "table" || node.kind === "boss") {
    text(node.rarity.name, p.x, y + h + (portrait ? 24 : 19), portrait ? 16 : 12, node.rarity.color, "center");
    text(`★`.repeat(node.threat), p.x, y + h + (portrait ? 45 : 35), portrait ? 15 : 11, C.gold, "center");
  } else {
    text(node.label, p.x, y + h + (portrait ? 24 : 18), portrait ? 15 : 11, C.muted, "center");
  }
  ctx.restore();
  buttons.push({ x, y, w, h: h + 48, onClick: () => { inspectedNodeId = node.id; } });
}

function drawMapPanel(x, y, w, h) {
  const portrait = viewport.portrait;
  const selected = getMapNode(inspectedNodeId) || reachableMapNodes()[0] || getMapNode(game.currentNodeId);
  shadow(0, 24, 55, "rgba(0,0,0,.45)", () => {
    gradientRound(x, y, w, h, 18, [[0, "#2a2037"], [.46, "#14101b"], [1, "#10151a"]], true);
  });
  strokeRound(x, y, w, h, 18, "rgba(220,180,70,.32)", 2);
  text("Route Planner", x + w / 2, y + 42, portrait ? 28 : 22, C.gold, "center", "serif");
  if (!selected) return;
  const node = selected;
  textFit(node.label, x + 24, y + 82, w - 48, portrait ? 25 : 19, C.text);
  textFit(node.reachable ? "Reachable now" : node.cleared ? "Cleared" : node.current ? "Current position" : "Future path preview", x + 24, y + 112, w - 48, portrait ? 18 : 14, node.reachable ? C.green : C.muted);
  if (node.reward) {
    drawRelicRow(node.reward, x + 24, y + 154, w - 48, true);
    textFit(`${node.rarity.name} Reward`, x + 24, y + (portrait ? 254 : 230), w - 48, portrait ? 20 : 15, node.rarity.color);
  } else {
    textFit(node.kind === "elevator" ? "The elevator opens after the mini boss." : "Gather the party and start the climb.", x + 24, y + 160, w - 48, portrait ? 20 : 15, C.muted);
  }
  if (node.encounter) {
    const infoY = portrait ? y + 292 : y + 265;
    fill("rgba(0,0,0,.24)", x + 24, infoY - 24, w - 48, portrait ? 128 : 118, 12);
    strokeRound(x + 24, infoY - 24, w - 48, portrait ? 128 : 118, 12, "rgba(238,231,215,.10)", 1);
    textFit(node.encounter.name, x + 42, infoY + 4, w - 84, portrait ? 20 : 15, C.gold);
    text(`Threat ${node.threat}/5`, x + 42, infoY + (portrait ? 34 : 30), portrait ? 18 : 14, C.text);
    wrapTextSized(node.encounter.description, x + 42, infoY + (portrait ? 62 : 56), w - 84, portrait ? 18 : 13, portrait ? 15 : 12, C.muted, 2);
  }
  drawMapVotePanel(x, y, w, h, node);
}

function drawMapVotePanel(x, y, w, h, node) {
  const portrait = viewport.portrait;
  const baseY = y + h - (portrait ? 190 : 168);
  fill("rgba(238,231,215,.06)", x + 24, baseY - 18, w - 48, 1);
  text("Party votes", x + 24, baseY + 16, portrait ? 20 : 15, C.gold);
  const votes = game.mapVotes || {};
  game.seats.forEach((seat, i) => {
    const voteNode = getMapNode(votes[seat.id]);
    const ready = game.mapReady?.[seat.id];
    textFit(`${ready ? "✓" : "○"} ${seat.name}: ${voteNode?.label || "choosing"}`, x + 24, baseY + 48 + i * (portrait ? 25 : 20), w - 48, portrait ? 17 : 13, ready ? C.green : C.muted);
  });
  const myVote = votes[localPlayerId] === node.id;
  const canVote = node.reachable && node.kind !== "elevator";
  const ready = !!game.mapReady?.[localPlayerId];
  addButton(x + 24, y + h - (portrait ? 92 : 78), Math.floor((w - 58) / 2), portrait ? 64 : 52, myVote ? "Voted" : "Vote", () => action(`select:${node.id}`), true, canVote);
  addButton(x + 34 + Math.floor((w - 58) / 2), y + h - (portrait ? 92 : 78), Math.floor((w - 58) / 2), portrait ? 64 : 52, ready ? "Unready" : "Ready", () => action("readyMap"), true, !!votes[localPlayerId] || reachableMapNodes().length === 1);
}

function mapPoint(node, mapX, mapY, mapW, mapH) {
  return { x: mapX + node.x * mapW, y: mapY + node.y * mapH };
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
    const isReady = game.phase === "betting" && seat.ready;
    if (isActive) {
      shadow(0, 0, 26, "rgba(220,180,70,.42)", () => {
        gradientRound(x - 18, y - 42, seatW, 150, 14, [[0, "rgba(68,55,35,.9)"], [1, "rgba(20,30,24,.9)"]]);
      });
    } else if (isReady) {
      shadow(0, 0, 22, "rgba(90,180,110,.35)", () => {
        fill("rgba(20,50,34,.48)", x - 18, y - 42, seatW, 150, 14);
      });
    } else {
      fill("rgba(5,8,7,.28)", x - 18, y - 42, seatW, 150, 14);
    }
    strokeRound(x - 18, y - 42, seatW, 150, 14, isActive ? C.gold : isReady ? C.green : "rgba(238,231,215,.11)", isActive || isReady ? 3 : 1);
    const rank = playerRankIcon(seat);
    const displayName = `${rank}${seat.name}${seat.id === localPlayerId ? " (You)" : ""}`;
    const nameColor = seatInDebt(seat) ? C.red : isActive ? C.gold : C.text;
    text(fitLabel(displayName, seatW - 125, portrait ? 20 : 18), x, y - 18, portrait ? 20 : 18, nameColor);
    text(seatStatus(seat), x + seatW - 40, y - 18, portrait ? 18 : 14, C.muted, "right");
    if (seat.hands.length > 1) buttons.push({ x: x - 18, y: y - 42, w: seatW, h: 42, onClick: () => statsPlayerId = seat.id });
    if (seat.hands.length) {
      const activeIndex = clamp(seat.active ?? 0, 0, seat.hands.length - 1);
      const shouldFollowActive = game.phase === "player" && (game.freePlay ? !seat.finished : active?.id === seat.id);
      if (handCarousel[seat.id] == null) {
        handCarousel[seat.id] = activeIndex;
        handCarouselActiveIndex[seat.id] = activeIndex;
      } else if (shouldFollowActive && handCarouselActiveIndex[seat.id] !== activeIndex) {
        handCarouselActiveIndex[seat.id] = activeIndex;
        setHandCarousel(seat.id, activeIndex, seat.hands.length);
      } else if (!shouldFollowActive) {
        handCarouselActiveIndex[seat.id] = activeIndex;
      }
      const selected = clamp(handCarousel[seat.id] ?? activeIndex, 0, seat.hands.length - 1);
      handCarousel[seat.id] = selected;
      if (seat.hands.length > 1) {
        const visualIndex = carouselVisualIndex(seat.id, selected);
        const carouselCenter = clamp(Math.round(visualIndex), 0, seat.hands.length - 1);
        const visibleHands = new Set([carouselCenter - 1, carouselCenter, carouselCenter + 1].filter((n) => n >= 0 && n < seat.hands.length));
        const centerX = x + seatW / 2 - CARD_W / 2 - 18;
        const handOrder = [...visibleHands]
          .map((hidx) => ({ hand: seat.hands[hidx], hidx, distance: Math.abs(hidx - visualIndex) }))
          .sort((a, b) => b.distance - a.distance || a.hidx - b.hidx);
        handOrder.forEach(({ hand, hidx }) => {
          const offset = hidx - visualIndex;
          const distance = Math.abs(offset);
          const isFocused = hidx === selected;
          const isPlayingHand = isFocused && (hidx === activeIndex || !isActive);
          const depth = clamp(distance, 0, 1.35);
          ctx.save();
          ctx.globalAlpha = isFocused ? 1 : clamp(.72 - depth * .18, .42, .68);
          const scale = isFocused ? 1 : clamp(.86 - depth * .12, .68, .82);
          const handX = centerX + offset * (portrait ? 94 : 108);
          const handY = y + 8 + depth * 24;
          ctx.translate(handX + CARD_W / 2, handY + CARD_H / 2);
          ctx.rotate(offset * -.11);
          ctx.scale(scale, scale);
          drawHand(hand.cards, -CARD_W / 2, -CARD_H / 2, isPlayingHand, Math.min(210, seatW - 72), true, { x: handX, y: handY });
          ctx.restore();
        });
        const labelColor = selected === activeIndex && isActive ? C.gold : handColor(seat.hands[selected]);
        handStatusBadge(x + seatW / 2, y + 148, `${selected + 1}/${seat.hands.length} ${handLabel(seat.hands[selected])}`, labelColor, seat.hands[selected]);
        buttons.push({ x: x - 18, y: y - 4, w: seatW, h: 112, carouselSeat: seat.id, selected, count: seat.hands.length, onClick: () => {} });
      } else {
        const hand = seat.hands[0];
        drawHand(hand.cards, x, y + 10, isActive, Math.min(220, seatW - 40));
        handStatusBadge(x + 45, y + 148, handLabel(hand), handColor(hand), hand);
      }
    } else {
      drawChips(x + 38, y + 50, seat.bet);
      badge(x + 110, y + 70, `Bet ${seat.bet}g`, C.gold);
      if (isFreeForAll()) {
        const debt = debtForSeat(seat);
        text(`${seatBankroll(seat)}g${debt ? ` / D${debt}g` : ""}`, x + seatW - 42, y + 72, portrait ? 17 : 14, debt ? C.red : C.gold, "right");
      }
    }
    if (seat.hands.length <= 1) buttons.push({ x: x - 18, y: y - 42, w: seatW, h: 150, onClick: () => statsPlayerId = seat.id });
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
  const theme = activeFloorColor();
  const ui = activeFloorUi();
  shadow(0, 24, 55, "rgba(0,0,0,.45)", () => {
    gradientRound(x, 40, 270, 720, 18, [
      [0, ui.panelTop],
      [.44, ui.panelMid],
      [1, ui.panelBottom]
    ], true);
  });
  strokeRound(x, 40, 270, 720, 18, hexToRgba(ui.border, .56), 2);
  gradientRound(x + 14, 52, 176, 42, 10, [[0, ui.panelWash], [1, hexToRgba(ui.accent, .04)]], true);
  strokeRound(x + 14, 52, 176, 42, 10, hexToRgba(ui.border, .28), 1);
  text("DUNGEON", x + 102, 70, 17, ui.titleWarm, "center", "serif");
  text("OF CARDS", x + 102, 86, 10, C.muted, "center", "serif");
  addButton(x + 196, 52, 52, 34, "Menu", () => menuOpen = true);
  fill("rgba(238,231,215,.06)", x + 20, 100, 230, 1);
  text(`Floor ${game.floor + 1}/${enemyTemplates.length}`, x + 22, 112, 18, C.text);
  drawGoldDebtLine(x + 22, 140, 18);
  meter(x + 22, 166, 226, 12, game.hp / game.maxHp, C.red, C.green);
  text(`HP ${game.hp}/${game.maxHp}`, x + 135, 196, 15, C.text, "center");
  if (game.code) badge(x + 135, 226, `Lobby ${game.code}`, C.gold);
  gradientRound(x + 22, 242, 226, 44, 10, [[0, ui.panelWash], [1, hexToRgba(ui.accent, .04)]], true);
  strokeRound(x + 22, 242, 226, 44, 10, hexToRgba(ui.border, .2), 1);
  text(phaseTitle(), x + 135, 271, 22, C.text, "center");
  drawActionButtons(x + 22, 295);
  drawRelicPanel(x + 22, 500, 226);
  fill("rgba(238,231,215,.06)", x + 22, 646, 226, 1);
  text("Log", x + 22, 674, 18, ui.title);
  drawLogPreview(x + 22, 700, 226, 44, 13);
}

function drawBottomPanel() {
  const x = 24;
  const y = 800;
  const w = layoutW() - 48;
  const h = Math.max(720, layoutH() - y - 28);
  const theme = activeFloorColor();
  const ui = activeFloorUi();
  shadow(0, 18, 45, "rgba(0,0,0,.45)", () => {
    gradientRound(x, y, w, h, 18, [
      [0, ui.panelTop],
      [.46, ui.panelMid],
      [1, ui.panelBottom]
    ], true);
  });
  strokeRound(x, y, w, h, 18, hexToRgba(ui.border, .6), 2);
  text("DUNGEON OF CARDS", x + w / 2, y + 48, 30, ui.titleWarm, "center", "serif");
  addButton(x + w - 140, y + 18, 112, 54, "Menu", () => menuOpen = true);

  const leftX = x + 24;
  const rightStatX = x + w - 250;
  text(`Floor ${game.floor + 1}/${enemyTemplates.length}`, leftX, y + 98, 24, C.text);
  drawGoldDebtLine(leftX, y + 134, 24);
  meter(rightStatX, y + 96, 220, 18, game.hp / game.maxHp, C.red, C.green);
  text(`HP ${game.hp}/${game.maxHp}`, rightStatX + 110, y + 136, 21, C.text, "center");
  if (game.code) badge(x + w / 2, y + 178, `Lobby ${game.code}`, C.gold);

  gradientRound(leftX, y + 192, w - 48, 58, 12, [[0, ui.panelWash], [1, hexToRgba(ui.accent, .05)]], true);
  strokeRound(leftX, y + 192, w - 48, 58, 12, hexToRgba(ui.border, .24), 1);
  text(phaseTitle(), x + w / 2, y + 230, 29, C.text, "center");
  drawActionButtons(leftX, y + 264);

  fill("rgba(238,231,215,.06)", leftX, y + 560, w - 48, 1);
  drawRelicPanel(leftX, y + 598, 320);
  text("Log", x + 392, y + 598, 24, ui.title);
  drawLogPreview(x + 392, y + 636, w - 440, 52, 19);
}

function drawRelicPanel(x, y, w) {
  const portrait = viewport.portrait;
  text("Relics", x, y, portrait ? 24 : 18, activeFloorUi().title);
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
  const theme = activeFloorColor();
  const ui = activeFloorUi();
  gradientRound(x, 30, w, 740, 20, [[0, ui.panelTop], [.44, ui.panelMid], [1, ui.panelBottom]], true);
  strokeRound(x, 30, w, 740, 20, hexToRgba(ui.border, .62), 3);
  text("DUNGEON OF CARDS", x + 190, 82, 25, ui.titleWarm, "center", "serif");
  addButton(x + 370, 46, 78, 92, "Menu", () => menuOpen = true);
  text(`Floor ${game.floor + 1}/${enemyTemplates.length}`, x + 24, 142, 27, C.text);
  drawGoldDebtLine(x + 245, 142, 27);
  meter(x + 24, 174, w - 48, 20, game.hp / game.maxHp, C.red, C.green);
  text(`HP ${game.hp}/${game.maxHp}`, x + w / 2, 222, 23, C.text, "center");
  text(phaseTitle(), x + w / 2, 278, 30, C.text, "center");
  drawActionButtons(x + 20, 310);
  text("Relics", x + 24, 560, 24, ui.title);
  const relicSummary = game.relics.length ? `${game.relics.length} collected — tap to view` : "None yet";
  text(relicSummary, x + 24, 598, 20, C.muted);
  buttons.push({ x: x + 18, y: 530, w: w - 36, h: 94, onClick: () => { relicsOpen = true; relicPage = 0; } });
  const latest = game.log[0] || "";
  text("Log", x + 24, 676, 22, ui.title);
  drawLogPreview(x + 24, 700, w - 48, 48, 18);
}

function drawLogPreview(x, y, w, h, size) {
  const latest = game.log?.[0] || "No activity yet.";
  fill("rgba(238,231,215,.045)", x - 8, y - 22, w + 16, h, 8);
  strokeRound(x - 8, y - 22, w + 16, h, 8, "rgba(238,231,215,.1)", 1);
  textFit(latest, x, y, w, size, C.muted);
  text("Click for full log", x, y + Math.max(18, size + 8), Math.max(11, size - 4), activeFloorUi().title);
  buttons.push({ x: x - 8, y: y - 22, w: w + 16, h, onClick: () => { logOpen = true; } });
}

function drawRelicRow(relic, x, y, w, highlight = false) {
  const portrait = viewport.portrait;
  const rowH = portrait ? 74 : 54;
  const ui = activeFloorUi();
  gradientRound(x, y - 14, w, rowH, 8, highlight ? [[0, ui.panelTop], [1, ui.panelBottom]] : [[0, "#1d1624"], [1, "#100d15"]]);
  strokeRound(x, y - 14, w, rowH, 8, highlight ? ui.title : "rgba(238,231,215,.12)", 1);
  drawRelicIcon(relic, x + (portrait ? 29 : 23), y + (portrait ? 22 : 13), portrait ? 44 : 34, C.gold);
  textFit(relic.name, x + (portrait ? 62 : 50), y + (portrait ? 8 : 4), w - (portrait ? 74 : 58), portrait ? 18 : 14, C.gold);
  wrapTextSized(relic.description, x + (portrait ? 62 : 50), y + (portrait ? 34 : 24), w - (portrait ? 74 : 58), portrait ? 18 : 14, portrait ? 15 : 12, C.muted, 2);
}

function drawActionButtons(x, y) {
  if (viewport.portrait) {
    const gap = 14;
    const bw = Math.floor((layoutW() - 96 - gap) / 2);
    const bh = 64;
    const full = bw * 2 + gap;
    if (game.phase === "betting") {
      if (isFreeForAll() && mySeat()?.bankrupt) {
        addButton(x, y, full, 72, "Bankrupt", () => {}, false, false);
        return;
      }
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
      addButton(x, y, bw, bh, "Hit", () => action("hit"), true, myTurn && bossAllowsHit(mine));
      addButton(x + bw + gap, y, bw, bh, "Stand", () => action("stand"), false, myTurn && bossAllowsStand(mine));
      addButton(x, y + 76, bw, bh, "Double", () => action("double"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noDouble && seatBankroll(mySeat()) >= (mine?.bet || 0));
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
      if (isFreeForAll() && mySeat()?.bankrupt) {
        addButton(x, y, 430, 110, "Bankrupt", () => {}, false, false);
        return;
      }
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
      addButton(x, y, bw, bh, "Hit", () => action("hit"), true, myTurn && bossAllowsHit(mine));
      addButton(x + 110, y, bw, bh, "Stand", () => action("stand"), false, myTurn && bossAllowsStand(mine));
      addButton(x + 220, y, bw, bh, "Double", () => action("double"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noDouble && seatBankroll(mySeat()) >= (mine?.bet || 0));
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
    if (isFreeForAll() && mySeat()?.bankrupt) {
      addButton(x, y, 228, 50, "Bankrupt", () => {}, false, false);
      return;
    }
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
    addButton(x, y, 110, 44, "Hit", () => action("hit"), true, myTurn && bossAllowsHit(mine));
    addButton(x + 118, y, 110, 44, "Stand", () => action("stand"), false, myTurn && bossAllowsStand(mine));
    addButton(x, y + 52, 110, 44, "Double", () => action("double"), false, myTurn && mine?.cards.length === 2 && !game.enemy.noDouble && seatBankroll(mySeat()) >= (mine?.bet || 0));
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
  const canBuy = game.code && isFreeForAll() ? true : seatBankroll(mySeat() || game.seats[0]) >= cost;
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
  const iconSize = portrait ? 78 : 64;
  drawRelicIcon(relic, x + 20 + iconSize / 2, y + 20 + iconSize / 2, iconSize, C.gold);
  textFit(relic.name, x + (portrait ? 116 : 100), y + (portrait ? 49 : 45), cardW - (portrait ? 150 : 130), portrait ? 27 : 20, C.gold);
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
  text(isFreeForAll() ? `Your bankroll: ${seatBankroll(mySeat() || game.seats[0])}g` : `Final gold: ${game.gold}g`, lw / 2, 365, 22, C.gold, "center");
  const relicText = game.relics.length ? game.relics.map((r) => r.name).join(", ") : "None";
  text("Relics:", lw / 2, 420, 20, C.gold, "center");
  const lines = wrapLines(relicText, Math.min(820, lw - 80), 16);
  lines.forEach((line, i) => text(line, lw / 2, 448 + i * 22, 16, C.text, "center"));
  addButton(lw / 2 - 140, Math.min(layoutH() - 90, 490 + lines.length * 22), 280, 54, game.code ? "Play Again — Same Lobby" : "Return to Menu", () => action("continue"), true);
}

function drawLoanOffer() {
  const lw = layoutW();
  const lh = layoutH();
  const signer = loanDisplaySigner();
  const portrait = viewport.portrait;
  const panelW = Math.min(portrait ? 650 : 740, lw - 60);
  const panelH = portrait ? 820 : 610;
  const x = (lw - panelW) / 2;
  const y = Math.max(40, (lh - panelH) / 2);
  fill("rgba(0,0,0,.82)", 0, 0, lw, lh);
  shadow(0, 24, 70, "rgba(0,0,0,.58)", () => gradientRound(x, y, panelW, panelH, 18, [[0, "#2b1720"], [.62, "#150b10"], [1, "#28121a"]], true));
  strokeRound(x, y, panelW, panelH, 18, C.red, 3);
  text("BANKRUPTCY", lw / 2, y + 60, portrait ? 40 : 44, C.red, "center", "serif");
  text(sharedLoanNeedsVote() ? "The table demands every signature." : "The table offers one final contract.", lw / 2, y + 104, portrait ? 21 : 19, C.text, "center");
  const terms = [
    `Signer: ${signer.name}`,
    `Advance: ${LOAN_AMOUNT}g`,
    `Immediate fee: ${LOAN_INTEREST}g`,
    `Interest: +${Math.round(LOAN_INTEREST_RATE_PER_ROUND * 100)}% compounding after each completed round`,
    `${Math.round(LOAN_WINNING_PAYMENT_RATE * 100)}% of winnings pay the debt before reaching your bank.`,
    "Pay it off, and the table may lend again."
  ];
  const termX = x + 54;
  const termW = panelW - 108;
  let ty = y + 146;
  terms.forEach((line, i) => {
    const size = portrait ? 19 : 17;
    const color = i === 0 ? C.gold : C.text;
    ctx.font = `700 ${size}px sans-serif`;
    const wrapped = wrapLines(line, termW, size);
    wrapped.forEach((part) => {
      text(part, termX, ty, size, color);
      ty += portrait ? 28 : 24;
    });
    ty += portrait ? 9 : 7;
  });
  const sigY = y + panelH - (portrait ? 240 : 214);
  fill("rgba(0,0,0,.34)", x + 50, sigY, panelW - 100, portrait ? 104 : 92, 12);
  strokeRound(x + 50, sigY, panelW - 100, portrait ? 104 : 92, 12, "rgba(200,60,60,.58)", 2);
  ctx.save();
  ctx.strokeStyle = "rgba(216,59,59,.58)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 86, sigY + (portrait ? 76 : 68));
  ctx.lineTo(x + panelW - 86, sigY + (portrait ? 76 : 68));
  ctx.stroke();
  ctx.restore();
  const vote = game.loanVotes?.[localPlayerId];
  const signLabel = sharedLoanNeedsVote() ? vote === "sign" ? "Signed" : "Sign Vote" : "Sign";
  const declineLabel = sharedLoanNeedsVote() ? vote === "decline" ? "Declined" : "Decline Vote" : "Decline";
  addButton(x + 54, y + panelH - 88, panelW / 2 - 70, portrait ? 64 : 54, declineLabel, () => action("declineLoan"), false, vote !== "sign");
  addButton(x + panelW / 2 + 16, y + panelH - 88, panelW / 2 - 70, portrait ? 64 : 54, signLabel, () => action("signLoan"), true, vote !== "decline");
}

function drawFlash() {
  const w = Math.min(520, ctx.measureText(flash).width + 50);
  const cx = layoutW() / 2;
  shadow(0, 12, 28, "rgba(0,0,0,.45)", () => fill("rgba(18,14,22,.92)", cx - w / 2, 24, w, 42, 10));
  strokeRound(cx - w / 2, 24, w, 42, 10, "rgba(220,180,70,.45)", 1);
  text(flash, cx, 52, 18, C.gold, "center");
}

function queueHpAnimation(from, to, max) {
  if (from === to) return;
  if (from > to) sfx("life");
  if (to > from) sfx("win");
  hpAnimation = { from, to, max: Math.max(1, max), start: performance.now(), duration: 1250 };
}

function queueMoneyAnimation(delta) {
  if (!delta) return;
  sfx(delta > 0 ? "coin" : "coinDown");
  moneyAnimations.push({ delta, start: performance.now(), duration: 1200 });
}

function drawFeedbackAnimations() {
  drawHpAnimation();
  drawMoneyAnimations();
  drawBloodSignature();
}

function drawHpAnimation() {
  if (!hpAnimation) return;
  const raw = clamp((performance.now() - hpAnimation.start) / hpAnimation.duration, 0, 1);
  const t = raw < .18 ? 0 : clamp((raw - .18) / .62, 0, 1);
  const eased = 1 - Math.pow(1 - t, 3);
  const shown = lerp(hpAnimation.from, hpAnimation.to, eased);
  const lw = layoutW();
  const x = lw / 2 - 270;
  const y = viewport.portrait ? 265 : 250;
  const w = 540;
  const h = 124;
  fill("rgba(0,0,0,.58)", 0, 0, lw, layoutH());
  shadow(0, 18, 44, "rgba(0,0,0,.5)", () => gradientRound(x, y, w, h, 18, [[0, "#302640"], [1, "#15101c"]], true));
  strokeRound(x, y, w, h, 18, "rgba(220,180,70,.5)", 2);
  const hpDelta = Math.round(hpAnimation.to - hpAnimation.from);
  text(`${hpDelta >= 0 ? "HP +" : "HP "}${hpDelta}`, lw / 2, y + 42, 27, hpDelta >= 0 ? C.green : C.red, "center", "serif");
  fill("#08070b", x + 38, y + 64, w - 76, 24, 12);
  const oldW = (w - 76) * clamp(hpAnimation.from / hpAnimation.max, 0, 1);
  const newW = (w - 76) * clamp(shown / hpAnimation.max, 0, 1);
  fill("rgba(200,60,60,.42)", x + 38, y + 64, oldW, 24, 12);
  fillGradientBar(x + 38, y + 64, newW, 24, C.red, C.green);
  text(`${Math.round(shown)}/${hpAnimation.max}`, lw / 2, y + 112, 22, C.text, "center");
}

function drawMoneyAnimations() {
  const now = performance.now();
  moneyAnimations.forEach((anim, i) => {
    const t = clamp((now - anim.start) / anim.duration, 0, 1);
    const y = (viewport.portrait ? 220 : 178) - t * 52 - i * 30;
    const alpha = Math.min(1, (1 - t) * 1.6);
    ctx.save();
    ctx.globalAlpha = alpha;
    const positive = anim.delta > 0;
    const label = `${positive ? "+" : "-"}${Math.abs(anim.delta)}g`;
    const color = positive ? C.green : C.red;
    const cx = layoutW() / 2;
    ctx.font = `700 ${viewport.portrait ? 28 : 24}px serif`;
    const width = Math.max(130, ctx.measureText(label).width + 46);
    fill("rgba(0,0,0,.58)", cx - width / 2, y - 30, width, 44, 14);
    strokeRound(cx - width / 2, y - 30, width, 44, 14, color, 2);
    text(label, cx, y, viewport.portrait ? 28 : 24, color, "center", "serif");
    ctx.restore();
  });
}

function drawBloodSignature() {
  if (!game?.loanSignedAt) return;
  if (isFreeForAll() && game.loanSeatId !== localPlayerId) return;
  const t = clamp((performance.now() - game.loanSignedAt) / 2600, 0, 1);
  if (t >= 1) return;
  const signer = loanDisplaySigner();
  const lw = layoutW();
  const lh = layoutH();
  const y = viewport.portrait ? lh * .42 : lh * .46;
  const name = signer.name || "Player";
  const maxTextW = lw - 170;
  let size = viewport.portrait ? 60 : 70;
  ctx.font = signatureFont(size);
  if (ctx.measureText(name).width > maxTextW) {
    size = Math.max(viewport.portrait ? 42 : 48, size * maxTextW / ctx.measureText(name).width);
    ctx.font = signatureFont(size);
  }
  const textW = ctx.measureText(name).width;
  const width = Math.min(lw - 120, Math.max(260, textW + 104));
  const x = lw / 2 - width / 2;
  const reveal = clamp(t / .68, 0, 1);
  ctx.save();
  ctx.globalAlpha = Math.min(1, (1 - t) * 1.35);
  fill("rgba(0,0,0,.40)", 0, 0, lw, lh);
  text("SIGNED IN BLOOD", lw / 2, y - 86, viewport.portrait ? 30 : 34, C.red, "center", "serif");
  fill("rgba(12,4,7,.76)", x - 22, y - 54, width + 44, 124, 14);
  strokeRound(x - 22, y - 54, width + 44, 124, 14, "rgba(216,59,59,.55)", 2);
  ctx.strokeStyle = "rgba(216,59,59,.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 34);
  ctx.lineTo(x + width, y + 34);
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 18, y - 56, (width + 36) * reveal, 114);
  ctx.clip();
  ctx.shadowColor = "rgba(216,59,59,.6)";
  ctx.shadowBlur = 10;
  drawSignatureName(name, lw / 2, y + 13, size);
  ctx.restore();
  drawSignatureFlourish(x + 26, y + 27, width - 52, clamp((reveal - .18) / .82, 0, 1));
  const penX = x + width * reveal;
  if (reveal < 1) {
    fill("#e15353", penX - 5, y + 8 + Math.sin(reveal * Math.PI * 5) * 6, 10, 10, 5);
  }
  const drops = [
    [.18, 8, .16],
    [.37, 18, .28],
    [.58, 12, .42],
    [.78, 24, .56],
    [.91, 15, .68]
  ];
  drops.forEach(([pos, len, start], i) => {
    if (reveal < pos || t < start) return;
    const drip = clamp((t - start) / .42, 0, 1);
    const dx = x + width * pos;
    const top = y + 26 + Math.sin(i * 1.7) * 6;
    ctx.fillStyle = "#b51f2a";
    ctx.beginPath();
    ctx.ellipse(dx, top + len * drip, 3 + i % 2, 4 + drip * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    fill("rgba(181,31,42,.75)", dx - 1.5, top, 3, len * drip, 2);
  });
  ctx.restore();
}

function signatureFont(size) {
  return `italic 700 ${size}px "Snell Roundhand", "Segoe Script", "Lucida Handwriting", "Brush Script MT", cursive`;
}

function drawSignatureName(name, x, y, size) {
  ctx.save();
  ctx.font = signatureFont(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#6f1018";
  ctx.lineWidth = Math.max(1.4, size * .038);
  ctx.strokeText(name, x, y);
  ctx.fillStyle = "#d83b3b";
  ctx.fillText(name, x, y);
  ctx.globalAlpha = .46;
  ctx.strokeStyle = "#ff7777";
  ctx.lineWidth = Math.max(.8, size * .012);
  ctx.strokeText(name, x + 1.5, y - 1);
  ctx.restore();
}

function drawSignatureFlourish(x, y, w, progress) {
  if (progress <= 0) return;
  if (isHanddrawnArt() && handAssetReady("signatureFlourish")) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 8, y - 34, (w + 16) * progress, 74);
    ctx.clip();
    drawHandAsset("signatureFlourish", x, y - 30, w, 60, "#b51f2a", .95);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.strokeStyle = "#b51f2a";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const steps = 72;
  for (let i = 0; i <= steps * progress; i++) {
    const u = i / steps;
    const px = x + w * u;
    const py = y + Math.sin(u * Math.PI * 2.25) * 8 * (1 - u * .35) + Math.sin(u * Math.PI * 7) * 2;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

function fillGradientBar(x, y, w, h, c1, c2) {
  if (w <= 0) return;
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  fill(g, x, y, w, h, h / 2);
}

function drawGameMenu() {
  const lw = layoutW();
  const lh = layoutH();
  const hasDev = developerModeUnlocked;
  const panelW = viewport.portrait ? 520 : 430;
  const panelH = viewport.portrait ? (hasDev ? 500 : 410) : (hasDev ? 410 : 340);
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
  if (hasDev) addButton(x + 42, y + (viewport.portrait ? 314 : 270), panelW - 84, viewport.portrait ? 72 : 56, "Developer", () => developerPanelOpen = true);
  addButton(x + 42, y + (viewport.portrait ? (hasDev ? 402 : 314) : (hasDev ? 336 : 270)), panelW - 84, viewport.portrait ? 72 : 56, "Home Screen", goHome);
}

function drawDeveloperPanel() {
  const lw = layoutW();
  const lh = layoutH();
  const portrait = viewport.portrait;
  const panelW = Math.min(portrait ? 680 : 760, lw - 56);
  const panelH = portrait ? 1040 : 720;
  const x = lw / 2 - panelW / 2;
  const y = Math.max(34, lh / 2 - panelH / 2);
  fill("rgba(0,0,0,.72)", 0, 0, lw, lh);
  shadow(0, 26, 70, "rgba(0,0,0,.55)", () => gradientRound(x, y, panelW, panelH, 18, [[0, "#302640"], [1, "#111018"]], true));
  strokeRound(x, y, panelW, panelH, 18, C.goldDim, 2);
  text("DEVELOPER MODE", lw / 2, y + 56, portrait ? 34 : 30, C.gold, "center", "serif");
  text("Launch fake test situations. These runs never post scores.", lw / 2, y + 90, portrait ? 19 : 16, C.muted, "center");

  const colGap = 18;
  const cols = panelW > 560 ? 2 : 1;
  const colW = (panelW - 72 - (cols - 1) * colGap) / cols;
  const bh = portrait ? 52 : 38;
  const rowGap = portrait ? 9 : 6;
  const startY = y + 122;
  const leftX = x + 36;
  const addDevButton = (index, label, fn, primary = false, enabled = true) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    addButton(leftX + col * (colW + colGap), startY + row * (bh + rowGap), colW, bh, label, fn, primary, enabled);
  };

  let i = 0;
  for (const scenario of developerScenarios()) {
    addDevButton(i++, scenario.label, scenario.run, !!scenario.primary, scenario.enabled !== false);
  }

  const infoY = startY + Math.ceil(i / cols) * (bh + rowGap) + 20;
  text(`Active run: ${game?.developerTest ? "Developer Test" : game ? "Normal Game" : "None"}`, x + 40, infoY, portrait ? 18 : 15, C.text);
  text(`Split cap applies only inside test games. Current cap: ${developerSplitLimit}.`, x + 40, infoY + 28, portrait ? 16 : 13, C.muted);
  text(`Device: ${localDeviceId.slice(0, 8)}`, x + 40, infoY + 54, portrait ? 16 : 13, C.muted);

  addButton(x + 36, y + panelH - 70, panelW / 2 - 48, portrait ? 54 : 46, "Lock Dev Mode", () => {
    developerModeUnlocked = false;
    developerPanelOpen = false;
  });
  addButton(x + panelW / 2 + 12, y + panelH - 70, panelW / 2 - 48, portrait ? 54 : 46, "Close", () => developerPanelOpen = false, true);
}

function developerScenarios() {
  // Feature work should add a scenario here so developer mode stays current.
  return [
    { label: `Split Carousel (${developerSplitLimit})`, run: devScenarioSplitCarousel, primary: true },
    { label: "Cycle Split Cap", run: cycleDeveloperSplitLimit },
    { label: "Hit Animation", run: devScenarioHitAnimation },
    { label: "Hit Fee Warning", run: devScenarioHitFeeWarning },
    { label: "Hit Toll Bankruptcy", run: devScenarioHitFeeBankruptcy },
    { label: "Dealer Blackjack", run: devScenarioDealerBlackjack },
    { label: "Relic Shop Variety", run: devScenarioRelicShop },
    { label: "Loan Contract", run: devScenarioLoanContract },
    { label: "Shared Loan Vote", run: devScenarioSharedLoanVote },
    { label: "FFA Dead Spectator", run: devScenarioFreeForAllSpectator },
    { label: "Debt Payment Display", run: devScenarioDebtPayment },
    { label: "Ready / Kick Lobby", run: devScenarioReadyKickLobby },
    { label: "Death Audio Flow", run: devScenarioDeathAudio },
    { label: "HP + Money Animations", run: devScenarioFeedbackAnimations },
    { label: "Map Navigator", run: devScenarioMapNavigator, primary: true },
    { label: "Dev: Prev Floor", run: devMapPreviousFloor, enabled: !!game?.developerTest },
    { label: "Dev: Next Floor", run: devMapNextFloor, enabled: !!game?.developerTest },
    { label: "Dev: Enter Selected", run: devMapEnterSelected, enabled: !!game?.developerTest },
    { label: "Dev: Clear Encounter", run: devMapClearEncounter, enabled: !!game?.developerTest }
  ];
}

function goHome() {
  stopDeathAudioClips();
  menuOpen = false;
  developerPanelOpen = false;
  appScene = "menu";
  game = null;
  role = "solo";
  localPlayerId = hostId;
  cardAnimations = [];
  seenCardIds = new Set();
  handCarousel = {};
  handCarouselAnim = {};
  handCarouselActiveIndex = {};
  hideSignal();
  peer?.peer?.destroy?.();
  peer = null;
  if (location.search) history.replaceState(null, "", location.pathname);
}

function cycleDeveloperSplitLimit() {
  developerSplitLimit = developerSplitLimit >= 12 ? 4 : developerSplitLimit + 1;
  localStorage.setItem("dungeon-dev-split-limit", String(developerSplitLimit));
  notify(`Test split cap set to ${developerSplitLimit}.`);
}

function beginDeveloperTest(title, mode = "classic", players = [{ id: hostId, name: savedPlayerName("You") }], code = "") {
  stopDeathAudioClips();
  peer?.peer?.destroy?.();
  peer = null;
  role = "solo";
  localPlayerId = hostId;
  menuOpen = false;
  developerPanelOpen = false;
  handCarousel = {};
  handCarouselAnim = {};
  handCarouselActiveIndex = {};
  newGame(players, code, mode);
  game.developerTest = true;
  game.log = [`Developer test: ${title}.`];
  game.gold = 300;
  game.hp = game.maxHp = 100;
  game.completedRounds = 0;
  notify(`Developer test: ${title}`);
  return game.seats[0];
}

function devCard(rank, suit, up = true, dealKind = "deal") {
  game.dealSeq = (game.dealSeq || 0) + 1;
  return { rank, suit, up, _dealId: `${game.session}:dev-${game.dealSeq}`, _dealDelay: 0, _dealKind: dealKind };
}

function devHand(cards, bet = 25, status = "playing") {
  return { ...newHand(bet, currentRiskBankroll(game.seats[0], bet)), cards, status, split: true };
}

function finishDeveloperSetup(seat, phase = "player") {
  seat.ready = false;
  seat.finished = false;
  seat.spectating = false;
  game.activeSeat = 0;
  game.phase = phase;
  appScene = "game";
  seenCardIds = new Set(game.seats.flatMap((s) => s.hands).flatMap((h) => h.cards).concat(game.dealer).map((c) => c._dealId).filter(Boolean));
}

function devScenarioSplitCarousel() {
  const seat = beginDeveloperTest("Split carousel", "classic");
  const hands = [
    devHand([devCard("8", "S"), devCard("3", "H")]),
    devHand([devCard("8", "D"), devCard("2", "C")]),
    devHand([devCard("8", "H"), devCard("A", "S")]),
    devHand([devCard("8", "C"), devCard("6", "D")]),
    devHand([devCard("8", "S"), devCard("9", "C")])
  ].slice(0, Math.max(3, Math.min(developerSplitLimit, 8)));
  seat.hands = hands;
  seat.active = Math.min(2, hands.length - 1);
  game.dealer = [devCard("10", "C"), devCard("6", "S", false)];
  handCarousel[seat.id] = seat.active;
  game.log.push("Swipe or stand to rotate the split-hand carousel.");
  finishDeveloperSetup(seat);
}

function devScenarioHitAnimation() {
  const seat = beginDeveloperTest("hit animation", "classic");
  seat.hands = [devHand([devCard("7", "S"), devCard("4", "H")], 25, "playing")];
  seat.active = 0;
  game.dealer = [devCard("9", "D"), devCard("7", "C", false)];
  game.deck.push({ rank: "5", suit: "C" });
  game.log.push("Press Hit to test card travel, hand growth, and total emphasis.");
  finishDeveloperSetup(seat);
}

function devScenarioHitFeeWarning() {
  const seat = beginDeveloperTest("hit-fee max-bet warning", "classic");
  game.enemy = { ...cloneEnemy(3), name: "Developer Toll Dealer", rule: "Each hit costs 25 gold.", hitFee: 25, dealerPeek: true };
  game.gold = 50;
  seat.bet = 50;
  seat.ready = false;
  game.phase = "betting";
  game.log.push("Press Ready. The game should warn that max betting leaves no hit-fee reserve.");
}

function devScenarioHitFeeBankruptcy() {
  const seat = beginDeveloperTest("hit toll bankruptcy", "classic");
  game.enemy = { ...cloneEnemy(3), name: "Developer Toll Dealer", rule: "Each hit costs 20 gold.", hitFee: 20, dealerPeek: true };
  game.gold = 0;
  seat.hands = [devHand([devCard("10", "S"), devCard("6", "H")], 25, "playing")];
  game.dealer = [devCard("5", "D"), devCard("9", "C", false)];
  game.log.push("Press Hit with no gold to test bankruptcy, loan, and death flow.");
  finishDeveloperSetup(seat);
}

function devScenarioDealerBlackjack() {
  const seat = beginDeveloperTest("dealer blackjack reveal", "classic");
  seat.hands = [devHand([devCard("10", "H"), devCard("9", "S")], 25, "stand")];
  seat.finished = true;
  game.dealer = [devCard("A", "S"), devCard("K", "D", true)];
  game.phase = "dealerReveal";
  game.dealerTimer = 1.4;
  game.log.push("Dealer reveals blackjack with a fully dealt table.");
  finishDeveloperSetup(seat, "dealerReveal");
}

function devScenarioRelicShop() {
  const seat = beginDeveloperTest("relic shop variety", "classic");
  game.floor = 1;
  game.enemy = cloneEnemy(game.floor);
  game.shop = chooseRelics();
  game.relicVotes = {};
  game.log.push("Relic offers should avoid similar or strictly stronger variants.");
  finishDeveloperSetup(seat, "shop");
}

function devScenarioLoanContract() {
  const seat = beginDeveloperTest("loan contract", "classic");
  game.gold = 0;
  triggerBankruptcyDeath("Developer bankruptcy test", seat, MIN_BET);
  game.developerTest = true;
  game.log.push("Sign or decline to test the bankruptcy loan contract.");
}

function devScenarioSharedLoanVote() {
  const players = [
    { id: hostId, name: savedPlayerName("Host") },
    { id: "guest-a", name: "Guest A" },
    { id: "guest-b", name: "Guest B" }
  ];
  const seat = beginDeveloperTest("shared wallet loan vote", "classic", players, "TEST");
  role = "host";
  localPlayerId = hostId;
  game.gold = 0;
  triggerBankruptcyDeath("Shared wallet bankruptcy test", seat, MIN_BET);
  game.developerTest = true;
  game.log.push("Shared-wallet lobbies should require every visible player to sign.");
}

function devScenarioFreeForAllSpectator() {
  const players = [
    { id: hostId, name: savedPlayerName("You") },
    { id: "guest-a", name: "Red Name" },
    { id: "guest-b", name: "Still Alive" },
    { id: "guest-c", name: "Big Stack" }
  ];
  const seat = beginDeveloperTest("free-for-all dead spectator", "freeForAll", players, "FFA1");
  role = "host";
  localPlayerId = hostId;
  game.gold = 0;
  game.seats.forEach((s, index) => {
    s.gold = [80, 0, 135, 260][index] || 25;
    s.bet = index === 1 ? 0 : 25;
    s.ready = index !== 0;
  });
  const dead = game.seats[1];
  dead.debt = 140;
  dead.loanUsed = true;
  eliminateSeat(dead, "Testing dead spectator state.");
  game.phase = "betting";
  game.log.push("Dead player should stay listed as dead/spectating while others continue.");
  return seat;
}

function devScenarioDebtPayment() {
  const seat = beginDeveloperTest("debt display and payment", "classic");
  game.gold = 185;
  game.loanDebt = 160;
  game.loanUsed = true;
  game.loanPaidThisRound = 18;
  game.relics = [{ ...relicPool.find((r) => r.name === "Golden Tongue") }];
  seat.hands = [devHand([devCard("K", "S"), devCard("Q", "H")], 50, "stand")];
  game.dealer = [devCard("9", "D"), devCard("8", "C", true)];
  finishDeveloperSetup(seat, "roundOver");
  queueMoneyAnimation(90);
  game.log.push("Debt should appear beside gold; winnings should show loan payment context.");
}

function devScenarioReadyKickLobby() {
  const players = [
    { id: hostId, name: savedPlayerName("Host") },
    { id: "guest-a", name: "Ready Guest" },
    { id: "guest-b", name: "Kick Test" }
  ];
  const seat = beginDeveloperTest("ready borders and kick controls", "classic", players, "KICK");
  role = "host";
  localPlayerId = hostId;
  game.seats[0].ready = false;
  game.seats[1].ready = true;
  game.seats[2].ready = false;
  game.seats[0].bet = 25;
  game.seats[1].bet = 35;
  game.seats[2].bet = 45;
  game.phase = "betting";
  statsPlayerId = "guest-b";
  game.log.push("Ready border should be visible; host stats overlay should show Kick.");
  return seat;
}

function devScenarioDeathAudio() {
  const seat = beginDeveloperTest("death audio and defeat overlay", "classic");
  game.gold = 0;
  game.loanDebt = 125;
  game.loanUsed = true;
  game.hp = 8;
  triggerBankruptcyDeath("Developer final bankruptcy test", seat, MIN_BET);
  game.developerTest = true;
  game.log.push("No loan remains. Death audio should warp, stop, then reverse-fade cleanly.");
}

function devScenarioFeedbackAnimations() {
  const seat = beginDeveloperTest("HP and money animations", "classic");
  seat.hands = [devHand([devCard("K", "S"), devCard("Q", "H")], 50, "stand")];
  game.dealer = [devCard("9", "D"), devCard("8", "C", true)];
  finishDeveloperSetup(seat, "roundOver");
  queueHpAnimation(100, 62, 100);
  queueMoneyAnimation(75);
  game.log.push("Large HP loss and money gain animations are queued.");
}

function devScenarioMapNavigator() {
  const seat = beginDeveloperTest("map navigator", "classic");
  game.floor = 0;
  game.map = createFloorMap(game.floor);
  game.currentNodeId = "start";
  game.clearedNodes = ["start"];
  game.activeEncounterId = "";
  game.mapVotes = {};
  game.mapReady = {};
  inspectedNodeId = "start-1";
  game.enemy = cloneEnemy(0);
  game.phase = "map";
  seat.hands = [];
  seat.ready = false;
  refreshReachableNodes();
  game.log.push("Dev map controls: inspect any table, Enter Selected, then Clear Encounter.");
}

function devSetFloor(floorIndex) {
  if (!game?.developerTest) return flashMsg("Start Map Navigator first");
  developerPanelOpen = false;
  game.floor = clamp(floorIndex, 0, FLOORS - 1);
  game.map = createFloorMap(game.floor);
  game.currentNodeId = "start";
  game.clearedNodes = ["start"];
  game.activeEncounterId = "";
  game.mapVotes = {};
  game.mapReady = {};
  inspectedNodeId = "start-1";
  game.enemy = cloneEnemy(game.floor);
  game.phase = "map";
  game.dealer = [];
  game.seats.forEach((seat) => {
    seat.ready = false;
    seat.hands = [];
    seat.finished = false;
    seat.spectating = false;
  });
  refreshReachableNodes();
  notify(`Developer floor ${game.floor + 1}`);
}

function devMapPreviousFloor() {
  if (!game?.developerTest) return flashMsg("Start Map Navigator first");
  devSetFloor((Number(game.floor) || 0) - 1);
}

function devMapNextFloor() {
  if (!game?.developerTest) return flashMsg("Start Map Navigator first");
  devSetFloor((Number(game.floor) || 0) + 1);
}

function devMapEnterSelected() {
  if (!game?.developerTest) return flashMsg("Start Map Navigator first");
  if (game.phase !== "map") return flashMsg("Already at a table");
  refreshReachableNodes();
  const node = getMapNode(inspectedNodeId) || reachableMapNodes()[0];
  if (!node || !node.encounter) return flashMsg("Select a table or boss node");
  game.mapVotes ||= {};
  game.mapVotes[localPlayerId] = node.id;
  startMapEncounter(node.id);
  game.developerTest = true;
  developerPanelOpen = false;
  game.log.push(`Developer entered ${node.label} without route restrictions.`);
}

function devMapReturnToMap() {
  if (!game?.developerTest) return flashMsg("Start Map Navigator first");
  if (!game.map) return flashMsg("No map loaded");
  const node = getMapNode(game.activeEncounterId) || getMapNode(inspectedNodeId);
  if (node?.id) inspectedNodeId = node.id;
  game.phase = "map";
  game.mapVotes = {};
  game.mapReady = {};
  game.selectedNodeId = "";
  game.dealer = [];
  game.peekCard = null;
  game.peekTimer = 0;
  game.seats.forEach((seat) => {
    seat.ready = false;
    seat.hands = [];
    seat.finished = false;
    seat.insuranceAnswered = false;
  });
  refreshReachableNodes();
  developerPanelOpen = false;
  notify("Returned to map without clearing the table");
}

function devMapClearEncounter() {
  if (!game?.developerTest) return flashMsg("Start Map Navigator first");
  if (game.phase === "map") {
    const node = getMapNode(inspectedNodeId);
    if (!node?.encounter) return flashMsg("Select a table or boss to clear");
    game.activeEncounterId = node.id;
  }
  const node = getMapNode(game.activeEncounterId);
  if (!node) return flashMsg("No active encounter to clear");
  game.enemy.hp = 0;
  completeMapEncounter();
  game.developerTest = true;
  developerPanelOpen = false;
  notify(`Cleared ${node.label}`);
}

function setHandCarousel(seatId, next, count = Infinity) {
  const target = clamp(next, 0, Math.max(0, count - 1));
  const current = clamp(handCarousel[seatId] ?? target, 0, Math.max(0, count - 1));
  if (current === target) {
    handCarousel[seatId] = target;
    return;
  }
  handCarouselAnim[seatId] = {
    from: current,
    to: target,
    start: performance.now(),
    duration: 320
  };
  handCarousel[seatId] = target;
  sfx("flip");
}

function carouselVisualIndex(seatId, selected) {
  const anim = handCarouselAnim[seatId];
  if (!anim) return selected;
  const t = clamp((performance.now() - anim.start) / anim.duration, 0, 1);
  if (t >= 1) {
    delete handCarouselAnim[seatId];
    return selected;
  }
  const eased = 1 - Math.pow(1 - t, 3);
  return lerp(anim.from, anim.to, eased);
}

function drawCardGoldOutline(x = 0, y = 0, w = CARD_W, h = CARD_H, strong = false) {
  ctx.save();
  ctx.shadowColor = strong ? "rgba(255,218,91,.95)" : "rgba(255,205,83,.58)";
  ctx.shadowBlur = strong ? 18 : 10;
  strokeRound(x, y, w, h, 9, strong ? "rgba(255,232,130,.96)" : "rgba(220,180,70,.74)", strong ? 3.4 : 1.9);
  strokeRound(x + 3, y + 3, w - 6, h - 6, 6, "rgba(255,244,177,.34)", 1);
  ctx.restore();
}

function drawCardOutlineGlow(x = 0, y = 0) {
  drawCardGoldOutline(x, y, CARD_W, CARD_H, true);
}

function drawHand(cards, x, y, highlight, maxWidth = Infinity, animate = true, animationBase = null) {
  const step = cards.length < 2 ? 0 : Math.max(10, Math.min(62, (maxWidth - CARD_W) / Math.max(1, cards.length - 1)));
  const handW = cards.length < 2 ? CARD_W : CARD_W + step * (cards.length - 1);
  const scale = Number.isFinite(maxWidth) && handW > maxWidth ? clamp(maxWidth / handW, .62, 1) : 1;
  cards.forEach((card, i) => {
    const cx = x + i * step;
    const cy = y + Math.sin(i * .6) * 2;
    const targetX = animationBase ? animationBase.x + i * step : cx;
    const targetY = animationBase ? animationBase.y + Math.sin(i * .6) * 2 : cy;
    const anim = animate ? prepareCardAnimation(card, targetX, targetY) : null;
    if (anim && animationProgress(anim) < .92) return;
    const pulse = cardLandingPulse(card);
    const grow = 1 + pulse * .105;
    ctx.save();
    ctx.translate(cx + (CARD_W * scale) / 2, cy + (CARD_H * scale) / 2);
    ctx.scale(scale * grow, scale * grow);
    if (highlight) drawCardOutlineGlow(-CARD_W / 2, -CARD_H / 2);
    drawCardFace(card, -CARD_W / 2, -CARD_H / 2, false);
    ctx.restore();
  });
}

function cardLandingPulse(card) {
  const anim = card?._dealId ? cardAnimations.find((a) => a.id === card._dealId) : null;
  if (!anim) return 0;
  const p = (performance.now() - anim.start) / anim.duration;
  if (p < .9 || p > 2.25) return 0;
  const t = clamp((p - .9) / 1.35, 0, 1);
  return Math.sin(t * Math.PI);
}

function handLandingPulse(hand) {
  return Math.max(0, ...(hand?.cards || []).filter((card) => card._dealKind === "hit").map(cardLandingPulse));
}

function handStatusBadge(x, y, label, color, hand) {
  const pulse = handLandingPulse(hand);
  if (!pulse) {
    badge(x, y, label, color);
    return;
  }
  const now = performance.now();
  ctx.save();
  ctx.translate(x + Math.sin(now * .08) * pulse * 4, y + Math.cos(now * .11) * pulse * 2);
  ctx.rotate(Math.sin(now * .07) * pulse * .035);
  ctx.scale(1 + pulse * .09, 1 + pulse * .09);
  badge(0, 0, label, pulse > .28 ? C.gold : color);
  ctx.restore();
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
    drawCardOutlineGlow(-CARD_W / 2, -CARD_H / 2);
    drawCardFace(anim.card, -CARD_W / 2, -CARD_H / 2, false);
    ctx.restore();
  });
}

function animationProgress(anim) {
  return clamp((performance.now() - anim.start) / anim.duration, 0, 1);
}

function deckPosition() {
  const felt = viewport.portrait
    ? { x: 24, y: 42, w: layoutW() - 48, h: 730 }
    : { x: 40, y: 50, w: layoutW() - (isTouchLandscape() ? 570 : 380), h: 730 };
  return { x: felt.x + felt.w - 125, y: felt.y + 50 };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function loadHanddrawnAssets() {
  for (const [key, file] of Object.entries(handdrawnAssetFiles)) {
    if (handdrawnImages[key]) continue;
    const img = new Image();
    img.src = `./assets/${file}`;
    img.onload = () => {
      tintedHanddrawnCache.clear();
      chromaKeyedAssetCache.delete(key);
      paletteShiftedAssetCache.clear();
      draw();
    };
    handdrawnImages[key] = img;
  }
}

function handAssetReady(key) {
  const img = handdrawnImages[key];
  return !!img && img.complete && img.naturalWidth > 0;
}

function shouldChromaKeyAsset(key) {
  const assetKey = String(key);
  if (/^floor\d{2}CardBack$/.test(assetKey)) return true;
  if (assetKey === "tableBase:grunt") return true;
  if (/^tableMotif:floor\d{2}$/.test(assetKey)) return true;
  if (/^(map|tableScene):floor\d{2}:(table|bossTable|bossPortrait|elevator|decoration)$/.test(assetKey)) return true;
  return false;
}

function handCardAssetsReady() {
  const ranks = "0123456789AJQK".split("").map((ch) => `glyph${ch}`);
  return ["backDiamond", "suitS", "suitH", "suitD", "suitC", ...ranks].every(handAssetReady);
}

function tintedHandAsset(key, color) {
  const img = handdrawnImages[key];
  if (!img || !img.naturalWidth) return null;
  const cacheKey = `${key}|${color}|${img.naturalWidth}x${img.naturalHeight}`;
  if (tintedHanddrawnCache.has(cacheKey)) return tintedHanddrawnCache.get(cacheKey);
  const off = document.createElement("canvas");
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0);
  octx.globalCompositeOperation = "source-in";
  octx.fillStyle = color;
  octx.fillRect(0, 0, off.width, off.height);
  tintedHanddrawnCache.set(cacheKey, off);
  return off;
}

function chromaKeyedHandAsset(key) {
  const img = handdrawnImages[key];
  if (!img || !img.naturalWidth) return null;
  if (!shouldChromaKeyAsset(key)) return img;
  const cacheKey = `${key}|${img.naturalWidth}x${img.naturalHeight}`;
  if (chromaKeyedAssetCache.has(cacheKey)) return chromaKeyedAssetCache.get(cacheKey);
  const off = document.createElement("canvas");
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const octx = off.getContext("2d");
  octx.drawImage(img, 0, 0);
  const imageData = octx.getImageData(0, 0, off.width, off.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const strongestNonGreen = Math.max(r, b);
    if (g > 120 && g - strongestNonGreen > 45 && r < 125 && b < 125) {
      const edge = clamp((g - strongestNonGreen - 45) / 80, 0, 1);
      data[i + 3] = Math.round(data[i + 3] * (1 - edge));
    }
  }
  octx.putImageData(imageData, 0, 0);
  chromaKeyedAssetCache.set(cacheKey, off);
  return off;
}

function rgbFromHex(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  const value = clean.length === 3
    ? clean.split("").map((ch) => ch + ch).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(value.slice(0, 2), 16) || 0,
    g: parseInt(value.slice(2, 4), 16) || 0,
    b: parseInt(value.slice(4, 6), 16) || 0
  };
}

function paletteCacheKey(palette) {
  return [palette?.dark, palette?.main, palette?.accent].join("|");
}

function mixRgb(a, b, amount) {
  const t = clamp(Number(amount) || 0, 0, 1);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  };
}

function paletteShiftedHandAsset(key, palette) {
  if (!handAssetReady(key)) return null;
  const source = chromaKeyedHandAsset(key);
  if (!source) return null;
  const cacheKey = `${key}|${paletteCacheKey(palette)}|${source.width || source.naturalWidth}x${source.height || source.naturalHeight}`;
  if (paletteShiftedAssetCache.has(cacheKey)) return paletteShiftedAssetCache.get(cacheKey);
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  octx.drawImage(source, 0, 0);
  const imageData = octx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const colors = {
    dark: rgbFromHex(palette?.dark || "#111111"),
    main: rgbFromHex(palette?.main || floorThemeColor(Number(game?.floor) || 0)),
    accent: rgbFromHex(palette?.accent || C.gold)
  };
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 4) continue;
    const lum = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
    const light = clamp(lum / 255, 0, 1);
    let shaded = colors.main;
    if (light < .5) {
      shaded = mixRgb(colors.main, colors.dark, (.5 - light) / .5 * .92);
    } else if (light > .62) {
      shaded = mixRgb(colors.main, colors.accent, (light - .62) / .38 * .78);
    }
    const contrast = .7 + light * .56;
    data[i] = clamp(Math.round(shaded.r * contrast), 0, 255);
    data[i + 1] = clamp(Math.round(shaded.g * contrast), 0, 255);
    data[i + 2] = clamp(Math.round(shaded.b * contrast), 0, 255);
  }
  octx.putImageData(imageData, 0, 0);
  paletteShiftedAssetCache.set(cacheKey, off);
  return off;
}

function drawPaletteShiftedAsset(key, palette, x, y, w, h, alpha = 1) {
  const asset = paletteShiftedHandAsset(key, palette);
  if (!asset) return false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(asset, x, y, w, h);
  ctx.restore();
  return true;
}

function drawPaletteShiftedAssetContain(key, palette, x, y, w, h, alpha = 1) {
  if (!handAssetReady(key)) return false;
  const size = handAssetSize(key);
  const scale = Math.min(w / Math.max(1, size.w), h / Math.max(1, size.h));
  const dw = size.w * scale;
  const dh = size.h * scale;
  return drawPaletteShiftedAsset(key, palette, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, alpha);
}

function drawHandAsset(key, x, y, w, h, color = "#000", alpha = 1) {
  if (!handAssetReady(key)) return false;
  const asset = tintedHandAsset(key, color);
  if (!asset) return false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(asset, x, y, w, h);
  ctx.restore();
  return true;
}

function drawRawAsset(key, x, y, w, h, alpha = 1) {
  if (!handAssetReady(key)) return false;
  const asset = chromaKeyedHandAsset(key);
  if (!asset) return false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(asset, x, y, w, h);
  ctx.restore();
  return true;
}

function drawRawAssetContain(key, x, y, w, h, alpha = 1) {
  if (!handAssetReady(key)) return false;
  const size = handAssetSize(key);
  const scale = Math.min(w / Math.max(1, size.w), h / Math.max(1, size.h));
  const dw = size.w * scale;
  const dh = size.h * scale;
  return drawRawAsset(key, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, alpha);
}

function drawRawAssetCover(key, x, y, w, h, alpha = 1) {
  if (!handAssetReady(key)) return false;
  const img = handdrawnImages[key];
  const scale = Math.max(w / Math.max(1, img.naturalWidth), h / Math.max(1, img.naturalHeight));
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
  return true;
}

function handAssetSize(key) {
  const img = handdrawnImages[key];
  return img?.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : { w: 1, h: 1 };
}

function drawHandAssetFit(key, cx, cy, targetH, color, align = "center", alpha = 1) {
  if (!handAssetReady(key)) return 0;
  const size = handAssetSize(key);
  const w = targetH * size.w / Math.max(1, size.h);
  const x = align === "right" ? cx - w : align === "left" ? cx : cx - w / 2;
  drawHandAsset(key, x, cy - targetH / 2, w, targetH, color, alpha);
  return w;
}

function rankGlyphKeys(rank) {
  return String(rank).split("").map((ch) => `glyph${ch}`);
}

function drawHandRank(rank, x, y, h, color, align = "left") {
  const keys = rankGlyphKeys(rank);
  const gap = Math.max(1, h * .08);
  const widths = keys.map((key) => {
    const size = handAssetSize(key);
    return h * size.w / Math.max(1, size.h);
  });
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, keys.length - 1);
  let cursor = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
  keys.forEach((key, i) => {
    drawHandAsset(key, cursor, y, widths[i], h, color);
    cursor += widths[i] + gap;
  });
  return total;
}

function suitAssetKey(suit) {
  return { S: "suitS", H: "suitH", D: "suitD", C: "suitC" }[suit] || "suitS";
}

function currentFloorCardBackKey() {
  const floor = clamp((Number(game?.floor) || 0) + 1, 1, FLOORS);
  return `floor${String(floor).padStart(2, "0")}CardBack`;
}

function drawFloorCardBack(x, y, w = CARD_W, h = CARD_H) {
  const key = currentFloorCardBackKey();
  const assetKey = handAssetReady(key) ? key : "backDiamond";
  if (!handAssetReady(assetKey)) return false;
  const asset = chromaKeyedHandAsset(assetKey);
  if (!asset) return false;
  shadow(0, 7, 13, "rgba(0,0,0,.36)", () => {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(asset, x, y, w, h);
    ctx.restore();
  });
  drawCardGoldOutline(x, y, w, h, false);
  return true;
}

function relicAssetKey(relic) {
  const name = relic?.baseName && relicAssetFiles[relic.baseName] ? relic.baseName : relic?.name;
  return relicAssetFiles[name] ? `relic:${name}` : "";
}

function drawRelicIcon(relic, cx, cy, size, color = C.gold, bg = true) {
  const key = relicAssetKey(relic);
  if (!isHanddrawnArt() || !key || !handAssetReady(key)) {
    badge(cx, cy, relic.icon, color);
    return false;
  }
  if (bg) {
    fill("#0e0a12", cx - size / 2, cy - size / 2, size, size, Math.max(8, size * .18));
    strokeRound(cx - size / 2, cy - size / 2, size, size, Math.max(8, size * .18), "rgba(220,180,70,.3)", 1.5);
  }
  drawRawAssetContain(key, cx - size * .39, cy - size * .39, size * .78, size * .78, .96);
  return true;
}

function drawHanddrawnCardFace(card, x, y, highlight = false) {
  if (highlight) {
    drawCardOutlineGlow(x, y);
  }
  if (card.up === false) {
    if (drawFloorCardBack(x, y)) return;
    shadow(0, 7, 13, "rgba(0,0,0,.36)", () => gradientRound(x, y, CARD_W, CARD_H, 9, [[0, "#4a2f66"], [1, "#23133a"]], true));
    gradientRound(x + 8, y + 8, CARD_W - 16, CARD_H - 16, 7, [[0, "#654482"], [1, "#38244e"]], true);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 6; row++) {
        const dx = x + 13 + col * 18 + ((row % 2) ? 3 : -1);
        const dy = y + 15 + row * 17;
        drawHandAsset("backDiamond", dx, dy, 13, 17, "#d4b35e", .55);
      }
    }
    drawCardGoldOutline(x, y);
    return;
  }
  shadow(0, 7, 12, "rgba(0,0,0,.28)", () => gradientRound(x, y, CARD_W, CARD_H, 9, [[0, "#fff2cb"], [.55, C.parchment], [1, "#cdbb8f"]], true));
  strokeRound(x + 4, y + 4, CARD_W - 8, CARD_H - 8, 6, "rgba(255,255,255,.22)", 1);
  const red = card.suit === "H" || card.suit === "D";
  const color = red ? "#9e1f24" : "#12121b";
  drawHandRank(card.rank, x + 9, y + 13, card.rank === "10" ? 20 : 24, color, "left");
  drawHandAssetFit(suitAssetKey(card.suit), x + 21, y + 45, 17, color, "center");
  drawHandAssetFit(suitAssetKey(card.suit), x + CARD_W / 2, y + CARD_H / 2 + 12, 46, color, "center");
  drawHandRank(card.rank, x + CARD_W - 9, y + CARD_H - 48, card.rank === "10" ? 15 : 18, color, "right");
  drawHandAssetFit(suitAssetKey(card.suit), x + CARD_W - 18, y + CARD_H - 17, 13, color, "center");
  drawCardGoldOutline(x, y);
}

function drawHanddrawnChips(x, y, amount) {
  const denoms = [[500, "#d2af3c"], [100, "#2f2e3a"], [25, "#3c8c50"], [10, "#3c64b4"], [5, "#b43c3c"], [1, "#e6e6dc"]];
  let rest = amount;
  let n = 0;
  if (amount <= 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(238,231,215,.45)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x + 21, y + 6, 22, 8, -.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawHandAsset("chip", x - 5, y - 11, 54, 36, "rgba(238,231,215,.72)", .72);
    return;
  }
  for (const [value, color] of denoms) {
    while (rest >= value && n < 12) {
      const cy = y - n * 5;
      const wobble = n % 2;
      ctx.save();
      ctx.globalAlpha = .96;
      ctx.fillStyle = shade(color, -46);
      ctx.fillRect(x + wobble + 1, cy + 4, 42, 10);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x + wobble + 22, cy + 4, 22, 8, -.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#08070b";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,240,150,.86)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x + wobble + 22, cy + 4, 15, 4.6, -.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawHandAsset("chip", x - 7 + wobble, cy - 13, 58, 39, "rgba(255,245,190,.75)", .68);
      drawHandAsset("chip", x - 7 + wobble, cy - 13, 58, 39, "#07060a", .8);
      rest -= value;
      n++;
    }
  }
}

function drawCardFace(card, x, y, highlight = false) {
  if (highlight) drawCardOutlineGlow(x, y);
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
    drawCardGoldOutline(x, y);
    return;
  }
  round(x, y, CARD_W, CARD_H, 9, C.parchment);
  const red = card.suit === "H" || card.suit === "D";
  const color = red ? "#aa2323" : "#191923";
  const suit = { S: "♠", H: "♥", D: "♦", C: "♣" }[card.suit];
  text(card.rank, x + 10, y + 28, card.rank === "10" ? 22 : 26, color, "left", "serif");
  text(suit, x + CARD_W / 2, y + 82, 52, color, "center", "serif");
  text(card.rank, x + CARD_W - 10, y + CARD_H - 10, card.rank === "10" ? 20 : 24, color, "right", "serif");
  drawCardGoldOutline(x, y);
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
  if (isHanddrawnArt() && handCardAssetsReady()) {
    drawHanddrawnCardFace(card, x, y, highlight);
    return;
  }
  if (highlight) {
    drawCardOutlineGlow(x, y);
  }
  if (card.up === false) {
    if (drawFloorCardBack(x, y)) return;
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
    drawCardGoldOutline(x, y);
    return;
  }
  shadow(0, 7, 12, "rgba(0,0,0,.28)", () => gradientRound(x, y, CARD_W, CARD_H, 9, [[0, "#fff2cb"], [.55, C.parchment], [1, "#cdbb8f"]], true));
  strokeRound(x + 4, y + 4, CARD_W - 8, CARD_H - 8, 6, "rgba(255,255,255,.22)", 1);
  const red = card.suit === "H" || card.suit === "D";
  const color = red ? "#aa2323" : "#191923";
  const suit = { S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663" }[card.suit];
  text(card.rank, x + 8, y + 28, card.rank === "10" ? 22 : 26, color, "left", "serif");
  text(suit, x + 8 + (card.rank === "10" ? 13 : 10), y + 47, 15, color, "center", "serif");
  text(suit, x + CARD_W / 2, y + CARD_H / 2 + 18, 44, color, "center", "serif");
  text(card.rank, x + CARD_W - 8, y + CARD_H - 10, card.rank === "10" ? 18 : 21, color, "right", "serif");
  text(suit, x + CARD_W - 18, y + CARD_H - 32, 14, color, "center", "serif");
  drawCardGoldOutline(x, y);
};

drawChips = function drawChips(x, y, amount, scale = 1) {
  const denoms = chipDenoms();
  let rest = amount;
  let n = 0;
  if (amount <= 0) {
    ctx.strokeStyle = "rgba(238,231,215,.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x + 20 * scale, y + 6 * scale, 20 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  for (const denom of denoms) {
    const { value } = denom;
    while (rest >= value && n < 12) {
      const cy = y + 6 * scale - n * 5 * scale;
      drawChipToken(x + 20 * scale, cy, denom, scale, 0, 1);
      rest -= value;
      n++;
    }
  }
};

function chipDenoms() {
  return [
    { value: 500, color: "#d2af3c", edge: "#fff0a2", label: "500" },
    { value: 100, color: "#292737", edge: "#d9d7ec", label: "100" },
    { value: 25, color: "#31935a", edge: "#e7ffe8", label: "25" },
    { value: 10, color: "#315fb8", edge: "#e5ecff", label: "10" },
    { value: 5, color: "#b63b3b", edge: "#ffe2dc", label: "5" },
    { value: 1, color: "#e8e2cf", edge: "#27232b", label: "1" }
  ];
}

function drawChipToken(cx, cy, denom, scale = 1, rotation = 0, alpha = 1) {
  const rx = 20 * scale;
  const ry = 7 * scale;
  const depth = 7 * scale;
  const labelSize = Math.max(7, 9 * scale);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  shadow(0, 4 * scale, 9 * scale, "rgba(0,0,0,.32)", () => {
    ctx.fillStyle = shade(denom.color, -62);
    ctx.fillRect(-rx, 0, rx * 2, depth);
    ctx.beginPath();
    ctx.ellipse(0, depth, rx, ry, 0, 0, Math.PI);
    ctx.fill();
    const top = ctx.createLinearGradient(-rx, -ry, rx, ry);
    top.addColorStop(0, shade(denom.color, 35));
    top.addColorStop(.48, denom.color);
    top.addColorStop(1, shade(denom.color, -40));
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = "#07060a";
  ctx.lineWidth = Math.max(1, 1.4 * scale);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * .96, ry * .96, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = denom.edge;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    ctx.save();
    ctx.rotate(a);
    fill(denom.edge, rx * .58, -ry * .34, rx * .26, ry * .68, 1.5 * scale);
    ctx.restore();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,.62)";
  ctx.lineWidth = Math.max(.8, 1.3 * scale);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * .62, ry * .55, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * .42, ry * .34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = denom.edge;
  ctx.lineWidth = Math.max(.8, 1 * scale);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * .38, ry * .3, 0, 0, Math.PI * 2);
  ctx.stroke();
  text(denom.label, 0, labelSize * .33, labelSize, denom.value === 1 ? "#15131a" : "#fff8d2", "center");
  ctx.restore();
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
  const theme = activeFloorColor();
  const ui = activeFloorUi();
  const stops = !enabled
    ? [[0, "#282631"], [1, "#1a1820"]]
    : primary
      ? [[0, hot ? lighten(ui.primaryTop, .06) : ui.primaryTop], [1, ui.primaryBottom]]
      : [[0, hot ? ui.buttonHot : ui.buttonIdle], [1, hot ? hexToRgba(theme, .28) : ui.buttonBottom]];
  shadow(0, hot ? 8 : 4, hot ? 18 : 10, "rgba(0,0,0,.32)", () => gradientRound(x, y, w, h, 9, stops, true));
  strokeRound(x, y, w, h, 9, enabled ? (primary ? ui.primaryStroke : hexToRgba(theme, .72)) : "#47414f", primary ? 2 : 1.5);
  fill("rgba(255,255,255,.12)", x + 2, y + 2, w - 4, Math.max(1, h * .34), 7);
  strokeRound(x + 4, y + 4, w - 8, h - 8, 6, enabled ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.03)", 1);
  const fontSize = portrait ? Math.min(28, Math.max(23, h * .36)) : isTouchLandscape() ? 28 : 17;
  textFit(label, x + w / 2, y + h / 2 + (portrait ? 9 : isTouchLandscape() ? 10 : 7), w - 12, fontSize, primary ? ui.primaryText : enabled ? C.text : C.muted, "center");
}

function badge(x, y, label, color) {
  const portrait = viewport.portrait;
  const size = portrait ? 19 : 15;
  ctx.font = `700 ${size}px sans-serif`;
  const width = Math.max(portrait ? 58 : 42, ctx.measureText(label).width + (portrait ? 32 : 24));
  const height = portrait ? 40 : 32;
  gradientRound(x - width / 2, y - height / 2, width, height, height / 2, [[0, "#1b1621"], [1, "#08070b"]], true);
  strokeRound(x - width / 2, y - height / 2, width, height, height / 2, color, 1.5);
  textFit(label, x, y + (portrait ? 7 : 6), width - (portrait ? 18 : 14), size, color, "center");
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
  if (game.phase === "loanOffer" && !canSeeLoanOffer()) return "Waiting";
  if (game.phase === "player" && isFreeForAll()) return "Free For All";
  return {
    map: "Choose Route",
    betting: "Betting",
    insurance: "Insurance",
    player: game.freePlay ? "Free Play — Everyone Acts" : game.seats[game.activeSeat]?.id === localPlayerId ? "Your Turn" : `${game.seats[game.activeSeat]?.name}'s Turn`,
    dealer: "Dealer Turn",
    dealerReveal: "Dealer Blackjack",
    loanOffer: "Blood Contract",
    roundOver: game.roundNet > 0 ? "Round Won" : game.roundNet < 0 ? "Round Lost" : "Push",
    shop: "Shop",
    victory: "Victory",
    defeat: "Defeat"
  }[game.phase] || game.phase;
}

function seatStatus(seat) {
  if (seat.dead) return "Dead";
  if (isFreeForAll() && seat.bankrupt) return canTakeLoan(seat) ? "Bankrupt" : "Out";
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

function loanSigner() {
  return game?.seats.find((s) => s.id === game.loanSeatId)
    || mySeat()
    || game?.seats?.[0]
    || { id: localPlayerId, name: savedPlayerName("Player") };
}

function feltTheme() {
  const e = game.enemy;
  if (e.tiesLose) return ["#4a252d", "#2b141b", "#12090d"];
  if (e.luck) return ["#382956", "#201735", "#0e0a18"];
  if (e.hitFee) return ["#554322", "#2f2513", "#151007"];
  if (e.noDouble || e.noSurrender) return ["#243d50", "#142633", "#081118"];
  return ["#234331", "#12251c", "#07120f"];
}

function activeFloorColor() {
  if (game?.map?.color) return game.map.color;
  if (game) return floorThemeColor(Number(game.floor) || 0);
  return floorThemeColor(0);
}

function activeFloorUi() {
  return floorUiPalette(game ? Number(game.floor) || 0 : 0);
}

function houseRules() {
  const e = game.enemy;
  const rules = [];
  if (e.isBoss && Array.isArray(e.bossPhases)) {
    const phase = e.bossPhases[clamp(Number(e.bossPhase) || 0, 0, e.bossPhases.length - 1)];
    if (phase) rules.push(`Boss phase ${Number(e.bossPhase || 0) + 1}: ${phase.name} — ${phase.text}`);
    if (e.roundDamageCap) rules.push(`Boss can take at most ${e.roundDamageCap} damage per round`);
  }
  if (e.tiesLose) rules.push("Ties count as dealer wins");
  if (e.bjPays65) rules.push("Blackjack pays only 6:5");
  if (e.noSurrender) rules.push("Surrender is forbidden");
  if (e.noInsurance) rules.push("Insurance is forbidden");
  if (e.noDouble) rules.push("Doubling down is forbidden");
  if (e.dealerPeek === false) rules.push("Dealer does not peek for blackjack");
  if (e.hitFee) rules.push(`Each hit costs ${e.hitFee} gold`);
  if (e.hitsSoft17 !== false) rules.push("Dealer hits soft 17");
  const bossRules = activeBossPhaseRules(e);
  if (bossRules.lossHpMult && bossRules.lossHpMult !== 1) rules.push(`Losing hands deal ${Math.round((bossRules.lossHpMult - 1) * 100)}% extra HP damage`);
  if (bossRules.bossDamageMult && bossRules.bossDamageMult !== 1) rules.push(`Boss takes ${Math.round((1 - bossRules.bossDamageMult) * 100)}% less damage`);
  if (bossRules.winDamageMult && bossRules.winDamageMult !== 1) rules.push(`Wins deal ${Math.round((bossRules.winDamageMult - 1) * 100)}% extra boss damage`);
  if (bossRules.blackjackDamageMult && bossRules.blackjackDamageMult !== 1) rules.push(`Blackjacks deal ${Math.round((bossRules.blackjackDamageMult - 1) * 100)}% extra boss damage`);
  if (bossRules.exact21DamageMult && bossRules.exact21DamageMult !== 1) rules.push(`Hands totaling 21 deal ${Math.round((bossRules.exact21DamageMult - 1) * 100)}% extra boss damage`);
  if (bossRules.winGoldMult && bossRules.winGoldMult !== 1) rules.push(`Winning payouts are ${Math.round((1 - bossRules.winGoldMult) * 100)}% lower`);
  if (bossRules.minStandTotal) rules.push(`You cannot stand below ${bossRules.minStandTotal}`);
  if (bossRules.maxHitTotal) rules.push(`You cannot hit above ${bossRules.maxHitTotal}`);
  if (bossRules.dealerCharlie) rules.push("Dealer 5-card Charlie beats standing hands");
  if (bossRules.bossHealOnPlayerLoss) rules.push(`Boss heals ${bossRules.bossHealOnPlayerLoss} HP after non-winning rounds`);
  if (!rules.length) rules.push("Standard dungeon blackjack rules");
  return rules.slice(0, 9);
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
  const seat = mySeat();
  return hand?.cards.length === 2
    && cardValue(hand.cards[0]) === cardValue(hand.cards[1])
    && seatBankroll(seat) >= hand.bet
    && (seat?.hands?.length || 0) < maxSplitHands();
}

function bossAllowsHit(hand) {
  if (!hand) return false;
  const maxHitTotal = Number(bossRuleValue("maxHitTotal", 0)) || 0;
  return !maxHitTotal || handTotal(hand) <= maxHitTotal;
}

function bossAllowsStand(hand) {
  if (!hand) return false;
  const minStandTotal = Number(bossRuleValue("minStandTotal", 0)) || 0;
  return !minStandTotal || handTotal(hand) >= minStandTotal;
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

function polygon(cx, cy, radius, sides, color) {
  pathPolygon(cx, cy, radius, sides);
  ctx.fillStyle = color;
  ctx.fill();
}

function polygonStroke(cx, cy, radius, sides, color, line = 1) {
  pathPolygon(cx, cy, radius, sides);
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.stroke();
}

function pathPolygon(cx, cy, radius, sides) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / sides;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function lighten(hex, amount = .15) {
  const raw = String(hex).replace("#", "");
  if (raw.length !== 6) return hex;
  const n = parseInt(raw, 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) + 255 * amount));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + 255 * amount));
  const b = Math.min(255, Math.round((n & 255) + 255 * amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgba(hex, alpha = 1) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length !== 6) return hex;
  const n = parseInt(raw, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
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

function ellipsizeText(value, maxWidth, size, family = "sans-serif") {
  let result = String(value ?? "");
  ctx.font = `700 ${size}px ${family}`;
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || ctx.measureText(result).width <= maxWidth) return result;
  const ellipsis = "…";
  while (result.length > 1 && ctx.measureText(`${result}${ellipsis}`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result.length ? `${result}${ellipsis}` : ellipsis;
}

function textFit(str, x, y, maxWidth, size, color, align = "left", family = "sans-serif") {
  text(ellipsizeText(str, maxWidth, size, family), x, y, size, color, align, family);
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
        textFit(`${line.replace(/\.*$/, "")}…`, x, cy, width, size, color);
        return;
      }
      textFit(line, x, cy, width, size, color);
      line = word;
      cy += lineHeight;
    } else if (ctx.measureText(test).width > width && !line) {
      lines++;
      textFit(test, x, cy, width, size, color);
      line = "";
      cy += lineHeight;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) textFit(line, x, cy, width, size, color);
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

function isIOSDevice() {
  return /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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
  textFit(`${playerRankIcon(seat)}${seat.name}`, x + 34, y + 58, w - 250, viewport.portrait ? 34 : 28, seatInDebt(seat) ? C.red : C.gold, "left", "serif");
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
  if (role === "host" && seat.id !== hostId) {
    addButton(x + w / 2 - 210, y + h - 75, 200, 48, "Kick", () => kickPlayer(seat.id), false);
    addButton(x + w / 2 + 10, y + h - 75, 200, 48, "Close", () => statsPlayerId = "");
  } else {
    addButton(x + w / 2 - 100, y + h - 75, 200, 48, "Close", () => statsPlayerId = "");
  }
}

function drawRulesOverlay() {
  buttons = [];
  const lw = layoutW(), lh = layoutH(), portrait = viewport.portrait;
  const w = Math.min(portrait ? lw - 48 : 720, lw - 60);
  const h = Math.min(portrait ? 760 : 600, lh - 70);
  const x = (lw - w) / 2, y = Math.max(40, (lh - h) / 2);
  fill("rgba(0,0,0,.72)", 0, 0, lw, lh);
  gradientRound(x, y, w, h, 18, [[0, "#302640"], [1, "#15101c"]], true);
  strokeRound(x, y, w, h, 18, game.enemy.color, 3);
  text("HOUSE RULES", lw / 2, y + 60, 31, C.gold, "center", "serif");
  textFit(game.enemy.name, lw / 2, y + 101, Math.min(520, lw - 120), 22, C.text, "center");
  const rules = houseRules().slice(0, viewport.portrait ? 8 : 8);
  rules.forEach((rule, i) => {
    fill("rgba(238,231,215,.055)", x + 36, y + 132 + i * 54, w - 72, 42, 8);
    ctx.save();
    pathRound(x + 36, y + 132 + i * 54, w - 72, 42, 8);
    ctx.clip();
    text(`• ${rule}`, x + 54, y + 160 + i * 54, viewport.portrait ? 19 : 17, C.text);
    ctx.restore();
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

function drawLogOverlay() {
  buttons = [];
  const lw = layoutW(), lh = layoutH(), portrait = viewport.portrait;
  const x = portrait ? 30 : lw / 2 - 390;
  const y = portrait ? 90 : 86;
  const w = portrait ? lw - 60 : 780;
  const h = portrait ? Math.min(760, lh - 180) : Math.min(620, lh - 150);
  fill("rgba(0,0,0,.72)", 0, 0, lw, lh);
  gradientRound(x, y, w, h, 20, [[0, hexToRgba(activeFloorColor(), .34)], [.45, "#17101f"], [1, "#10161a"]], true);
  strokeRound(x, y, w, h, 20, hexToRgba(activeFloorColor(), .62), 2);
  text("ACTIVITY LOG", x + w / 2, y + 58, portrait ? 32 : 28, C.gold, "center", "serif");
  const lines = game.log?.length ? game.log : ["No activity yet."];
  const rowH = portrait ? 42 : 34;
  const startY = y + 108;
  const maxRows = Math.floor((h - 190) / rowH);
  lines.slice(0, maxRows).forEach((line, i) => {
    if (i % 2 === 0) fill("rgba(238,231,215,.045)", x + 34, startY + i * rowH - 24, w - 68, rowH - 4, 8);
    text(fitLabel(line, w - 92, portrait ? 18 : 15), x + 48, startY + i * rowH, portrait ? 18 : 15, i === 0 ? C.text : C.muted);
  });
  addButton(x + w / 2 - 110, y + h - 74, 220, 50, "Close", () => { logOpen = false; }, true);
}
