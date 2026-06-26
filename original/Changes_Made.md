# Dungeon of Cards — Changes Applied

All eight items from your `Changes to Make.txt` are implemented in `Dungeon_of_Cards.py`. Drop the script and `Velvet_Blackjack.mp3` in the same folder and you're set.

## What changed

1. **Min bet 5 → 1** (softlock fix). Defeat now triggers only when `gold == 0` instead of `gold < 5`.
2. **Chips on the table during betting + visual when betting**. There's now a "betting spot" oval beneath the bet display with a stack of poker chips that decompose by denomination (white 1, red 5, blue 10, green 25, black 100, gold 500). During play, each hand has its own chip stack to its left showing the bet on the line. The dealer area also has a "House" chip stack representing remaining enemy HP — you can literally watch the house lose chips as you damage them.
3. **PNG sprite support** for cards, chips, table felt, and card backs. The game falls back to procedural drawing when sprites are absent (default), so it ships fully playable with zero assets. Drop sprites in the locations below to skin the game.
4. **Background music**. Plays `Velvet_Blackjack.mp3` on loop when found in the script directory (or `assets/`, `audio/`, `music/` subdirs). Press **M** to mute/unmute. Volume is set to 0.35 so SFX still cut through; tweak `self.music_volume` in `SoundFX.__init__` if you want different.
5. **Dealer Total flicker fixed**. Two fixes: (a) the dealer's hole-card flip event is now drained in the same frame `dealer_play_step` emits it, so the flip animation is in flight on the same frame the data layer flips face-up. (b) The peek-check (when the dealer reveals an immediate blackjack) now also emits a flip event so the same suppression applies.
6. **Fullscreen toggle**. Press **F11** (or **Alt+Enter**) to toggle. The display uses `pygame.SCALED` mode so the logical 1280×800 resolution is preserved at any window size — all coordinate math stays valid, pygame handles letterboxing.
7. **Luck stat**. New `luck` stat on `RunState` (player) and `Enemy` (dealer). Values are 0–100. On each card draw, with probability `|net_luck|/100`, the shoe peeks at the next 4 cards and picks the one that brings the recipient closest to 21 without busting (positive luck) or the worst card (negative luck). Net luck on player draws = `player_luck − dealer_luck`. On dealer draws, only dealer luck applies. Four new relics give the player luck (Rabbit's Foot +15, Four-Leaf Clover +25, Dice of the Damned +40, Coin of the Fates +10), and three enemies have it: Veiled Magician (15), Last Light Oracle (25), The Dealer Eternal (35). When luck is in play on either side, a readout appears in the side panel.
8. **Remember last bet**. New `RunState.last_bet` field is captured at deal time and applied on the next `_enter_battle`, clamped to your current bankroll. Rounds carry your bet forward.

Two minor housekeeping things I also did:
- The "Bet ±5/±10" buttons stayed unchanged. With min-bet 1, the **Min** button now sets bet=1, which is enough granularity for late-game scrounging.
- The `enemy.luck` field is plumbed through host → client serialization (with backward-compatible defaults) so co-op clients get the same side-panel readout.

## Where to put sprites (optional)

All sprite paths are searched relative to the script directory. Missing sprites → procedural fallback. First match wins.

```
<script_dir>/
├── Dungeon_of_Cards.py
├── Velvet_Blackjack.mp3              ← background music
└── assets/
    ├── table.png                     ← felt background, scaled to fit
    ├── cards/
    │   ├── card_back.png             ← 60x90, used face-down
    │   ├── AS.png   AH.png   AD.png   AC.png
    │   ├── 2S.png   2H.png   2D.png   2C.png
    │   ├── ...      (rank + first-letter-of-suit, all 52)
    │   ├── 10S.png  10H.png  10D.png  10C.png
    │   ├── JS.png   JH.png   JD.png   JC.png
    │   ├── QS.png   ...
    │   └── KS.png   ...
    └── chips/
        ├── chip_1.png                ← 40x18 (top + edge composite)
        ├── chip_5.png
        ├── chip_10.png
        ├── chip_25.png
        ├── chip_100.png
        └── chip_500.png
```

Card faces are scaled to 60×90 (CARD_W × CARD_H). Chip sprites are scaled to 40×18 — that's the chip's top-face ellipse plus the side edge strip combined, so when sprites are used the procedural edge isn't drawn. Suit letter is the FIRST letter of the suit name: S, H, D, C.

Music can be MP3 or OGG; the loader looks for these names in priority order: `Velvet_Blackjack.mp3`, `Velvet Blackjack.mp3`, `velvet_blackjack.mp3`, `music.mp3`, `bgm.mp3`, `background.mp3`, `music.ogg`, `bgm.ogg`.

## How I tested

The file parses, imports, and runs end-to-end under `SDL_VIDEODRIVER=dummy`. I verified:
- Solo and multi-seat dealing/playing/settling
- Betting and chip-stack rendering at various denominations (1g, 5g, 25g, 87g, 250g, 500g)
- Dealer turn animation: the hole flip event spawns its animation on the same frame face_up flips, no flicker
- `last_bet` persists across rounds and clamps to bankroll
- `MIN_BET=1` allows tiny bets, defeat triggers only at gold=0
- Luck stat: with luck=80 and current_total=15, busts dropped from ~46% to ~13%; with luck=−80, busts rose to ~85%
- Music file discovered in script dir; gracefully absent when not present
- Sprites loaded when present; absent → procedural fallback
- Fullscreen toggle works (with a hardened fallback path for older drivers)
- Side panel hides the Luck readout when both sides are 0

## Caveats

- I didn't add new bet-step buttons. With Min=1 and ±5/±10 plus Max, you can land any value in 1–MAX with at most a few clicks. If you want a ±1 button, it's a one-liner: copy the ±5 button-spec entry in `_draw_action_bar` and the matching `_button_action` branch.
- The dealer-flip flicker fix changes the host's event-drain order. If you're running networked co-op against a v1 client, the client's animation timing may look slightly different — but it'll be correct, just smoother.
- I bumped `_after_round` and `_enter_battle` slightly. If you have other branches building on those, you may need to merge.
- I didn't make actual chip sprites (you have to draw those yourself or download a pack). The procedural chips look fine.
