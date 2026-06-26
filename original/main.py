"""
DUNGEON OF CARDS
================
A blackjack roguelike. Each hand is a battle against a dealer-monster.
Progress through floors, collect relics that modify rules, defeat the final boss.

Standard blackjack rules implemented:
- Hit, Stand, Double Down, Split (up to 4 hands), Surrender, Insurance
- Dealer hits soft 17 (configurable per enemy)
- Blackjack pays 3:2
- Split aces get one card only, no blackjack on split aces
- 6-deck shoe with reshuffle at ~75% penetration

Run with: python3 dungeon_of_cards.py
"""

import pygame
import random
import math
import sys
import os
import array
import asyncio
from enum import Enum, auto
from dataclasses import dataclass, field
from typing import Optional

# =============================================================================
# CONSTANTS
# =============================================================================

SCREEN_W, SCREEN_H = 1280, 800
FPS = 60
IS_WEB = sys.platform == "emscripten"

# Color palette - dark dungeon with gold accents
BG_DARK = (18, 14, 22)
BG_MID = (32, 26, 42)
BG_FELT = (28, 56, 42)         # dark green felt
FELT_EDGE = (60, 90, 70)
GOLD = (220, 180, 70)
GOLD_DIM = (140, 110, 50)
PARCHMENT = (235, 220, 180)
TEXT = (230, 225, 215)
TEXT_DIM = (160, 155, 145)
RED = (200, 60, 60)
GREEN_ACCENT = (90, 180, 110)
BLUE_ACCENT = (90, 140, 200)
PURPLE = (160, 100, 200)
SHADOW = (0, 0, 0, 120)

CARD_W, CARD_H = 90, 130
CARD_RADIUS = 8

# How far above felt.bottom the player's hand row is anchored. Big enough
# that the total badge (rendered at y + CARD_H + 18) clears the action-bar
# buttons (which sit at felt.bottom - 70). 130 leaves ~30px of breathing
# room between the badge and the buttons.
PLAYER_ROW_BOTTOM_OFFSET = 130

SUITS = ['♠', '♥', '♦', '♣']
RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

# Betting bounds. MIN_BET is the floor for an active (non-spectating) seat.
# A seat with bet_amount == 0 is spectating that round.
# Lowered to 1 to avoid a softlock when the player is down to single-digit
# gold but isn't yet "dead" by HP.
MIN_BET = 1
MAX_BET = 500

# =============================================================================
# SOUND
# =============================================================================
#
# Sound effects are synthesized at startup (no asset files). Each effect is
# generated as raw 16-bit signed mono samples and wrapped in a pygame.mixer
# Sound. If mixer fails to initialize (no audio device, headless test, etc.)
# the system silently no-ops via _NullSound, so the game continues to run.
#
# All synthesis is done with stdlib only (math + array.array) so we avoid a
# numpy dependency. Pygame's Sound(buffer=...) accepts any bytes-like object.

SAMPLE_RATE = 22050  # Plenty for short SFX, half the memory of 44100


class _NullSound:
    """Stand-in when pygame.mixer can't be initialized."""
    def play(self, *a, **k): pass
    def set_volume(self, *a, **k): pass


class SoundFX:
    """Synthesizes and plays short sound effects. Safe under headless conditions."""

    # Filenames we'll search for in the script directory and an `assets/`
    # subfolder. The first match wins. Listed in priority order.
    MUSIC_CANDIDATES = [
        "Velvet_Blackjack.mp3",
        "Velvet Blackjack.mp3",
        "velvet_blackjack.mp3",
        "music.mp3",
        "bgm.mp3",
        "background.mp3",
        "music.ogg",
        "bgm.ogg",
    ]

    def __init__(self):
        self.enabled = False
        self.sounds: dict[str, object] = {}
        # Background music state
        self.music_loaded: bool = False
        self.music_path: Optional[str] = None
        self.music_volume: float = 0.35   # subdued — SFX should still cut through
        self._music_muted: bool = False
        try:
            # Pre-init forces our preferred format (16-bit mono) before the
            # mixer auto-picks something else. We use STEREO output (channels=2)
            # so MP3 background music renders correctly; mono SFX still play
            # fine on a stereo mixer (pygame upmixes them automatically).
            pygame.mixer.pre_init(SAMPLE_RATE, -16, 2, 512)
            pygame.mixer.init()
            pygame.mixer.set_num_channels(16)
            self.enabled = True
        except pygame.error:
            self.enabled = False
            return
        self._build_library()
        self._try_load_music()

    def _find_music_file(self) -> Optional[str]:
        """Search likely locations for a background music file. Returns the
        first existing path, or None.

        Discovery strategy:
          1. Prefer an exact filename match against MUSIC_CANDIDATES (in
             priority order) — that lets us pick "Velvet_Blackjack.mp3"
             over a random "song.mp3" if both exist.
          2. Otherwise, scan each search folder and accept ANY file with a
             supported audio extension. This makes the loader robust to
             the user renaming the file or using uppercase extensions like
             `.MP3` (common when transferring from Windows).

        Search roots include the script's directory, the current working
        directory, and PyInstaller's _MEIPASS bundle dir if applicable.
        Each root is searched at the top level AND in `assets/`, `audio/`,
        and `music/` subdirectories."""
        roots = []
        # Script directory (works for `python script.py`)
        try:
            roots.append(os.path.dirname(os.path.abspath(__file__)))
        except NameError:
            pass
        # Current working dir (e.g., user runs from elsewhere)
        roots.append(os.getcwd())
        # PyInstaller onefile temp dir, if applicable
        meipass = getattr(sys, '_MEIPASS', None)
        if meipass:
            roots.append(meipass)
        # Deduplicate while preserving order
        seen = set()
        unique_roots = []
        for r in roots:
            if r and r not in seen:
                seen.add(r)
                unique_roots.append(r)

        # Build the full list of (root, subfolder) folders to scan, in
        # priority order. Top-level first, then subfolders.
        folders = []
        for root in unique_roots:
            for sub in ('', 'assets', 'audio', 'music'):
                folder = os.path.join(root, sub) if sub else root
                if os.path.isdir(folder):
                    folders.append(folder)

        # Pass 1: exact-match the priority filenames (case-insensitive so
        # `Velvet_Blackjack.MP3` is the same as `velvet_blackjack.mp3` on
        # case-sensitive filesystems).
        candidates_lower = {n.lower(): n for n in self.MUSIC_CANDIDATES}
        for folder in folders:
            try:
                entries = os.listdir(folder)
            except OSError:
                continue
            # Map lowercase -> actual filename for case-insensitive match
            entries_lower = {e.lower(): e for e in entries}
            for cand_lower in self.MUSIC_CANDIDATES:
                key = cand_lower.lower()
                if key in entries_lower:
                    return os.path.join(folder, entries_lower[key])

        # Pass 2: accept any audio file we recognize, by extension. This
        # catches arbitrary user-named files like "main_theme.ogg".
        audio_exts = ('.mp3', '.ogg', '.wav', '.flac', '.m4a')
        for folder in folders:
            try:
                entries = sorted(os.listdir(folder))
            except OSError:
                continue
            for entry in entries:
                if entry.lower().endswith(audio_exts):
                    full = os.path.join(folder, entry)
                    if os.path.isfile(full):
                        return full

        return None

    def _try_load_music(self):
        """Locate and prepare a background-music file. Doesn't start playback
        yet — call play_music() for that. Silent no-op if no file is found
        or if pygame.mixer.music can't load it."""
        path = self._find_music_file()
        if not path:
            return
        try:
            pygame.mixer.music.load(path)
            pygame.mixer.music.set_volume(self.music_volume)
            self.music_loaded = True
            self.music_path = path
        except pygame.error:
            self.music_loaded = False
            self.music_path = None

    def play_music(self, loops: int = -1):
        """Start (or restart) the background music. loops=-1 = infinite."""
        if not self.enabled or not self.music_loaded or self._music_muted:
            return
        try:
            pygame.mixer.music.play(loops=loops)
        except pygame.error:
            pass

    def stop_music(self):
        if not self.enabled:
            return
        try:
            pygame.mixer.music.stop()
        except pygame.error:
            pass

    def set_music_volume(self, vol: float):
        self.music_volume = max(0.0, min(1.0, vol))
        if not self.enabled:
            return
        try:
            pygame.mixer.music.set_volume(self.music_volume)
        except pygame.error:
            pass

    def toggle_music_mute(self):
        """Convenience: mute/unmute background music. SFX unaffected."""
        self._music_muted = not self._music_muted
        if not self.enabled:
            return
        if self._music_muted:
            self.stop_music()
        else:
            self.play_music()

    def _build_library(self):
        # Generate every effect once at startup. Each helper returns a Sound.
        self.sounds['card_deal']  = self._swipe(dur=0.10, f0=520, f1=320, vol=0.35)
        self.sounds['card_flip']  = self._swipe(dur=0.13, f0=380, f1=620, vol=0.40)
        self.sounds['card_land']  = self._tick(dur=0.05, freq=180, vol=0.45)
        self.sounds['shuffle']    = self._noise(dur=0.45, vol=0.30, fade='in_out')
        self.sounds['chip']       = self._tick(dur=0.06, freq=900, vol=0.30)
        self.sounds['button']     = self._tick(dur=0.04, freq=600, vol=0.20)
        self.sounds['win']        = self._chord(
            dur=0.45, freqs=[523, 659, 784], vol=0.35, attack=0.02, release=0.30)
        self.sounds['lose']       = self._chord(
            dur=0.40, freqs=[330, 247], vol=0.30, attack=0.02, release=0.30,
            sweep_to=0.7)
        self.sounds['blackjack']  = self._fanfare(vol=0.40)
        self.sounds['bust']       = self._buzz(dur=0.35, freq=110, vol=0.35)
        self.sounds['victory']    = self._fanfare(vol=0.50, big=True)
        self.sounds['defeat']     = self._chord(
            dur=1.10, freqs=[196, 165, 131], vol=0.40, attack=0.05, release=0.80,
            sweep_to=0.5)
        self.sounds['relic']      = self._chord(
            dur=0.55, freqs=[523, 784, 1047], vol=0.30, attack=0.02, release=0.40)
        self.sounds['descend']    = self._chord(
            dur=0.55, freqs=[262, 196, 147], vol=0.35, attack=0.02, release=0.45,
            sweep_to=0.6)

    # ---- waveform builders ----------------------------------------------

    def _make_sound(self, samples: list[float], vol: float) -> object:
        """Convert a list of floats in [-1, 1] to a pygame Sound."""
        # Clamp + scale to int16
        scale = int(32767 * max(0.0, min(1.0, vol)))
        buf = array.array('h')
        for s in samples:
            v = int(scale * max(-1.0, min(1.0, s)))
            buf.append(v)
        try:
            return pygame.mixer.Sound(buffer=buf.tobytes())
        except pygame.error:
            return _NullSound()

    def _envelope(self, n: int, attack: float, release: float, mode: str = 'ar') -> list[float]:
        """Linear attack/release envelope. Lengths are seconds."""
        atk = max(1, int(attack * SAMPLE_RATE))
        rel = max(1, int(release * SAMPLE_RATE))
        env = [1.0] * n
        for i in range(min(atk, n)):
            env[i] = i / atk
        for i in range(min(rel, n)):
            env[n - 1 - i] = min(env[n - 1 - i], i / rel)
        if mode == 'in_out':
            # Symmetric fade for noise sweeps
            half = n // 2
            for i in range(half):
                env[i] = i / half
                env[n - 1 - i] = i / half
        return env

    def _swipe(self, dur: float, f0: float, f1: float, vol: float) -> object:
        """Frequency sweep — used for card swooshes."""
        n = int(dur * SAMPLE_RATE)
        env = self._envelope(n, attack=0.005, release=dur * 0.6)
        out = []
        phase = 0.0
        for i in range(n):
            t = i / n
            f = f0 + (f1 - f0) * t
            phase += 2 * math.pi * f / SAMPLE_RATE
            # Triangle-ish for softness
            s = math.sin(phase) * 0.7 + math.sin(phase * 2) * 0.15
            out.append(s * env[i])
        return self._make_sound(out, vol)

    def _tick(self, dur: float, freq: float, vol: float) -> object:
        """Short percussive blip."""
        n = int(dur * SAMPLE_RATE)
        env = self._envelope(n, attack=0.002, release=dur * 0.9)
        out = []
        for i in range(n):
            phase = 2 * math.pi * freq * i / SAMPLE_RATE
            s = math.sin(phase)
            out.append(s * env[i])
        return self._make_sound(out, vol)

    def _noise(self, dur: float, vol: float, fade: str = 'ar') -> object:
        """Filtered white noise — used for shuffle."""
        n = int(dur * SAMPLE_RATE)
        env = self._envelope(n, attack=0.05, release=0.10, mode=fade)
        out = []
        prev = 0.0
        for i in range(n):
            raw = random.uniform(-1.0, 1.0)
            # Simple low-pass for that "rustling paper" feel
            prev = prev * 0.6 + raw * 0.4
            out.append(prev * env[i])
        return self._make_sound(out, vol)

    def _chord(self, dur: float, freqs: list[float], vol: float,
               attack: float = 0.02, release: float = 0.3,
               sweep_to: Optional[float] = None) -> object:
        """Stacked sines. sweep_to multiplies the freqs over time (e.g. 0.5 = drop an octave)."""
        n = int(dur * SAMPLE_RATE)
        env = self._envelope(n, attack=attack, release=release)
        out = []
        for i in range(n):
            t = i / max(1, n - 1)
            mult = 1.0 if sweep_to is None else (1.0 + (sweep_to - 1.0) * t)
            s = 0.0
            for f in freqs:
                phase = 2 * math.pi * f * mult * i / SAMPLE_RATE
                s += math.sin(phase)
            s /= max(1, len(freqs))
            out.append(s * env[i])
        return self._make_sound(out, vol)

    def _buzz(self, dur: float, freq: float, vol: float) -> object:
        """Square-ish low buzz for negative outcomes."""
        n = int(dur * SAMPLE_RATE)
        env = self._envelope(n, attack=0.01, release=dur * 0.7)
        out = []
        for i in range(n):
            phase = 2 * math.pi * freq * i / SAMPLE_RATE
            s = 1.0 if math.sin(phase) >= 0 else -1.0
            # Add a slight tremolo
            trem = 0.85 + 0.15 * math.sin(2 * math.pi * 8 * i / SAMPLE_RATE)
            out.append(s * env[i] * trem)
        return self._make_sound(out, vol)

    def _fanfare(self, vol: float, big: bool = False) -> object:
        """Short ascending arpeggio — for blackjack and victory."""
        notes = [523, 659, 784, 1047] if not big else [392, 523, 659, 784, 1047, 1319]
        per = 0.10 if not big else 0.13
        all_samples = []
        for f in notes:
            n = int(per * SAMPLE_RATE)
            env = self._envelope(n, attack=0.005, release=per * 0.85)
            for i in range(n):
                phase = 2 * math.pi * f * i / SAMPLE_RATE
                # Two-harmonic for richer tone
                s = math.sin(phase) * 0.7 + math.sin(phase * 2) * 0.2
                all_samples.append(s * env[i])
        return self._make_sound(all_samples, vol)

    # ---- playback -------------------------------------------------------

    def play(self, name: str):
        """Fire-and-forget. Unknown names are silently ignored."""
        if not self.enabled:
            return
        snd = self.sounds.get(name)
        if snd is None:
            return
        try:
            snd.play()
        except pygame.error:
            pass


# =============================================================================
# SPRITES
# =============================================================================
#
# Optional PNG sprite support. If image files exist on disk in known
# locations, they're loaded and used instead of the built-in procedural
# rendering. Missing sprites fall back gracefully — the game stays playable
# with no assets at all (which is the default).
#
# Expected layout (any of these locations works; first hit wins):
#   <script_dir>/assets/cards/card_back.png
#   <script_dir>/assets/cards/AS.png        (rank + suit letter, e.g. "AS",
#                                             "10H", "KD"; suit letter is the
#                                             FIRST letter of suit name:
#                                             S, H, D, C)
#   <script_dir>/assets/table.png           (full felt background, will be
#                                             scaled to the felt rect)
#   <script_dir>/assets/chips/chip_<N>.png  (top-down chip art, ~40x40)
#
# Card face PNGs are scaled to CARD_W x CARD_H. Chips are scaled to
# CHIP_W x (CHIP_H + CHIP_EDGE_H) — i.e., the top + edge composite size.

SUIT_LETTER = {'♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C'}


class SpriteCache:
    """Loads optional PNG sprites at startup. Always safe to query — missing
    keys return None, signaling the caller to fall back to procedural draw."""

    def __init__(self):
        # Asset roots in priority order. First match wins for any given file.
        self._roots: list[str] = []
        try:
            self._roots.append(os.path.dirname(os.path.abspath(__file__)))
        except NameError:
            pass
        self._roots.append(os.getcwd())
        meipass = getattr(sys, '_MEIPASS', None)
        if meipass:
            self._roots.append(meipass)

        # Caches by category. Each maps a key -> pygame.Surface (or None
        # if we tried and failed; we don't retry).
        self.cards: dict[str, Optional[pygame.Surface]] = {}
        self.card_back: Optional[pygame.Surface] = None
        self.table: Optional[pygame.Surface] = None
        self.chips: dict[int, Optional[pygame.Surface]] = {}
        self.relics: dict[str, Optional[pygame.Surface]] = {}

        self._load_all()

    def _find(self, *relpaths: str) -> Optional[str]:
        """Return the first existing path among the given relative paths,
        searched against each asset root."""
        for root in self._roots:
            for rel in relpaths:
                p = os.path.join(root, rel)
                if os.path.isfile(p):
                    return p
        return None

    def _try_load(self, *relpaths: str,
                  size: Optional[tuple[int, int]] = None) -> Optional[pygame.Surface]:
        """Load and optionally rescale an image. Returns None on miss or any
        error. Uses convert_alpha so blits are fast — requires pygame's
        display to already be set up, which it is by the time SpriteCache is
        constructed."""
        path = self._find(*relpaths)
        if not path:
            return None
        try:
            surf = pygame.image.load(path)
            try:
                surf = surf.convert_alpha()
            except pygame.error:
                # No display available (headless tests). Keep the raw surface.
                pass
            if size is not None:
                surf = pygame.transform.smoothscale(surf, size)
            return surf
        except pygame.error:
            return None

    def _load_all(self):
        # Card back
        self.card_back = self._try_load(
            "assets/cards/card_back.png",
            "assets/card_back.png",
            "card_back.png",
            size=(CARD_W, CARD_H),
        )
        # Card faces — all 52 combos. Cheap to attempt in a loop; misses
        # cache as None and we never retry.
        for rank in RANKS:
            for suit in SUITS:
                key = f"{rank}{SUIT_LETTER[suit]}"
                self.cards[key] = self._try_load(
                    f"assets/cards/{key}.png",
                    f"assets/cards/card_{key}.png",
                    f"cards/{key}.png",
                    size=(CARD_W, CARD_H),
                )
        # Table felt background — variable size, so we don't pre-scale here.
        # Callers (specifically _draw_battle) scale per-frame to the felt rect.
        self.table = self._try_load(
            "assets/table.png",
            "table.png",
        )
        # Chips by denomination
        chip_size = (CHIP_W, CHIP_H + CHIP_EDGE_H)
        for value, _f, _s in CHIP_DENOMS:
            self.chips[value] = self._try_load(
                f"assets/chips/chip_{value}.png",
                f"assets/chips/{value}.png",
                f"chips/chip_{value}.png",
                size=chip_size,
            )

    def card_face(self, card: 'Card') -> Optional[pygame.Surface]:
        """Return a face sprite for `card` or None to fall back."""
        key = f"{card.rank}{SUIT_LETTER.get(card.suit, '')}"
        return self.cards.get(key)

    def chip_sprite(self, denom: int) -> Optional[pygame.Surface]:
        return self.chips.get(denom)


# Global sprite cache. Populated by App on startup. Drawing helpers consult
# this lazily — if None (e.g., during early imports or headless tests),
# they fall back to procedural rendering.
SPRITES: Optional[SpriteCache] = None


# =============================================================================
# CARDS & SHOE
# =============================================================================

@dataclass
class Card:
    rank: str
    suit: str
    face_up: bool = True

    @property
    def is_red(self) -> bool:
        return self.suit in ('♥', '♦')

    def base_value(self) -> int:
        """Standard blackjack value. Aces returned as 11; hand handles soft/hard."""
        if self.rank == 'A':
            return 11
        if self.rank in ('J', 'Q', 'K'):
            return 10
        return int(self.rank)


class Shoe:
    """Multi-deck shoe with cut-card reshuffle."""

    def __init__(self, num_decks: int = 6, penetration: float = 0.75):
        self.num_decks = num_decks
        self.penetration = penetration
        self.cards: list[Card] = []
        self.discard: list[Card] = []
        self.total_cards: int = num_decks * 52  # for visual stack height
        # Set to True by draw() whenever it reshuffled this draw. The Game
        # consumes & resets this flag when emitting a shuffle event.
        self.just_reshuffled: bool = False
        self._build_and_shuffle()

    def _build_and_shuffle(self):
        self.cards = []
        for _ in range(self.num_decks):
            for s in SUITS:
                for r in RANKS:
                    self.cards.append(Card(r, s))
        random.shuffle(self.cards)
        self.discard = []
        self._cut_index = int(len(self.cards) * (1 - self.penetration))

    def draw(self, face_up: bool = True) -> Card:
        if len(self.cards) <= self._cut_index:
            # Reshuffle when we hit the cut card
            self._build_and_shuffle()
            self.just_reshuffled = True
        c = self.cards.pop()
        c.face_up = face_up
        return c

    def draw_lucky(self, face_up: bool = True,
                   current_total: int = 0,
                   net_luck: int = 0,
                   peek: int = 4) -> Card:
        """Draw a card, optionally biased by luck.

        net_luck is in [-100, 100]. Positive = recipient is lucky (will tend
        to draw cards that bring `current_total` closest to 21 without
        busting). Negative = unlucky (will tend to draw the worst card).
        Zero = pure random pop.

        With probability |net_luck| / 100, peek at the next `peek` cards in
        the shoe, score each by how close `current_total + value` lands
        relative to 21, and pull whichever scores best (or worst, if
        net_luck < 0). The remaining peeked cards stay in their original
        positions, so the shoe ordering is preserved for non-lucky draws.
        """
        # Reshuffle on cut card the same way as draw().
        if len(self.cards) <= self._cut_index:
            self._build_and_shuffle()
            self.just_reshuffled = True

        # Roll for whether this draw is "lucky" at all.
        nl = max(-100, min(100, int(net_luck)))
        if nl == 0 or random.randint(1, 100) > abs(nl):
            c = self.cards.pop()
            c.face_up = face_up
            return c

        # Look at the top `peek` cards (the last `peek` in self.cards, since
        # we pop from the end). Score each by what `current_total + value`
        # gives us. `value` here treats Ace as 11 if the player can absorb
        # it (current_total + 11 <= 21), otherwise Ace counts as 1 — same
        # logic Hand.best_total uses post-draw.
        n = min(peek, len(self.cards))
        if n <= 1:
            c = self.cards.pop()
            c.face_up = face_up
            return c

        candidates = self.cards[-n:]   # last n cards, top-of-shoe order
        best_idx = 0
        best_score = None
        for i, cand in enumerate(candidates):
            v = cand.base_value()
            if cand.rank == 'A' and current_total + 11 > 21:
                v = 1
            new_total = current_total + v
            # Score: prefer non-bust totals close to 21. Bust totals are
            # ranked by how close to 21 they are (less bad = closer).
            if new_total <= 21:
                # Higher non-bust totals score higher; 21 is best.
                score = new_total           # 0..21
            else:
                # Bust: heavily penalized, but break ties by closeness to 21.
                score = -100 - (new_total - 21)
            if best_score is None:
                best_score = score
                best_idx = i
            elif nl > 0 and score > best_score:
                # Lucky: pick highest-scoring card.
                best_score = score
                best_idx = i
            elif nl < 0 and score < best_score:
                # Unlucky: pick lowest-scoring card.
                best_score = score
                best_idx = i

        # Convert the index into the offset from the end of self.cards and
        # remove that card. The rest stay where they were.
        # candidates[i] corresponds to self.cards[-n + i]
        pop_idx = len(self.cards) - n + best_idx
        c = self.cards.pop(pop_idx)
        c.face_up = face_up
        return c

    @property
    def remaining(self) -> int:
        return len(self.cards)


# =============================================================================
# HAND
# =============================================================================

class HandStatus(Enum):
    PLAYING = auto()
    STAND = auto()
    BUST = auto()
    BLACKJACK = auto()
    SURRENDERED = auto()
    DOUBLED = auto()    # stood after a double-down


@dataclass
class Hand:
    """A single hand. Players can hold multiple hands when splitting."""
    cards: list[Card] = field(default_factory=list)
    bet: int = 0
    status: HandStatus = HandStatus.PLAYING
    is_split_hand: bool = False         # was this hand created via a split?
    is_split_aces: bool = False         # split-aces hands get only one card
    has_doubled: bool = False
    insurance_bet: int = 0              # side bet on dealer blackjack

    def add(self, card: Card):
        self.cards.append(card)

    def best_total(self) -> int:
        """Highest total <= 21, or the lowest total if all bust."""
        total = sum(c.base_value() for c in self.cards)
        aces = sum(1 for c in self.cards if c.rank == 'A')
        # Ace counted as 11 by base_value; downgrade to 1 as needed
        while total > 21 and aces > 0:
            total -= 10
            aces -= 1
        return total

    def is_soft(self) -> bool:
        """True if there's an ace counted as 11 in best_total."""
        total = sum(c.base_value() for c in self.cards)
        aces = sum(1 for c in self.cards if c.rank == 'A')
        # If we have at least one ace and the total fits with an 11-ace, it's soft
        if aces == 0:
            return False
        while total > 21 and aces > 0:
            total -= 10
            aces -= 1
        # After reduction, if any ace is still being counted as 11, hand is soft
        return aces > 0 and total <= 21

    def is_bust(self) -> bool:
        return self.best_total() > 21

    def is_blackjack(self) -> bool:
        """Natural 21: exactly two cards totaling 21, and not from a split."""
        return (
            len(self.cards) == 2
            and self.best_total() == 21
            and not self.is_split_hand
        )

    def is_pair(self) -> bool:
        """Can this hand be split? Two cards of equal blackjack value."""
        if len(self.cards) != 2:
            return False
        # 10/J/Q/K all count as pairs for splitting purposes
        return self.cards[0].base_value() == self.cards[1].base_value()

    def can_double(self) -> bool:
        """House rule: double on any first two cards."""
        return len(self.cards) == 2 and not self.has_doubled and self.status == HandStatus.PLAYING

    def can_surrender(self) -> bool:
        """Late surrender: only on initial two cards, before any other action."""
        return len(self.cards) == 2 and not self.is_split_hand and self.status == HandStatus.PLAYING

    def display_total(self) -> str:
        """For UI: 'Soft 17' or '20' or 'BUST'."""
        if self.is_bust():
            return f"BUST ({self.best_total()})"
        if self.is_blackjack():
            return "BLACKJACK"
        t = self.best_total()
        if self.is_soft() and t != 21:
            return f"Soft {t}"
        return str(t)


# =============================================================================
# ENEMIES (DEALER-MONSTERS)
# =============================================================================

@dataclass
class Enemy:
    """A dealer-monster. Holds rule modifiers for the encounter."""
    name: str
    title: str                   # flavor subtitle
    hp: int                      # how much "damage" you need to deal (chips won)
    color: tuple                 # accent color
    icon: str                    # single-char glyph
    description: str             # rule description shown in UI
    hits_soft_17: bool = True    # H17 vs S17
    bj_pays_6_5: bool = False    # punishing variant
    no_surrender: bool = False
    no_insurance: bool = False
    ties_lose: bool = False      # vampire rule
    dealer_peek: bool = True     # peek for blackjack on 10/A
    extra: dict = field(default_factory=dict)  # rule-specific extras
    # Dealer's own luck (0-100). Acts on the dealer's own draws, AND opposes
    # the player's luck on player draws (the dealer "jinxes" you). 0 means
    # an honest deal.
    luck: int = 0


# Tier markers used by build_campaign() to group enemies by difficulty.
# Floor 1 and the final floor are fixed; everything else is sampled by tier.
TIER_EARLY = 1     # gentle / single-rule enemies → middle floors lower half
TIER_MID = 2       # stronger or combined rules → middle floors middle band
TIER_LATE = 3      # multi-stack hostility → middle floors upper band

# How many floors of the campaign each tier fills (excluding fixed floor 1
# and final boss). With CAMPAIGN_LENGTH=10: 1 fixed + 3 + 3 + 2 + 1 fixed = 10.
TIER_FLOOR_COUNTS = {TIER_EARLY: 3, TIER_MID: 3, TIER_LATE: 2}
CAMPAIGN_LENGTH = 1 + sum(TIER_FLOOR_COUNTS.values()) + 1  # = 10


def _make_fixed_first_enemy() -> Enemy:
    """Floor 1 is always the same — the tutorial floor."""
    return Enemy("Apprentice Croupier", "Floor 1 · Dealer-in-training",
                 hp=80, color=BLUE_ACCENT, icon='♣',
                 description="Standard rules. A gentle introduction.",
                 hits_soft_17=False)


def _make_fixed_final_boss() -> Enemy:
    """The Dealer Eternal is always the final encounter."""
    return Enemy("The Dealer Eternal", "FINAL · Architect of the dungeon",
                 hp=500, color=GOLD, icon='BOSS',
                 description="Every house rule against you. The deck itself answers to them.",
                 ties_lose=True, bj_pays_6_5=True, no_surrender=True, no_insurance=True,
                 luck=35)


def _tier_early_candidates() -> list[Enemy]:
    """Tier 1 — single-rule pressure. Pool of 9 for 3 slots."""
    return [
        Enemy("Tavern Cardsharp", "Sticky fingers",
              hp=0, color=GREEN_ACCENT, icon='♠',
              description="Hits soft 17. Otherwise plays it straight."),
        Enemy("Hooded Stranger", "Plays them close to the chest",
              hp=0, color=(150, 130, 180), icon='?',
              description="No hole-card peek. Doubles and splits risk the full bet vs. dealer BJ.",
              dealer_peek=False),
        Enemy("Vampire Dealer", "Ties belong to the night",
              hp=0, color=RED, icon='♥',
              description="Pushes count as dealer wins. Watch your throat.",
              ties_lose=True),
        Enemy("Toll Collector", "Every card has a price",
              hp=0, color=(190, 160, 90), icon='$',
              description="Each hit costs 5 gold. Stand often or bleed dry.",
              extra={'hit_fee': 5}),
        # NEW T1: forced-stand pressure via a soft rule modifier.
        Enemy("Court Jester", "Foolish play, foolish loss",
              hp=0, color=(220, 130, 200), icon='J',
              description="Hits soft 17. Insurance forbidden.",
              hits_soft_17=True, no_insurance=True),
        # NEW T1: punishes splits indirectly by removing surrender as a recovery option.
        Enemy("Coin-Eater", "Eats every coin you toss",
              hp=0, color=(170, 140, 60), icon='c',
              description="Surrender forbidden. Each hit costs 3 gold.",
              no_surrender=True, extra={'hit_fee': 3}),
        # NEW T1: pure 6:5 squeeze with no other tricks — punishes naturals.
        Enemy("Tin Pit Boss", "Cheap chips, cheaper payouts",
              hp=0, color=(160, 170, 180), icon='t',
              description="Blackjack pays only 6:5. Otherwise standard.",
              bj_pays_6_5=True),
        # NEW T1: clean push-loses for early-game tempo loss without other rules.
        Enemy("Graveyard Shift Dealer", "Dawn never comes",
              hp=0, color=(130, 140, 170), icon='z',
              description="Pushes count as dealer wins. No peek.",
              ties_lose=True, dealer_peek=False),
        # NEW T1: small-fee tax + H17, the entry-level economic enemy.
        Enemy("Wandering Tinker", "Pay the tinker, take the card",
              hp=0, color=(180, 180, 130), icon='w',
              description="Each hit costs 4 gold. Hits soft 17.",
              hits_soft_17=True, extra={'hit_fee': 4}),
    ]


def _tier_mid_candidates() -> list[Enemy]:
    """Tier 2 — combined rules or removed player tools. Pool of 10 for 3 slots."""
    return [
        Enemy("Iron Bookkeeper", "No mercy, no surrender",
              hp=0, color=(180, 180, 200), icon='♦',
              description="Surrender forbidden. Insurance forbidden.",
              no_surrender=True, no_insurance=True),
        Enemy("Crooked Sheriff", "No deals, no doubles",
              hp=0, color=(200, 100, 80), icon='*',
              description="Doubling down is forbidden at this table.",
              hits_soft_17=True, extra={'no_double': True}),
        Enemy("Cursed Magistrate", "Justice pays poorly",
              hp=0, color=PURPLE, icon='LAW',
              description="Blackjack pays only 6:5.",
              bj_pays_6_5=True),
        Enemy("Plague Doctor", "No cure for a hard 16",
              hp=0, color=(110, 160, 130), icon='+',
              description="No peek. No surrender. Dealer hits soft 17.",
              dealer_peek=False, no_surrender=True),
        Enemy("Whispering Auditor", "The ledger always balances",
              hp=0, color=(170, 170, 220), icon='%',
              description="Hits soft 17. Each hit costs 10 gold. Pushes lose.",
              hits_soft_17=True, ties_lose=True, extra={'hit_fee': 10}),
        # NEW T2: 6:5 plus push-loses, no extra rules — pure rate squeeze.
        Enemy("Greedy Notary", "Every signature costs you",
              hp=0, color=(180, 150, 90), icon='&',
              description="6:5 blackjack. Pushes lose. Hits soft 17.",
              bj_pays_6_5=True, ties_lose=True, hits_soft_17=True),
        # NEW T2: no-double + no-peek hybrid; punishes aggressive openers.
        Enemy("Veiled Magician", "The trick is on you",
              hp=0, color=(140, 100, 180), icon='~',
              description="No peek. Doubling forbidden. Sleight of hand.",
              dealer_peek=False, extra={'no_double': True}, luck=15),
        # NEW T2: tool-stripping — kills both bailout buttons and adds H17.
        Enemy("Silent Executor", "The verdict is already written",
              hp=0, color=(90, 100, 110), icon='X',
              description="Hits soft 17. Surrender forbidden. Insurance forbidden.",
              hits_soft_17=True, no_surrender=True, no_insurance=True),
        # NEW T2: economic mid-tier; medium fee + 6:5 squeezes profitability.
        Enemy("Pawnshop Tyrant", "Every chip changes hands twice",
              hp=0, color=(160, 130, 70), icon='p',
              description="Each hit costs 8 gold. Blackjack pays 6:5.",
              bj_pays_6_5=True, extra={'hit_fee': 8}),
        # NEW T2: no-double + push-loses; restricts the strongest play and removes safe ties.
        Enemy("Mirror Twin", "Two hands, never yours",
              hp=0, color=(190, 200, 220), icon='m',
              description="Doubling forbidden. Pushes count as dealer wins.",
              ties_lose=True, extra={'no_double': True}),
    ]


def _tier_late_candidates() -> list[Enemy]:
    """Tier 3 — endgame gauntlet floors. Pool of 9 for 2 slots."""
    return [
        Enemy("Warden of Spades", "Forged in iron, dealt in spades",
              hp=0, color=(120, 130, 160), icon='♠',
              description="No surrender, no insurance, no peek. Pushes lose.",
              no_surrender=True, no_insurance=True, dealer_peek=False, ties_lose=True),
        Enemy("Lich Banker", "The house always wins",
              hp=0, color=(120, 200, 220), icon='LICH',
              description="Hits soft 17. Pushes lose. 6:5 blackjack.",
              ties_lose=True, bj_pays_6_5=True),
        Enemy("Gilded Inquisitor", "Confess your winnings",
              hp=0, color=(220, 170, 90), icon='!',
              description="6:5 blackjack. Doubling forbidden. Insurance forbidden.",
              bj_pays_6_5=True, no_insurance=True, extra={'no_double': True}),
        Enemy("Twin Croupiers", "Two hands, one verdict",
              hp=0, color=(200, 90, 200), icon='2x',
              description="Each hit costs 15 gold. No surrender. Pushes lose.",
              ties_lose=True, no_surrender=True, extra={'hit_fee': 15}),
        # NEW T3: 6:5 plus no-double plus push-loses — heavy bankroll cap.
        Enemy("Obsidian Marquis", "Carved from cold ambition",
              hp=0, color=(70, 70, 100), icon='M',
              description="6:5 blackjack. Doubling forbidden. Pushes lose.",
              bj_pays_6_5=True, ties_lose=True, extra={'no_double': True}),
        # NEW T3: max-fee hit-tax with H17 — late-game economic warfare.
        Enemy("Hollow Sovereign", "Crowned in chips, hollow within",
              hp=0, color=(180, 200, 200), icon='K',
              description="Each hit costs 20 gold. Hits soft 17. No insurance.",
              hits_soft_17=True, no_insurance=True, extra={'hit_fee': 20}),
        # NEW T3: total tool-stripping — every safety net removed at once.
        Enemy("Black Deck Marshal", "No appeal, no escape",
              hp=0, color=(80, 80, 90), icon='B',
              description="Hits soft 17. No surrender. No insurance. No peek.",
              hits_soft_17=True, no_surrender=True, no_insurance=True, dealer_peek=False),
        # NEW T3: economic + 6:5 + no-double; punishes any aggressive line.
        Enemy("Carrion Auctioneer", "Selling your remains by the gram",
              hp=0, color=(140, 100, 110), icon='A',
              description="6:5 blackjack. Each hit costs 12 gold. Doubling forbidden.",
              bj_pays_6_5=True, extra={'hit_fee': 12, 'no_double': True}),
        # NEW T3: pre-final cocktail — H17, no peek, push-loses; high-variance.
        Enemy("Last Light Oracle", "Reads your hand before you do",
              hp=0, color=(200, 180, 230), icon='O',
              description="Hits soft 17. No peek. Pushes lose. Reads the deck.",
              hits_soft_17=True, dealer_peek=False, ties_lose=True, luck=25),
    ]


def _calibrated_hp_for_floor(floor_one_indexed: int) -> int:
    """Linear HP curve so swapped enemies feel right for their slot.
    Anchored: floor 1 = 80, floor 10 (final) = 500. Smooth ramp between."""
    # Floor 1 and the final floor are fixed. Middle floors (2..9) ramp linearly
    # from ~130 to ~440, roughly +44 HP per floor.
    if floor_one_indexed == 1:
        return 80
    if floor_one_indexed == CAMPAIGN_LENGTH:
        return 500
    # Smooth ramp for floors 2..9: starts at ~130, ends at ~438.
    return 130 + (floor_one_indexed - 2) * 44


def build_campaign(rng: Optional[random.Random] = None) -> list[Enemy]:
    """Build a randomized campaign for one run.

    Floor 1: always Apprentice Croupier.
    Final floor: always The Dealer Eternal.
    Middle floors are sampled per tier (no repeats), then placed on the
    floors assigned to that tier so difficulty still ramps. Each picked
    enemy's hp and title are rewritten to match its assigned floor.
    """
    r = rng or random
    enemies: list[Enemy] = [_make_fixed_first_enemy()]

    # Walk tiers in order so floor numbers are filled left-to-right.
    tier_pools = [
        (TIER_EARLY, _tier_early_candidates()),
        (TIER_MID, _tier_mid_candidates()),
        (TIER_LATE, _tier_late_candidates()),
    ]
    floor = 2  # next floor to fill (1-indexed; floor 1 already added)
    for tier_id, pool in tier_pools:
        slots = TIER_FLOOR_COUNTS[tier_id]
        if len(pool) < slots:
            # Defensive: if a designer ever shrinks a tier below required slots,
            # fall back to allowing repeats rather than crashing.
            picks = [r.choice(pool) for _ in range(slots)]
        else:
            picks = r.sample(pool, slots)
        for e in picks:
            # Rewrite hp + title for the actual floor this enemy occupies.
            # We make a copy so the candidate templates aren't mutated across runs.
            placed = Enemy(
                name=e.name,
                title=f"Floor {floor} · {e.title}",
                hp=_calibrated_hp_for_floor(floor),
                color=e.color, icon=e.icon, description=e.description,
                hits_soft_17=e.hits_soft_17, bj_pays_6_5=e.bj_pays_6_5,
                no_surrender=e.no_surrender, no_insurance=e.no_insurance,
                ties_lose=e.ties_lose, dealer_peek=e.dealer_peek,
                extra=dict(e.extra),
            )
            enemies.append(placed)
            floor += 1

    enemies.append(_make_fixed_final_boss())
    assert len(enemies) == CAMPAIGN_LENGTH
    return enemies


def make_enemy_pool() -> list[Enemy]:
    """Backwards-compat shim. Existing callers just want 'the campaign for
    this run', which is now randomized. Kept under the old name so external
    references (and the LAN client's deserializer) keep working."""
    return build_campaign()


# =============================================================================
# RELICS
# =============================================================================

@dataclass
class Relic:
    """Passive item the player collects between floors. Modifies rules."""
    name: str
    icon: str
    description: str
    color: tuple = GOLD
    # Effect flags - read by Game when resolving.
    # Booleans use `run.has(attr)`; numerics use `run.relic_sum(attr)` so
    # multiple stacking relics combine.
    bj_pays_2_1: bool = False           # blackjack pays 2:1 instead of 3:2
    insurance_pays_3_1: bool = False    # insurance pays 3:1 instead of 2:1
    free_surrender: bool = False        # surrender refunds full bet
    push_wins: bool = False             # pushes count as wins
    five_card_charlie: bool = False     # 5 cards under 22 auto-wins
    double_after_split: bool = True     # DAS - usually on by default
    extra_split: bool = False           # allow re-splitting aces
    win_heal: int = 0                   # heal HP on win
    bet_refund_pct: float = 0.0         # refund % of losing bets
    # ---- new in this expansion ----
    damage_bonus: int = 0               # flat extra HP damage to enemy on a winning round
    chip_per_win: int = 0               # flat gold bonus added to each winning hand's payout
    bust_refund_pct: float = 0.0        # refund % only when the PLAYER busts (separate from
                                        # bet_refund_pct which also refunds losses & dealer-BJ)
    # ---- luck expansion ----
    luck_bonus: int = 0                 # adds to RunState.luck (capped at 100 in apply_luck)


def all_relics() -> list[Relic]:
    return [
        # ---- original relics ----
        Relic("Lucky Coin", "$", "Pushes count as wins.",
              color=GOLD, push_wins=True),
        Relic("Double Crown", "2x", "Blackjack pays 2:1.",
              color=GOLD, bj_pays_2_1=True),
        Relic("White Flag", "F", "Surrender refunds your full bet.",
              color=PARCHMENT, free_surrender=True),
        Relic("Charlie's Hand", "5", "5 cards without busting wins automatically.",
              color=GREEN_ACCENT, five_card_charlie=True),
        Relic("Insurance Policy", "+", "Insurance pays 3:1 instead of 2:1.",
              color=BLUE_ACCENT, insurance_pays_3_1=True),
        Relic("Split Mastery", "><", "Aces may be re-split freely.",
              color=PURPLE, extra_split=True),
        Relic("Vampire's Bargain", "V", "Heal 15 HP on every winning hand.",
              color=RED, win_heal=15),
        Relic("Pawnbroker's Note", "%", "Refund 25% of losing bets.",
              color=GOLD_DIM, bet_refund_pct=0.25),
        # ---- new relics: existing flags, stacking variants ----
        # Stacks with Vampire's Bargain (relic_sum on win_heal already handles this).
        Relic("Phoenix Feather", "^", "Heal 30 HP on every winning hand.",
              color=(230, 130, 60), win_heal=30),
        # Stacks with Pawnbroker's Note for up to 65% loss refund.
        Relic("Merchant's Ledger", "L", "Refund an additional 40% of losing bets.",
              color=GOLD_DIM, bet_refund_pct=0.40),
        # ---- new relics: new effect fields, wired into resolve/_settle_hand ----
        Relic("Executioner's Mark", "X", "Deal +20 bonus damage on any round you win.",
              color=(200, 60, 90), damage_bonus=20),
        Relic("Dragon's Tooth", "T", "Deal +40 bonus damage on any round you win.",
              color=(180, 50, 50), damage_bonus=40),
        Relic("Gambler's Tip", "G", "Each winning hand pays an extra 10 gold.",
              color=GOLD, chip_per_win=10),
        Relic("Golden Tongue", "$$", "Each winning hand pays an extra 25 gold.",
              color=GOLD, chip_per_win=25),
        Relic("Featherfall Charm", "~", "When you bust, refund 50% of that bet.",
              color=(180, 200, 230), bust_refund_pct=0.50),
        # ---- new relics: combo effects (multiple existing flags on one relic) ----
        # Powerful but rare to roll — gives charlie + DAS retention.
        Relic("Quicksilver Glove", "Q", "5-card Charlie wins, and pushes count as wins.",
              color=(200, 200, 255), five_card_charlie=True, push_wins=True),
        # Late-game tank pick: heal + small damage bonus.
        Relic("Heart of the Deck", "H", "Heal 10 HP on win and deal +10 bonus damage.",
              color=RED, win_heal=10, damage_bonus=10),
        # Bankroll-focused pick: trade flat gold for refund percentage.
        Relic("Usurer's Seal", "U", "Each winning hand pays +15g; refund 15% of losses.",
              color=GOLD_DIM, chip_per_win=15, bet_refund_pct=0.15),

        # =====================================================================
        # TIER-THEMED RELICS — same shop pool, but flavored per boss tier.
        # =====================================================================

        # ---- Tier 1 themed: small steady benefits, gentle utility ----
        # Counter to Toll Collector / Coin-Eater / Wandering Tinker (hit-fee enemies).
        Relic("Tinker's Thimble", "o", "Each winning hand pays an extra 5 gold.",
              color=(200, 190, 140), chip_per_win=5),
        # Counter to Vampire Dealer / Graveyard Shift Dealer (push-loses enemies).
        Relic("Bone Talisman", "b", "Heal 8 HP on every winning hand.",
              color=(220, 220, 200), win_heal=8),
        # Counter to Tin Pit Boss / Cursed Magistrate (6:5 enemies).
        Relic("Apprentice's Coin", "a", "Refund 15% of losing bets.",
              color=(180, 180, 200), bet_refund_pct=0.15),
        # Pure damage starter — pairs well with low-HP early floors.
        Relic("Iron Filing", "i", "Deal +10 bonus damage on any round you win.",
              color=(150, 150, 160), damage_bonus=10),

        # ---- Tier 2 themed: meaningful power spikes, dual-purpose ----
        # Counter to Iron Bookkeeper / Silent Executor (no-surrender + no-insurance).
        Relic("Magistrate's Writ", "W", "Surrender refunds your full bet, "
                                        "and insurance pays 3:1.",
              color=PURPLE, free_surrender=True, insurance_pays_3_1=True),
        # Counter to Crooked Sheriff / Mirror Twin (no-double enemies) —
        # turns split aggression into both gold and damage.
        Relic("Duelist's Sigil", "D", "Each winning hand pays +10g and "
                                      "deals +15 bonus damage.",
              color=(200, 110, 90), chip_per_win=10, damage_bonus=15),
        # Counter to Whispering Auditor / Pawnshop Tyrant (fee + push-loses or fee + 6:5).
        Relic("Auditor's Quill", "q", "Heal 12 HP on win; refund 20% of losing bets.",
              color=(160, 200, 200), win_heal=12, bet_refund_pct=0.20),
        # Counter to Veiled Magician / Plague Doctor (no-peek enemies that punish busts).
        Relic("Bone-Hand Charm", "h", "When you bust, refund 75% of that bet.",
              color=(220, 210, 180), bust_refund_pct=0.75),
        # Counter to Greedy Notary (6:5 + push-loses + H17). Big BJ swing.
        Relic("Notary's Crown", "N", "Blackjack pays 2:1, and pushes count as wins.",
              color=(220, 180, 100), bj_pays_2_1=True, push_wins=True),

        # ---- Tier 3 themed: heavyweight, run-defining picks ----
        # Counter to Twin Croupiers / Hollow Sovereign / Carrion Auctioneer (heavy fees).
        Relic("Croesus' Purse", "C", "Each winning hand pays +40 gold.",
              color=GOLD, chip_per_win=40),
        # Counter to Warden of Spades / Black Deck Marshal (everything stripped).
        Relic("Crown of Ten Kings", "K", "Surrender refunds full bet, insurance pays 3:1, "
                                          "and pushes count as wins.",
              color=GOLD, free_surrender=True, insurance_pays_3_1=True, push_wins=True),
        # Counter to Lich Banker / Last Light Oracle (H17 + push-loses + 6:5 / no-peek).
        Relic("Soulforged Fang", "S", "Heal 20 HP on win and deal +25 bonus damage.",
              color=(200, 60, 60), win_heal=20, damage_bonus=25),
        # Counter to Obsidian Marquis / Gilded Inquisitor (6:5 + no-double + tool-stripped).
        Relic("Sovereign's Chalice", "Y", "Blackjack pays 2:1, and 5-card Charlie wins.",
              color=(230, 200, 110), bj_pays_2_1=True, five_card_charlie=True),
        # All-purpose endgame pick — pure profit on every win, very strong vs final boss.
        Relic("Dealer's Bane", "Z", "Deal +50 bonus damage on any round you win, "
                                    "and each winning hand pays +20 gold.",
              color=(180, 40, 40), damage_bonus=50, chip_per_win=20),
        # Late-game economy savior — stacks with Pawnbroker + Merchant for near-full refunds.
        Relic("Sepulcher Key", "E", "Refund 30% of losing bets; refund 50% when you bust.",
              color=(140, 130, 170), bet_refund_pct=0.30, bust_refund_pct=0.50),

        # ---- LUCK relics (new): bias your draws toward 21. Stack additively. ----
        Relic("Rabbit's Foot", "*", "+15 Luck. Cards more often land near 21.",
              color=(220, 230, 200), luck_bonus=15),
        Relic("Four-Leaf Clover", "%c", "+25 Luck. The shoe favors you.",
              color=(120, 200, 120), luck_bonus=25),
        Relic("Dice of the Damned", "d", "+40 Luck — but only the bold roll twice.",
              color=(180, 60, 90), luck_bonus=40),
        Relic("Coin of the Fates", "F", "+10 Luck and pushes count as wins.",
              color=GOLD, luck_bonus=10, push_wins=True),
    ]


# =============================================================================
# RUN STATE (meta-progression)
# =============================================================================

@dataclass
class RunState:
    gold: int = 200                  # bankroll, also used for bets
    floor: int = 0                   # 0-indexed
    enemies: list[Enemy] = field(default_factory=list)
    enemy_hp: int = 0                # current enemy HP
    enemy_hp_max: int = 0            # current enemy HP cap (scaled per player count)
    player_hp: int = 100
    player_max_hp: int = 100
    relics: list[Relic] = field(default_factory=list)
    log: list[str] = field(default_factory=list)
    # Player's "luck" stat — 0-100. Affects card draws: with luck/100 chance
    # per draw, the shoe peeks at the next few cards and picks the one that
    # brings the player closest to 21 without busting. Modified by enemies
    # (negative pressure) and certain relics.
    luck: int = 0
    # The last bet the host (seat 0) committed at deal time. Used to seed
    # the next round's bet so the player doesn't have to re-set it every
    # hand. None until the first deal of the run.
    last_bet: Optional[int] = None

    def current_enemy(self) -> Optional[Enemy]:
        if 0 <= self.floor < len(self.enemies):
            return self.enemies[self.floor]
        return None

    def push_log(self, msg: str):
        self.log.append(msg)
        if len(self.log) > 6:
            self.log.pop(0)

    # Aggregated relic effects - cleaner than checking each relic at every callsite
    def has(self, attr: str) -> bool:
        return any(getattr(r, attr, False) for r in self.relics)

    def relic_sum(self, attr: str) -> float:
        return sum(getattr(r, attr, 0) for r in self.relics)


# =============================================================================
# GAME STATE MACHINE
# =============================================================================

class Phase(Enum):
    BETTING = auto()
    DEALING = auto()
    INSURANCE_OFFER = auto()
    PLAYER_TURN = auto()
    DEALER_TURN = auto()
    SETTLE = auto()
    ROUND_OVER = auto()


@dataclass
class Seat:
    """One player's state at the table. Single-player has one seat; LAN co-op has two."""
    name: str = "Player"
    hands: list[Hand] = field(default_factory=list)
    active_idx: int = 0
    bet_amount: int = 25
    ready: bool = False        # has placed bet and clicked Deal
    finished: bool = False     # all hands resolved, awaiting other seats / dealer
    is_spectating: bool = False  # this round only — bet_amount==0 at deal time

    def active(self) -> Optional[Hand]:
        if 0 <= self.active_idx < len(self.hands):
            return self.hands[self.active_idx]
        return None

    def all_done(self) -> bool:
        # Spectators are "done" the moment the round starts.
        if self.is_spectating:
            return True
        return all(h.status != HandStatus.PLAYING for h in self.hands) if self.hands else False


class Game:
    """One round of blackjack against the current enemy."""

    def __init__(self, run: RunState, num_seats: int = 1, seat_names: Optional[list[str]] = None):
        self.run = run
        self.enemy = run.current_enemy()
        self.shoe = Shoe(num_decks=6)
        names = seat_names or [f"Player {i+1}" for i in range(num_seats)]
        self.seats: list[Seat] = [Seat(name=names[i]) for i in range(num_seats)]
        self.dealer: Hand = Hand()
        self.active_seat_idx: int = 0
        self.phase = Phase.BETTING
        self.last_results: list[str] = []
        self.dealer_peeked_blackjack = False
        # Seats that have answered the insurance offer this round (spectators excluded).
        self._insurance_answered: set[int] = set()
        # Game-event queue. Action methods append dicts here; the App drains
        # them every frame to spawn animations and play sounds. The same
        # queue is mirrored over the wire so clients can animate too.
        # Each event has a monotonic 'id'.
        self.events: list[dict] = []
        self._next_event_id: int = 1
        # Seed initial bets
        for s in self.seats:
            s.bet_amount = 25

    # ---- event emission ----
    def _emit(self, **fields) -> dict:
        """Append a game event with an auto-assigned id. Returns the event."""
        ev = dict(fields)
        ev['id'] = self._next_event_id
        self._next_event_id += 1
        self.events.append(ev)
        # Cap the queue so a long run doesn't accumulate forever. Recent ~64
        # is plenty for any client to catch up; older ones are discarded.
        if len(self.events) > 96:
            self.events = self.events[-64:]
        return ev

    def _flush_shuffle(self):
        """Emit a shuffle event if the shoe just reshuffled. Called after each draw."""
        if self.shoe.just_reshuffled:
            self.shoe.just_reshuffled = False
            self._emit(type='shuffle')

    def _deal_to_seat(self, seat_idx: int, hand_idx: int, face_up: bool = True) -> Card:
        """Draw to a specific seat hand and emit a deal event."""
        # Player draw: net_luck = player_luck - dealer_luck. Dealer luck
        # actively *opposes* the player on player draws. Player luck is
        # the run's base luck plus any luck_bonus from relics.
        hand = self.seats[seat_idx].hands[hand_idx]
        cur_total = hand.best_total() if hand.cards else 0
        player_luck = int(getattr(self.run, 'luck', 0)) + int(self.run.relic_sum('luck_bonus'))
        net = player_luck - int(getattr(self.enemy, 'luck', 0))
        c = self.shoe.draw_lucky(face_up=face_up,
                                  current_total=cur_total,
                                  net_luck=net)
        self._flush_shuffle()
        self.seats[seat_idx].hands[hand_idx].add(c)
        # Record the index this card landed at — animations need it to know
        # the destination slot, since later events may add more cards before
        # this one is drained on a slow client.
        card_idx = len(self.seats[seat_idx].hands[hand_idx].cards) - 1
        self._emit(type='deal',
                   target='seat', seat_idx=seat_idx, hand_idx=hand_idx,
                   card_idx=card_idx,
                   card={'r': c.rank, 's': c.suit, 'u': c.face_up})
        return c

    def _deal_to_dealer(self, face_up: bool = True) -> Card:
        # Dealer draw: dealer luck applies straight; the player's own luck
        # doesn't help here (the dealer rolls their own karma).
        cur_total = self.dealer.best_total() if self.dealer.cards else 0
        net = int(getattr(self.enemy, 'luck', 0))
        c = self.shoe.draw_lucky(face_up=face_up,
                                  current_total=cur_total,
                                  net_luck=net)
        self._flush_shuffle()
        self.dealer.add(c)
        card_idx = len(self.dealer.cards) - 1
        self._emit(type='deal', target='dealer',
                   card_idx=card_idx,
                   card={'r': c.rank, 's': c.suit, 'u': c.face_up})
        return c

    # ---- backward-compat properties for single-player UI code ----
    @property
    def player_hands(self) -> list[Hand]:
        return self.seats[0].hands if self.seats else []

    @player_hands.setter
    def player_hands(self, value):
        if self.seats:
            self.seats[0].hands = value

    @property
    def active_hand_idx(self) -> int:
        return self.seats[self.active_seat_idx].active_idx if self.seats else 0

    @active_hand_idx.setter
    def active_hand_idx(self, value):
        if self.seats:
            self.seats[self.active_seat_idx].active_idx = value

    @property
    def bet_amount(self) -> int:
        return self.seats[0].bet_amount if self.seats else 25

    @bet_amount.setter
    def bet_amount(self, value):
        if self.seats:
            self.seats[0].bet_amount = value

    def active_seat(self) -> Optional[Seat]:
        if 0 <= self.active_seat_idx < len(self.seats):
            return self.seats[self.active_seat_idx]
        return None

    # ---- bet ----
    def other_seats_bet(self, seat_idx: int) -> int:
        """Sum of bet_amount for every seat OTHER than seat_idx.
        Used so each seat's bet controls operate against the gold remaining
        after the other seats have committed their bets."""
        return sum(s.bet_amount for i, s in enumerate(self.seats) if i != seat_idx)

    def gold_available_for(self, seat_idx: int) -> int:
        """Max amount this seat could possibly bet given other seats' current bets.
        Never negative."""
        return max(0, self.run.gold - self.other_seats_bet(seat_idx))

    def min_bet_for(self, seat_idx: int) -> int:
        """The minimum legal bet for this seat. Normally MIN_BET, but if there
        isn't enough gold left after the other seats' bets to cover MIN_BET,
        this seat must spectate (bet 0)."""
        return MIN_BET if self.gold_available_for(seat_idx) >= MIN_BET else 0

    def adjust_bet(self, delta: int, seat_idx: int = 0):
        s = self.seats[seat_idx]
        avail = self.gold_available_for(seat_idx)
        lo = self.min_bet_for(seat_idx)
        # Cap at MAX_BET as well so +10 spam can't sail past the table limit.
        hi = min(MAX_BET, avail) if avail >= MIN_BET else 0
        s.bet_amount = max(lo, min(hi, s.bet_amount + delta))

    def set_bet(self, amount: int, seat_idx: int = 0):
        """Clamp `amount` to the legal range for this seat and assign it."""
        s = self.seats[seat_idx]
        avail = self.gold_available_for(seat_idx)
        lo = self.min_bet_for(seat_idx)
        hi = min(MAX_BET, avail) if avail >= MIN_BET else 0
        s.bet_amount = max(lo, min(hi, amount))

    def can_afford(self, amount: int) -> bool:
        return self.run.gold >= amount

    # ---- dealing ----
    def deal_initial(self):
        """Deal two cards to each seat, then dealer up + hole.
        Seats with bet_amount == 0 sit this round out as spectators.
        For multi-seat games, all seats must have called set_ready() first."""
        # Verify and charge bets per seat (spectators contribute 0).
        total_cost = sum(s.bet_amount for s in self.seats)
        if self.run.gold < total_cost:
            return
        # Need at least one active player at the table; otherwise the round is a no-op.
        active_seats = [s for s in self.seats if s.bet_amount > 0]
        if not active_seats:
            return
        self.run.gold -= total_cost
        # Remember seat 0's bet so the NEXT round can preselect it. We only
        # store the host's seat because that's the only one whose preference
        # carries between rounds in solo play. (Co-op clients seed their own
        # bet from their local UI state.)
        if self.seats and self.seats[0].bet_amount > 0:
            self.run.last_bet = self.seats[0].bet_amount
        # Reset state. Spectators get an empty hand list and is_spectating=True.
        self.dealer = Hand()
        for s in self.seats:
            if s.bet_amount > 0:
                s.hands = [Hand(bet=s.bet_amount)]
                s.is_spectating = False
            else:
                s.hands = []
                s.is_spectating = True
            s.active_idx = 0
            s.finished = s.is_spectating  # spectators are "finished" from the start
        # Deal: one card to each active seat, dealer up, second card to actives, dealer hole
        for seat_idx, s in enumerate(self.seats):
            if not s.is_spectating:
                self._deal_to_seat(seat_idx, 0)
        self._deal_to_dealer(face_up=True)
        for seat_idx, s in enumerate(self.seats):
            if not s.is_spectating:
                self._deal_to_seat(seat_idx, 0)
        self._deal_to_dealer(face_up=False)
        # Start with the first non-spectator seat
        self.active_seat_idx = 0
        while (self.active_seat_idx < len(self.seats)
               and self.seats[self.active_seat_idx].is_spectating):
            self.active_seat_idx += 1
        self.last_results = []
        self._insurance_answered.clear()

        # Insurance offered if dealer up-card is Ace and any seat could afford it
        up = self.dealer.cards[0]
        if (up.rank == 'A'
                and not self.enemy.no_insurance):
            self.phase = Phase.INSURANCE_OFFER
            return

        self._peek_check()

    def _peek_check(self):
        """If dealer has blackjack, reveal immediately. Otherwise mark naturals as STAND
        and either skip ahead to dealer turn or start player turns."""
        up = self.dealer.cards[0]
        dealer_has_bj = (up.rank in ('A', '10', 'J', 'Q', 'K')
                         and self.enemy.dealer_peek
                         and self.dealer.best_total() == 21)
        if dealer_has_bj:
            self.dealer_peeked_blackjack = True
            self.dealer.cards[1].face_up = True
            # Emit a flip event so the UI animates the reveal AND suppresses
            # the dealer-total badge until the flip lands. Without this,
            # display_total would jump straight to "21" the same frame the
            # peek triggers.
            self._emit(type='flip', target='dealer', card_idx=1,
                       card={'r': self.dealer.cards[1].rank,
                             's': self.dealer.cards[1].suit, 'u': True})
            self.phase = Phase.SETTLE
            return
        # Mark any natural blackjacks as STAND so they skip the play loop
        for s in self.seats:
            for h in s.hands:
                if h.is_blackjack():
                    h.status = HandStatus.STAND
            # If all hands of this seat are done (only natural BJ), seat is finished
            if s.all_done():
                s.finished = True
        # Find first seat with an unfinished hand
        self._advance_to_next_active_seat()

    def _advance_to_next_active_seat(self):
        """Move active_seat_idx forward to the next seat that still has hands to play.
        If all seats finished, transition to dealer turn."""
        while (self.active_seat_idx < len(self.seats)
               and self.seats[self.active_seat_idx].all_done()):
            self.seats[self.active_seat_idx].finished = True
            self.active_seat_idx += 1
        if self.active_seat_idx >= len(self.seats):
            self.phase = Phase.DEALER_TURN
        else:
            # Make sure the seat's active_idx points at a PLAYING hand
            s = self.seats[self.active_seat_idx]
            while (s.active_idx < len(s.hands)
                   and s.hands[s.active_idx].status != HandStatus.PLAYING):
                s.active_idx += 1
            self.phase = Phase.PLAYER_TURN

    # ---- insurance ----
    def take_insurance(self, take: bool, seat_idx: int = 0):
        s = self.seats[seat_idx]
        # Spectators don't get an insurance offer; ignore stray clicks.
        if s.is_spectating:
            return
        if take:
            cost = s.bet_amount // 2
            if self.can_afford(cost):
                # Will only apply on initial deal (one hand per seat)
                if s.hands:
                    s.hands[0].insurance_bet = cost
                self.run.gold -= cost
        # Track who has answered. Once every non-spectator has answered, peek.
        self._insurance_answered.add(seat_idx)
        eligible = {i for i, seat in enumerate(self.seats) if not seat.is_spectating}
        if eligible.issubset(self._insurance_answered):
            self._insurance_answered.clear()
            self._peek_check()

    # ---- player actions (current active seat) ----
    def active(self) -> Optional[Hand]:
        s = self.active_seat()
        return s.active() if s else None

    def hit(self, seat_idx: Optional[int] = None):
        idx = self.active_seat_idx if seat_idx is None else seat_idx
        if idx != self.active_seat_idx:
            return  # not your turn
        s = self.seats[idx]
        h = s.active()
        if h is None or h.status != HandStatus.PLAYING:
            return
        # Enemy hit_fee: charge a flat gold cost per hit. Drained from gold,
        # not the bet — so it can take the player below MIN_BET for next round.
        # If gold can't cover the fee, we still allow the hit (gold floors at 0)
        # rather than block play, which would softlock a near-broke player.
        fee = self.enemy.extra.get('hit_fee', 0) if self.enemy else 0
        if fee > 0:
            paid = min(fee, self.run.gold)
            self.run.gold -= paid
        self._deal_to_seat(idx, s.active_idx)
        if h.is_bust():
            h.status = HandStatus.BUST
            # No bust sound here — resolve() emits a per-seat result event
            # at end-of-round which fires the bust cue exactly once.
            self._advance_hand()
        elif h.best_total() == 21:
            h.status = HandStatus.STAND
            self._advance_hand()
        elif self.run.has('five_card_charlie') and len(h.cards) >= 5:
            h.status = HandStatus.STAND
            self._advance_hand()

    def stand(self, seat_idx: Optional[int] = None):
        idx = self.active_seat_idx if seat_idx is None else seat_idx
        if idx != self.active_seat_idx:
            return
        s = self.seats[idx]
        h = s.active()
        if h:
            h.status = HandStatus.STAND
            self._advance_hand()

    def double_down(self, seat_idx: Optional[int] = None):
        idx = self.active_seat_idx if seat_idx is None else seat_idx
        if idx != self.active_seat_idx:
            return
        s = self.seats[idx]
        h = s.active()
        if h is None or not h.can_double() or not self.can_afford(h.bet):
            return
        # Enemy may forbid doubling at this table.
        if self.enemy and self.enemy.extra.get('no_double', False):
            return
        self.run.gold -= h.bet
        h.bet *= 2
        h.has_doubled = True
        self._deal_to_seat(idx, s.active_idx)
        h.status = HandStatus.BUST if h.is_bust() else HandStatus.DOUBLED
        # Resolve emits per-seat result events; no immediate bust cue here.
        self._advance_hand()

    def can_split(self, seat_idx: Optional[int] = None) -> bool:
        idx = self.active_seat_idx if seat_idx is None else seat_idx
        s = self.seats[idx]
        h = s.active()
        if h is None or not h.is_pair():
            return False
        if not self.can_afford(h.bet):
            return False
        if len(s.hands) >= 4:
            return False
        if h.cards[0].rank == 'A' and h.is_split_aces and not self.run.has('extra_split'):
            return False
        return True

    def split(self, seat_idx: Optional[int] = None):
        idx = self.active_seat_idx if seat_idx is None else seat_idx
        if idx != self.active_seat_idx or not self.can_split(idx):
            return
        s = self.seats[idx]
        h = s.active()
        self.run.gold -= h.bet
        c2 = h.cards.pop()
        is_aces = h.cards[0].rank == 'A'
        new_hand = Hand(cards=[c2], bet=h.bet, is_split_hand=True, is_split_aces=is_aces)
        h.is_split_hand = True
        h.is_split_aces = is_aces
        # Insert the new hand BEFORE drawing replacement cards so events can
        # reference its concrete hand_idx. Note: this temporarily means the
        # newly inserted hand has only 1 card; the deal events that follow
        # are what give it its second card on the wire/animation timeline.
        first_idx = s.active_idx
        second_idx = s.active_idx + 1
        s.hands.insert(second_idx, new_hand)
        self._deal_to_seat(idx, first_idx)
        self._deal_to_seat(idx, second_idx)
        if is_aces:
            for hand in (h, new_hand):
                if (hand.cards[1].rank == 'A'
                        and self.run.has('extra_split')
                        and len(s.hands) < 4):
                    pass  # leave PLAYING so player can re-split
                else:
                    hand.status = HandStatus.STAND
            # Skip past any auto-stood
            while (s.active_idx < len(s.hands)
                   and s.hands[s.active_idx].status != HandStatus.PLAYING):
                s.active_idx += 1
            if s.active_idx >= len(s.hands):
                s.finished = True
                self._advance_to_next_active_seat()

    def surrender(self, seat_idx: Optional[int] = None):
        idx = self.active_seat_idx if seat_idx is None else seat_idx
        if idx != self.active_seat_idx:
            return
        s = self.seats[idx]
        h = s.active()
        if h is None or not h.can_surrender() or self.enemy.no_surrender:
            return
        h.status = HandStatus.SURRENDERED
        self._advance_hand()

    def _advance_hand(self):
        """Advance within the active seat, then to next seat if done."""
        s = self.seats[self.active_seat_idx]
        s.active_idx += 1
        while (s.active_idx < len(s.hands)
               and s.hands[s.active_idx].status != HandStatus.PLAYING):
            s.active_idx += 1
        if s.active_idx >= len(s.hands):
            s.finished = True
            self.active_seat_idx += 1
            self._advance_to_next_active_seat()

    # ---- dealer turn ----
    def all_player_hands(self) -> list[Hand]:
        return [h for s in self.seats for h in s.hands]

    def dealer_play_step(self) -> bool:
        """One dealer action per call so the UI can animate. Returns True when done."""
        # Reveal hole card first
        if len(self.dealer.cards) > 1 and not self.dealer.cards[1].face_up:
            self.dealer.cards[1].face_up = True
            self._emit(type='flip', target='dealer', card_idx=1,
                       card={'r': self.dealer.cards[1].rank,
                             's': self.dealer.cards[1].suit, 'u': True})
            return False

        # If every player hand busted/surrendered, dealer doesn't draw
        live = [h for h in self.all_player_hands()
                if h.status not in (HandStatus.BUST, HandStatus.SURRENDERED)]
        if not live:
            return True

        total = self.dealer.best_total()
        soft = self.dealer.is_soft()
        if total < 17 or (total == 17 and soft and self.enemy.hits_soft_17):
            self._deal_to_dealer(face_up=True)
            return False
        return True

    # ---- settlement ----
    def resolve(self) -> int:
        """Compute payouts across all seats. Returns net gold change (positive = won)."""
        net = 0
        self.last_results = []
        dealer_total = self.dealer.best_total()
        dealer_bj = self.dealer.is_blackjack()

        # Resolve insurance side bets per seat (insurance is on the seat's first hand)
        for seat_idx, s in enumerate(self.seats):
            if s.hands and s.hands[0].insurance_bet > 0:
                ibet = s.hands[0].insurance_bet
                seat_label = f"[{s.name}] " if len(self.seats) > 1 else ""
                if dealer_bj:
                    payout = 4 * ibet if self.run.has('insurance_pays_3_1') else 3 * ibet
                    self.run.gold += payout
                    net += payout - ibet
                    self.run.push_log(f"{seat_label}Insurance hit! +{payout - ibet}g")
                else:
                    net -= ibet
                    self.run.push_log(f"{seat_label}Insurance lost (-{ibet}g)")

        # Settle each hand of each seat
        for seat_idx, s in enumerate(self.seats):
            seat_label = f"[{s.name}] " if len(self.seats) > 1 else ""
            for i, h in enumerate(s.hands):
                hand_label = f"H{i+1}: " if len(s.hands) > 1 else ""
                outcome = self._settle_hand(h, dealer_total, dealer_bj)
                net += outcome['net']
                self.last_results.append(seat_label + hand_label + outcome['msg'])

        # Damage to enemy / player based on net
        if net > 0:
            # Relic damage_bonus stacks (sum across all relics), applied once
            # per winning round on top of the gold-net damage.
            bonus = int(self.run.relic_sum('damage_bonus'))
            self.run.enemy_hp -= (net + bonus)
            if self.run.has('win_heal'):
                heal = int(self.run.relic_sum('win_heal'))
                self.run.player_hp = min(self.run.player_max_hp, self.run.player_hp + heal)
        elif net < 0:
            damage = min(self.run.player_hp, max(1, abs(net) // 4))
            self.run.player_hp -= damage

        # Emit dealer_bust event so clients/host can play the bust sound.
        if dealer_total > 21:
            self._emit(type='result', kind='dealer_bust')
        # Per-seat summary event for sound triggering. Detect best outcome
        # across the seat's hands so we play the most exciting cue:
        # blackjack > win > push > lose > bust.
        for seat_idx, s in enumerate(self.seats):
            if not s.hands:
                continue
            had_bj = any(h.is_blackjack() and not dealer_bj for h in s.hands)
            had_win = any(
                h.status not in (HandStatus.BUST, HandStatus.SURRENDERED)
                and not h.is_blackjack()
                and (dealer_total > 21
                     or (h.best_total() <= 21 and h.best_total() > dealer_total)
                     or (self.run.has('five_card_charlie') and len(h.cards) >= 5
                         and not h.is_bust()))
                for h in s.hands)
            had_push = any(
                h.status not in (HandStatus.BUST, HandStatus.SURRENDERED)
                and not h.is_blackjack()
                and h.best_total() == dealer_total and dealer_total <= 21
                for h in s.hands)
            had_bust = any(h.status == HandStatus.BUST for h in s.hands)
            if had_bj:
                kind = 'blackjack'
            elif had_win:
                kind = 'win'
            elif had_push:
                kind = 'push'
            elif had_bust and not had_win:
                kind = 'bust'
            else:
                kind = 'lose'
            self._emit(type='result', kind=kind, seat_idx=seat_idx)

        self.phase = Phase.ROUND_OVER
        return net

    def _settle_hand(self, h: Hand, dealer_total: int, dealer_bj: bool) -> dict:
        """Settle a single hand. Returns {'net': int, 'msg': str}."""
        bj_mult = 2.0 if self.run.has('bj_pays_2_1') else (1.2 if self.enemy.bj_pays_6_5 else 1.5)
        push_wins = self.run.has('push_wins')
        ties_lose = self.enemy.ties_lose
        # chip_per_win adds a flat gold bonus to every winning hand. Stacks
        # additively across relics. Treated as pure profit (added to gold AND net).
        chip_bonus = int(self.run.relic_sum('chip_per_win'))

        # Surrender
        if h.status == HandStatus.SURRENDERED:
            if self.run.has('free_surrender'):
                self.run.gold += h.bet
                return {'net': 0, 'msg': "Surrender (full refund)"}
            refund = h.bet // 2
            self.run.gold += refund
            return {'net': -(h.bet - refund), 'msg': f"Surrender (-{h.bet - refund}g)"}

        # Player bust — bust_refund_pct (Featherfall) stacks with bet_refund_pct (Pawnbroker)
        if h.status == HandStatus.BUST:
            pct = self.run.relic_sum('bet_refund_pct') + self.run.relic_sum('bust_refund_pct')
            refund = int(h.bet * pct)
            if refund:
                self.run.gold += refund
            return {'net': -(h.bet - refund), 'msg': f"Bust (-{h.bet - refund}g)"}

        # Player blackjack
        if h.is_blackjack():
            if dealer_bj:
                if push_wins:
                    win = int(h.bet * bj_mult) + chip_bonus
                    self.run.gold += h.bet + win
                    return {'net': win, 'msg': f"BJ vs BJ — push wins! (+{win}g)"}
                if ties_lose:
                    return {'net': -h.bet, 'msg': "BJ vs BJ — house takes it"}
                self.run.gold += h.bet
                return {'net': 0, 'msg': "BJ push"}
            win = int(h.bet * bj_mult) + chip_bonus
            self.run.gold += h.bet + win
            return {'net': win, 'msg': f"BLACKJACK! (+{win}g)"}

        if dealer_bj:
            # Dealer BJ uses bet_refund_pct only — bust_refund is specifically for player busts.
            refund = int(h.bet * self.run.relic_sum('bet_refund_pct'))
            if refund:
                self.run.gold += refund
            return {'net': -(h.bet - refund), 'msg': f"Dealer BJ (-{h.bet - refund}g)"}

        # 5-card charlie
        if self.run.has('five_card_charlie') and len(h.cards) >= 5 and not h.is_bust():
            win = h.bet + chip_bonus
            self.run.gold += h.bet + win
            return {'net': win, 'msg': f"5-Card Charlie! (+{win}g)"}

        player_total = h.best_total()
        if dealer_total > 21:
            win = h.bet + chip_bonus
            self.run.gold += h.bet + win
            return {'net': win, 'msg': f"Dealer bust (+{win}g)"}
        if player_total > dealer_total:
            win = h.bet + chip_bonus
            self.run.gold += h.bet + win
            return {'net': win, 'msg': f"Win {player_total} v {dealer_total} (+{win}g)"}
        if player_total < dealer_total:
            refund = int(h.bet * self.run.relic_sum('bet_refund_pct'))
            if refund:
                self.run.gold += refund
            return {'net': -(h.bet - refund),
                    'msg': f"Lose {player_total} v {dealer_total} (-{h.bet - refund}g)"}
        # Tie
        if push_wins:
            win = h.bet + chip_bonus
            self.run.gold += h.bet + win
            return {'net': win, 'msg': f"Push→WIN (+{win}g)"}
        if ties_lose:
            return {'net': -h.bet, 'msg': f"Tie loses (-{h.bet}g)"}
        self.run.gold += h.bet
        return {'net': 0, 'msg': f"Push {player_total}"}


# =============================================================================
# UI HELPERS
# =============================================================================

def round_rect(surface, color, rect, radius=8, width=0):
    """Draw a rounded rectangle."""
    pygame.draw.rect(surface, color, rect, width=width, border_radius=radius)


def draw_text(surface, text, font, color, x, y, center=False, right=False):
    """Draw text with simple anchoring."""
    surf = font.render(text, True, color)
    r = surf.get_rect()
    if center:
        r.center = (x, y)
    elif right:
        r.topright = (x, y)
    else:
        r.topleft = (x, y)
    surface.blit(surf, r)
    return r


# ---- Vector suit shapes -----------------------------------------------------
# Drawn from primitives so they don't depend on system fonts having
# the unicode glyphs. Always sharp, always identical across platforms.

def draw_suit(surface, suit: str, cx: int, cy: int, size: int, color):
    """Draw a suit symbol centered at (cx, cy) with the given pixel size."""
    s = size
    if suit == '♠':  # spade: inverted heart with a stem
        # Inverted heart (lobes at bottom-ish, point at top)
        pts = []
        steps = 28
        for i in range(steps + 1):
            t = i / steps * 2 * math.pi
            # Heart parametric, then flip vertically and tighten
            x = 16 * math.sin(t) ** 3
            y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            pts.append((cx + x * s / 32, cy + y * s / 32))
        pygame.draw.polygon(surface, color, pts)
        # Stem (small triangle below)
        stem = [
            (cx - s * 0.18, cy + s * 0.34),
            (cx + s * 0.18, cy + s * 0.34),
            (cx, cy + s * 0.18),
        ]
        pygame.draw.polygon(surface, color, stem)

    elif suit == '♥':  # heart
        pts = []
        steps = 28
        for i in range(steps + 1):
            t = i / steps * 2 * math.pi
            x = 16 * math.sin(t) ** 3
            y = -(13 * math.cos(t) - 5 * math.cos(2 * t)
                  - 2 * math.cos(3 * t) - math.cos(4 * t))
            pts.append((cx + x * s / 32, cy + y * s / 32))
        pygame.draw.polygon(surface, color, pts)

    elif suit == '♦':  # diamond: simple rotated square
        pts = [
            (cx, cy - s * 0.45),
            (cx + s * 0.32, cy),
            (cx, cy + s * 0.45),
            (cx - s * 0.32, cy),
        ]
        pygame.draw.polygon(surface, color, pts)

    elif suit == '♣':  # club: three circles + stem
        r = int(s * 0.18)
        # Top circle
        pygame.draw.circle(surface, color, (int(cx), int(cy - s * 0.18)), r)
        # Bottom-left and bottom-right circles
        pygame.draw.circle(surface, color, (int(cx - s * 0.22), int(cy + s * 0.08)), r)
        pygame.draw.circle(surface, color, (int(cx + s * 0.22), int(cy + s * 0.08)), r)
        # Stem
        stem = [
            (cx - s * 0.16, cy + s * 0.40),
            (cx + s * 0.16, cy + s * 0.40),
            (cx, cy + s * 0.10),
        ]
        pygame.draw.polygon(surface, color, stem)


def suit_surface(suit: str, size: int, color) -> pygame.Surface:
    """Render a suit onto its own transparent surface so it can be rotated/blit."""
    pad = 4
    surf = pygame.Surface((size + pad * 2, size + pad * 2), pygame.SRCALPHA)
    draw_suit(surf, suit, size // 2 + pad, size // 2 + pad, size, color)
    return surf


def draw_card(surface, card: Card, x, y, fonts, highlight=False, dim=False):
    """Render a single playing card at (x, y). Top-left origin.

    If a sprite is available in the SPRITES cache, it's blitted directly;
    otherwise the original procedural rendering is used. The procedural
    path is the de-facto "default skin" — the game ships fully playable
    with no external assets."""
    rect = pygame.Rect(x, y, CARD_W, CARD_H)

    if highlight:
        glow = pygame.Rect(x - 4, y - 4, CARD_W + 8, CARD_H + 8)
        round_rect(surface, GOLD, glow, radius=CARD_RADIUS + 4)

    # ---- sprite path (preferred when available) ----
    sprite = None
    if SPRITES is not None:
        sprite = SPRITES.card_back if not card.face_up else SPRITES.card_face(card)
    if sprite is not None:
        if dim:
            # Dim by overlaying a translucent dark layer on a copy. Keeps
            # the original sprite untouched in the cache.
            sprite = sprite.copy()
            shade = pygame.Surface(sprite.get_size(), pygame.SRCALPHA)
            shade.fill((0, 0, 0, 90))
            sprite.blit(shade, (0, 0))
        surface.blit(sprite, (x, y))
        return rect

    # ---- procedural fallback (the original implementation) ----
    if not card.face_up:
        # Card back: layered diamonds pattern
        round_rect(surface, (50, 30, 70), rect, radius=CARD_RADIUS)
        inner = rect.inflate(-8, -8)
        round_rect(surface, (75, 50, 105), inner, radius=CARD_RADIUS - 2)
        # decorative grid
        for i in range(4):
            for j in range(6):
                cx = inner.x + 8 + i * 18
                cy = inner.y + 8 + j * 18
                pygame.draw.polygon(
                    surface, (110, 80, 140),
                    [(cx, cy + 6), (cx + 6, cy), (cx + 12, cy + 6), (cx + 6, cy + 12)],
                )
        round_rect(surface, GOLD_DIM, rect, radius=CARD_RADIUS, width=2)
        return rect

    # Face card
    bg = PARCHMENT if not dim else (180, 170, 140)
    round_rect(surface, bg, rect, radius=CARD_RADIUS)
    round_rect(surface, (60, 50, 40), rect, radius=CARD_RADIUS, width=2)

    color = (170, 35, 35) if card.is_red else (25, 25, 35)
    # '10' is two chars - use a slightly smaller font so it fits the corner
    rank_font = fonts['card_rank_narrow'] if card.rank == '10' else fonts['card_rank']

    # Top-left rank + suit
    rs = rank_font.render(card.rank, True, color)
    surface.blit(rs, (x + 6, y + 4))
    # Small suit just below the rank
    small_suit = suit_surface(card.suit, 16, color)
    surface.blit(small_suit, small_suit.get_rect(midtop=(x + 6 + rs.get_width() // 2,
                                                          y + 4 + rs.get_height() - 2)))

    # Big center suit
    big = suit_surface(card.suit, 52, color)
    surface.blit(big, big.get_rect(center=(x + CARD_W // 2, y + CARD_H // 2 + 4)))

    # Bottom-right (rotated 180°)
    rs2 = pygame.transform.rotate(rs, 180)
    surface.blit(rs2, (x + CARD_W - 6 - rs2.get_width(),
                       y + CARD_H - 4 - rs2.get_height()))
    small_suit_r = pygame.transform.rotate(small_suit, 180)
    surface.blit(small_suit_r,
                 small_suit_r.get_rect(midbottom=(
                     x + CARD_W - 6 - rs2.get_width() // 2,
                     y + CARD_H - 4 - rs2.get_height() + 2)))
    return rect


def hand_card_xy(x: int, y: int, i: int) -> tuple[int, int]:
    """Return the (x, y) position where the i-th card of a hand drawn at (x, y)
    will land. Single source of truth so animations and rendering agree."""
    overlap = 28
    spacing = CARD_W - overlap
    cx = x + i * spacing
    cy = y + int(math.sin(i * 0.6) * 2)
    return cx, cy


def draw_hand(surface, hand: Hand, x, y, fonts, highlight=False, label="", dim=False,
              hide_total: bool = False, skip_indices: Optional[set] = None,
              hide_total_extra: int = 0):
    """Draw a hand of cards in a fanned-out row.

    skip_indices: card positions to leave blank (e.g. cards currently in flight).
    hide_total_extra: if non-zero, suppress the badge entirely (used while
                     a flying card hasn't landed yet so totals don't pop up
                     before the card visually arrives).
    """
    skip_indices = skip_indices or set()
    overlap = 28
    spacing = CARD_W - overlap
    for i, c in enumerate(hand.cards):
        if i in skip_indices:
            continue
        cx, cy = hand_card_xy(x, y, i)
        draw_card(surface, c, cx, cy, fonts,
                  highlight=highlight and i == len(hand.cards) - 1,
                  dim=dim)
    # Total badge
    total_w = (len(hand.cards) - 1) * spacing + CARD_W if hand.cards else 0
    # Suppress badge while any card in the hand hasn't visually landed.
    if hide_total_extra > 0:
        return
    if hide_total:
        # Only show value of face-up cards
        visible_value = sum(c.base_value() for c in hand.cards if c.face_up)
        # Account for ace as 1 if needed
        if visible_value > 21:
            aces = sum(1 for c in hand.cards if c.face_up and c.rank == 'A')
            while visible_value > 21 and aces > 0:
                visible_value -= 10
                aces -= 1
        badge_text = f"{visible_value}+?" if any(not c.face_up for c in hand.cards) else str(visible_value)
        badge_color = TEXT_DIM
    else:
        badge_text = hand.display_total() if hand.cards else ""
        badge_color = GOLD if highlight else TEXT
        if hand.is_bust():
            badge_color = RED
        elif hand.is_blackjack():
            badge_color = GOLD
    if badge_text:
        bf = fonts['badge']
        bs = bf.render(badge_text, True, badge_color)
        bg_rect = bs.get_rect(center=(x + total_w // 2, y + CARD_H + 18))
        bg_pad = bg_rect.inflate(20, 8)
        round_rect(surface, (10, 10, 20), bg_pad, radius=10)
        round_rect(surface, badge_color, bg_pad, radius=10, width=2)
        surface.blit(bs, bg_rect)
    if label:
        lf = fonts['small']
        ls = lf.render(label, True, TEXT_DIM)
        surface.blit(ls, (x, y - 22))


def draw_deck_pile(surface, x: int, y: int, remaining: int, total: int):
    """Draw a stack of cards visible at top-right of the felt. Stack height
    visibly shrinks as the shoe gets drawn. Returns the (x, y) of the top
    of the pile — animations originate from this point."""
    if total <= 0:
        total = 1
    # Visible stack height: number of layered card-back rectangles. Anchor
    # so a fresh shoe shows ~5 layers and a near-empty shoe shows ~1.
    frac = max(0.05, min(1.0, remaining / total))
    layers = max(1, int(frac * 5 + 0.5))
    # Each layer offset by 2 px diagonally for a stacked look. Layer 0 is bottom.
    top_x = x + (layers - 1) * 2
    top_y = y - (layers - 1) * 2
    for i in range(layers):
        lx = x + i * 2
        ly = y - i * 2
        rect = pygame.Rect(lx, ly, CARD_W, CARD_H)
        round_rect(surface, (50, 30, 70), rect, radius=CARD_RADIUS)
        # Only the top layer gets the decorative pattern; lower layers just
        # show as stacked rectangles to keep this cheap.
        if i == layers - 1:
            inner = rect.inflate(-8, -8)
            round_rect(surface, (75, 50, 105), inner, radius=CARD_RADIUS - 2)
            for ix in range(4):
                for jy in range(6):
                    cx = inner.x + 8 + ix * 18
                    cy = inner.y + 8 + jy * 18
                    pygame.draw.polygon(
                        surface, (110, 80, 140),
                        [(cx, cy + 6), (cx + 6, cy), (cx + 12, cy + 6), (cx + 6, cy + 12)],
                    )
        round_rect(surface, GOLD_DIM, rect, radius=CARD_RADIUS, width=2)
    return top_x, top_y


# =============================================================================
# CHIPS
# =============================================================================
#
# Poker chip rendering. Each chip is drawn as an ellipse (top face) with a
# slim "edge" strip beneath it for a 3D look, plus dashed stripes on the
# top face for the classic casino chip pattern. Stacks are columns of these
# ellipses offset upward.

# Chip denominations and their colors (face, edge-stripe). Ordered LARGEST
# first because we greedy-decompose amounts into denominations.
CHIP_DENOMS: list[tuple[int, tuple, tuple]] = [
    (500, (210, 175, 60),   (240, 210, 110)),  # gold
    (100, (35, 35, 50),     (180, 180, 200)),  # black w/ silver
    (25,  (60, 140, 80),    (140, 220, 160)),  # green
    (10,  (60, 100, 180),   (140, 180, 240)),  # blue
    (5,   (180, 60, 60),    (240, 140, 140)),  # red
    (1,   (230, 230, 220),  (140, 140, 130)),  # white
]

# Visual chip dimensions (top-face ellipse). 3D-ish: width is the major axis.
CHIP_W = 40
CHIP_H = 12        # ellipse minor axis
CHIP_EDGE_H = 6    # height of the side strip beneath each chip


def _decompose_to_chips(amount: int, max_chips: int = 12) -> list[tuple[int, tuple, tuple]]:
    """Break `amount` into a list of chip denoms (largest first), capped at
    `max_chips` total chips so the visual stack never grows obscene. If we'd
    exceed the cap, prefer fewer larger chips even if it means visually
    rounding (we never actually round the amount — this is purely for what
    we DRAW). Each entry is (denom_value, face_color, stripe_color)."""
    chips = []
    remaining = max(0, int(amount))
    for value, face, stripe in CHIP_DENOMS:
        if remaining <= 0 or len(chips) >= max_chips:
            break
        count = remaining // value
        if count <= 0:
            continue
        # Don't blow the cap with tiny denoms.
        slots_left = max_chips - len(chips)
        count = min(count, slots_left)
        for _ in range(count):
            chips.append((value, face, stripe))
        remaining -= count * value
    return chips


def draw_chip(surface, cx: int, cy: int, face: tuple, stripe: tuple,
              radius_x: int = CHIP_W // 2, radius_y: int = CHIP_H // 2,
              denom: Optional[int] = None):
    """Draw a single chip's TOP face (an ellipse) centered at (cx, cy).

    If a chip sprite exists in SPRITES.chips for this denom, blit it
    instead of drawing procedurally. The sprite is the full top+edge
    composite, so the caller skips drawing its own edge strip when sprites
    are in use (handled in draw_chip_stack)."""
    if denom is not None and SPRITES is not None:
        sp = SPRITES.chip_sprite(denom)
        if sp is not None:
            # Sprite is sized (CHIP_W, CHIP_H + CHIP_EDGE_H). Center it on
            # the top-face center (cx, cy): the sprite's top is at
            # cy - CHIP_H/2, so its top-left x is cx - CHIP_W/2.
            surface.blit(sp, (cx - CHIP_W // 2, cy - CHIP_H // 2))
            return
    rect = pygame.Rect(cx - radius_x, cy - radius_y, radius_x * 2, radius_y * 2)
    pygame.draw.ellipse(surface, face, rect)
    pygame.draw.ellipse(surface, (10, 10, 15), rect, 1)
    sw = max(4, radius_x // 3)
    sh = max(2, radius_y - 1)
    pygame.draw.rect(surface, stripe,
                     pygame.Rect(rect.x + 1, cy - sh // 2 + 1, sw, sh - 1))
    pygame.draw.rect(surface, stripe,
                     pygame.Rect(rect.right - 1 - sw, cy - sh // 2 + 1, sw, sh - 1))
    inner = rect.inflate(-radius_x, -radius_y // 2 - 2)
    if inner.width > 2 and inner.height > 2:
        pygame.draw.ellipse(surface, face, inner)
        pygame.draw.ellipse(surface, (10, 10, 15), inner, 1)


def draw_chip_stack(surface, x: int, y: int, amount: int, fonts=None,
                    label: Optional[str] = None,
                    show_value: bool = True,
                    max_chips: int = 12) -> tuple[int, int]:
    """Draw a vertical stack of chips totaling `amount`, anchored at (x, y)
    where (x, y) is the CENTER of the bottommost chip's TOP face.

    Returns the (cx, cy) of the topmost chip's center — useful if a caller
    wants to anchor a value badge above the stack.

    If `amount` is zero, draws a single faint placeholder ring so the seat
    still has a visible chip area. The label is drawn above the stack."""
    if amount <= 0:
        # Placeholder ring — empty chip slot.
        rect = pygame.Rect(x - CHIP_W // 2, y - CHIP_H // 2, CHIP_W, CHIP_H)
        pygame.draw.ellipse(surface, (40, 30, 30), rect, 2)
        if label and fonts:
            ls = fonts['tiny'].render(label, True, TEXT_DIM)
            surface.blit(ls, ls.get_rect(midtop=(x, y - CHIP_H - 16)))
        return x, y

    chips = _decompose_to_chips(amount, max_chips=max_chips)
    if not chips:
        return x, y

    # Each chip occupies a vertical slot of height CHIP_EDGE_H, with the
    # bottom one drawn at y. Chips stack from bottom up. Each chip has an
    # "edge strip" (a rectangle) under its top ellipse to suggest depth.
    top_cx, top_cy = x, y
    for i, (value, face, stripe) in enumerate(chips):
        # Higher-index chips sit higher in the stack
        cy = y - i * CHIP_EDGE_H
        # If a sprite is available for this denom, the sprite already
        # contains its own edge strip. Skip the procedural edge in that case.
        sprite_avail = (SPRITES is not None and SPRITES.chip_sprite(value) is not None)
        if not sprite_avail:
            edge_face = tuple(max(0, c - 60) for c in face[:3])
            edge_rect = pygame.Rect(x - CHIP_W // 2, cy - CHIP_H // 2 + 1,
                                     CHIP_W, CHIP_EDGE_H)
            pygame.draw.rect(surface, edge_face, edge_rect)
            pygame.draw.line(surface, (10, 10, 15),
                             (edge_rect.left, edge_rect.bottom),
                             (edge_rect.right, edge_rect.bottom), 1)
        # Top face (sprite-aware)
        draw_chip(surface, x, cy, face, stripe, denom=value)
        top_cx, top_cy = x, cy

    # Value badge above the top chip
    stack_top = top_cy - CHIP_H // 2
    if show_value and fonts:
        vf = fonts['small']
        vs = vf.render(f"{amount}g", True, GOLD)
        # subtle dark backdrop so the number stays readable on green felt
        bg = vs.get_rect(center=(x, stack_top - 14))
        bg_pad = bg.inflate(10, 4)
        round_rect(surface, (10, 10, 20), bg_pad, radius=6)
        round_rect(surface, GOLD_DIM, bg_pad, radius=6, width=1)
        surface.blit(vs, bg)

    if label and fonts:
        ls = fonts['tiny'].render(label, True, TEXT_DIM)
        # Place label below the bottom chip's edge strip
        surface.blit(ls, ls.get_rect(midtop=(x, y + CHIP_EDGE_H + 4)))

    return top_cx, top_cy


def draw_card_in_flight(surface, anim: 'CardAnim', fonts):
    """Render an in-flight card with optional flip-reveal scaling."""
    t = anim.progress()
    # Ease-out for travel
    et = 1 - (1 - t) * (1 - t)
    cx = int(anim.from_x + (anim.to_x - anim.from_x) * et)
    cy = int(anim.from_y + (anim.to_y - anim.from_y) * et)
    # Slight arc — lift up at midpoint
    arc = -math.sin(et * math.pi) * 24
    cy += int(arc)
    # Flip animation: scale x-axis from full → 0 → full when crossing midpoint.
    # The face shown swaps at t=0.5.
    if anim.show_face_on_arrival and not anim.start_face_up:
        # Flip during the second half of travel
        flip_phase = max(0.0, (t - 0.4) / 0.6)
        if flip_phase >= 1.0:
            scale_x = 1.0
            face_up = True
        elif flip_phase < 0.5:
            scale_x = 1.0 - flip_phase * 2
            face_up = False
        else:
            scale_x = (flip_phase - 0.5) * 2
            face_up = True
    else:
        scale_x = 1.0
        face_up = anim.start_face_up
    # Render the card to a temp surface, then scale x.
    temp_card = Card(rank=anim.card.rank, suit=anim.card.suit, face_up=face_up)
    temp_w = max(2, int(CARD_W * scale_x))
    temp_surf = pygame.Surface((CARD_W, CARD_H), pygame.SRCALPHA)
    draw_card(temp_surf, temp_card, 0, 0, fonts)
    if temp_w != CARD_W:
        temp_surf = pygame.transform.scale(temp_surf, (temp_w, CARD_H))
    # Position so it appears to flip around its vertical center
    surface.blit(temp_surf, (cx + (CARD_W - temp_w) // 2, cy))


@dataclass
class CardAnim:
    """One flying card animation."""
    card: Card
    from_x: int
    from_y: int
    to_x: int
    to_y: int
    duration: float                 # seconds total
    elapsed: float = 0.0
    target_kind: str = ""           # 'seat' or 'dealer' or 'flip'
    target_seat: int = -1
    target_hand: int = -1
    target_card_idx: int = -1       # index within hand.cards that this animation owns
    start_face_up: bool = True      # whether the card starts face-up during flight
    show_face_on_arrival: bool = True  # whether to flip during flight if start face-down

    def progress(self) -> float:
        return min(1.0, self.elapsed / self.duration) if self.duration > 0 else 1.0

    def done(self) -> bool:
        return self.elapsed >= self.duration





@dataclass
class Button:
    rect: pygame.Rect
    text: str
    enabled: bool = True
    hot: bool = False
    accent: tuple = GOLD
    hint: str = ""
    action: str = ""    # if set, this is what's passed to the handler (else text)

    def action_name(self) -> str:
        return self.action if self.action else self.text

    def draw(self, surface, fonts, hovered: bool):
        c_bg = (20, 18, 28) if self.enabled else (30, 28, 36)
        c_edge = self.accent if self.enabled else (60, 55, 65)
        c_text = TEXT if self.enabled else TEXT_DIM
        if hovered and self.enabled:
            c_bg = (40, 32, 50)
        round_rect(surface, c_bg, self.rect, radius=10)
        round_rect(surface, c_edge, self.rect, radius=10, width=2)
        f = fonts['btn']
        ts = f.render(self.text, True, c_text)
        surface.blit(ts, ts.get_rect(center=self.rect.center))
        if self.hint and hovered:
            f2 = fonts['tiny']
            hs = f2.render(self.hint, True, TEXT_DIM)
            surface.blit(hs, (self.rect.x, self.rect.y - 14))

    def hit(self, pos) -> bool:
        return self.enabled and self.rect.collidepoint(pos)


# =============================================================================
# APP / SCENES
# =============================================================================

class Scene(Enum):
    MENU = auto()
    LOBBY_HOST = auto()        # waiting for client to connect
    LOBBY_CLIENT_INPUT = auto()  # entering host IP
    LOBBY_CLIENT_WAIT = auto()  # connecting / waiting for first state
    BATTLE = auto()
    SHOP = auto()
    VICTORY = auto()
    DEFEAT = auto()


class NetRole(Enum):
    SOLO = auto()
    HOST = auto()
    CLIENT = auto()


class App:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Dungeon of Cards")
        # Use SCALED so the logical resolution (1280x800) is preserved no
        # matter what the actual window/screen size is — the renderer
        # letterboxes for us. RESIZABLE lets the user drag the window edges.
        # All coordinate math in this file targets 1280x800 and stays valid
        # regardless of display state because of SCALED.
        self._display_flags = pygame.SCALED | pygame.RESIZABLE
        self._is_fullscreen = False
        self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H), self._display_flags)
        self.clock = pygame.time.Clock()
        self.running = True
        self.fonts = self._load_fonts()
        self.scene = Scene.MENU
        self.run: Optional[RunState] = None
        self.game: Optional[Game] = None
        self.buttons: list[Button] = []
        self.shop_offerings: list[Relic] = []
        self.hover_pos = (0, 0)
        # Animation timers
        self.dealer_step_timer = 0.0
        self.round_over_timer = 0.0
        self.message_flash = ""
        self.message_flash_timer = 0.0
        # Sound + animation system
        # The mixer must be initialized AFTER pygame.init() above, which has
        # already happened, so SoundFX is safe to construct here.
        self.sfx = SoundFX()
        # Kick off background music if the asset was found. Looping forever;
        # the user can toggle mute with the M key.
        self.sfx.play_music()
        # Optional sprite assets. Loaded once at startup; missing files are
        # tolerated and procedural drawing fills in.
        global SPRITES
        SPRITES = SpriteCache()
        self.animations: list[CardAnim] = []
        # Card-deal events arrive from Game.events (host) or from the
        # state snapshot (client). _last_event_id tracks the highest id we've
        # already processed so we don't replay events on every snapshot.
        self._last_event_id: int = 0
        # Run session id. Bumps on every start_run so clients can detect a
        # multiplayer restart and rebase their event tracker.
        self._run_session: int = 0
        self._client_seen_session: int = -1
        # Cached deck pile position (top of stack). Recomputed on each draw
        # so animations spawned mid-frame can use the same coords.
        self._deck_top_xy: tuple[int, int] = (SCREEN_W - 380, 90)
        self._deck_remaining: int = 6 * 52
        self._deck_total: int = 6 * 52
        # Networking
        self.role: NetRole = NetRole.SOLO
        self.host_server: Optional[HostServer] = None
        self.client_conn: Optional[ClientConnection] = None
        self.client_state: Optional[dict] = None     # last state snapshot from host
        self.client_ip_input: str = ""
        self.local_ip: str = ""

    def _toggle_fullscreen(self):
        """Flip between windowed (1280x800, scaled+resizable) and fullscreen.
        Because the display was created with pygame.SCALED, the rendering
        target stays at our logical 1280x800 either way and pygame
        letterboxes / upscales for us. No coordinate code needs to change."""
        try:
            pygame.display.toggle_fullscreen()
            self._is_fullscreen = not self._is_fullscreen
            return
        except pygame.error:
            pass
        # Fallback: hard re-create. If even THIS fails (e.g., headless test
        # with the dummy SDL driver), we just swallow it — better to keep
        # the existing window than to crash the app on a UX nicety.
        target_fs = not self._is_fullscreen
        flags = pygame.SCALED | (pygame.FULLSCREEN if target_fs else pygame.RESIZABLE)
        try:
            self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H), flags)
            self._is_fullscreen = target_fs
        except pygame.error:
            self._flash("Could not toggle fullscreen on this display.")

    def _load_fonts(self) -> dict:
        # Use system fonts; fall back gracefully. We avoid bundling assets
        # so the file is self-contained.
        available = set(pygame.font.get_fonts())

        def first_avail(candidates: list[str]) -> Optional[str]:
            for c in candidates:
                if c in available:
                    return c
            return None

        # Pick a serif for body text (dungeon flavor); fall back to whatever
        serif = first_avail(['georgia', 'palatino', 'timesnewroman', 'liberationserif',
                              'dejavuserif', 'serif'])
        # Pick a font that definitely has unicode suit glyphs for cards
        symbol = first_avail(['dejavusans', 'liberationsans', 'freesans', 'notosans'])

        def f(size, bold=False, font_name=None):
            try:
                if font_name:
                    return pygame.font.SysFont(font_name, size, bold=bold)
            except Exception:
                pass
            return pygame.font.SysFont(None, size, bold=bold)

        return {
            'title': f(64, bold=True, font_name=serif),
            'subtitle': f(28, font_name=serif),
            'h1': f(40, bold=True, font_name=serif),
            'h2': f(28, bold=True, font_name=serif),
            'body': f(20, font_name=serif),
            'small': f(16, font_name=serif),
            'tiny': f(13, font_name=serif),
            'btn': f(20, bold=True, font_name=serif),
            'badge': f(22, bold=True, font_name=serif),
            'card_rank': f(24, bold=True, font_name=symbol),  # symbol font handles all
            'card_rank_narrow': f(20, bold=True, font_name=symbol),  # for '10'
            'card_suit': f(22, bold=True, font_name=symbol),
            'card_suit_big': f(56, font_name=symbol),
            'enemy_name': f(36, bold=True, font_name=serif),
            'enemy_icon': f(60, bold=True, font_name=symbol),
        }

    # ---- run lifecycle ----
    def start_run(self, num_seats: int = 1):
        self.run = RunState()
        self.run.enemies = make_enemy_pool()
        # Bump the session id. On multiplayer restart, the client uses
        # this to detect that the host's Game/event id stream restarted
        # and rebases its tracker so the new run's animations replay.
        self._run_session += 1
        self._last_event_id = 0
        self.animations.clear()
        # Scale starting resources by player count.
        # Solo: 200g, 100 HP. Each extra player adds bankroll and HP buffer.
        if num_seats == 1:
            seat_names = ["Player"]
            self.run.gold = 200
            self.run.player_max_hp = 100
        else:
            seat_names = ["Host"] + [f"Guest {i}" for i in range(1, num_seats)]
            self.run.gold = 200 + 100 * (num_seats - 1)         # 300, 400, 500
            self.run.player_max_hp = 100 + 40 * (num_seats - 1)  # 140, 180, 220
        self.run.player_hp = self.run.player_max_hp
        # Scale enemy HP with player count
        self.run.enemy_hp_max = self._scaled_enemy_hp(self.run.enemies[0], num_seats)
        self.run.enemy_hp = self.run.enemy_hp_max
        if num_seats == 1:
            self.run.push_log("You enter the Dungeon of Cards…")
        else:
            self.run.push_log(f"{num_seats} players enter the Dungeon of Cards…")
        # Lock host server so no late-joiners
        if self.host_server:
            self.host_server.locked = True
        self._enter_battle(num_seats=num_seats, seat_names=seat_names)

    def _scaled_enemy_hp(self, enemy: Enemy, num_seats: int) -> int:
        """Boss HP scales sub-linearly so multiplayer is challenging but not slogging.
        2p ~1.6x, 3p ~2.2x, 4p ~2.8x."""
        return int(enemy.hp * (1 + 0.6 * (num_seats - 1)))

    def _enter_battle(self, num_seats: int = 1, seat_names: Optional[list[str]] = None):
        self.game = Game(self.run, num_seats=num_seats, seat_names=seat_names)
        self.scene = Scene.BATTLE
        # Reset animation + event tracking for the new fight. The Game starts
        # its event ids at 1, so seeding _last_event_id at 0 means we'll pick
        # up everything from this fight onward.
        self.animations.clear()
        self._last_event_id = 0
        # Solo defeat is checked elsewhere (gold < MIN_BET → DEFEAT). For multi-seat
        # games we may have enough for SOMEONE to bet but not everyone — in that
        # case we put extras into spectator mode rather than softlocking.
        if num_seats > 1 and self.run.gold < MIN_BET * num_seats:
            # Not enough for every seat to bet the minimum. Hand the whole bankroll
            # to seat 0 (capped at MAX_BET); the rest spectate this round.
            for i, s in enumerate(self.game.seats):
                if i == 0:
                    s.bet_amount = min(MAX_BET, max(MIN_BET, self.run.gold))
                else:
                    s.bet_amount = 0
                    # Spectators have no decision to make, so they're ready already.
                    # That way the active player's "Ready" click triggers the deal
                    # without waiting on anyone else.
                    s.ready = True
            self.run.push_log(
                "Bankroll too low to seat everyone — one player goes solo this round.")
            return
        # Default seed bet scales with the floor. If the run already has a
        # remembered bet from a previous deal, prefer that — clamped to the
        # current legal range so we never seed an unaffordable amount.
        floor_default = max(10, min(self.run.gold // max(1, num_seats),
                                     25 + self.run.floor * 10))
        for seat_idx, s in enumerate(self.game.seats):
            if seat_idx == 0 and self.run.last_bet is not None:
                # Apply the remembered bet via set_bet so it gets clamped to
                # the seat's legal min/max for the current bankroll.
                self.game.set_bet(self.run.last_bet, seat_idx)
            else:
                s.bet_amount = floor_default
                # Still clamp so it can't exceed gold_available_for / MAX_BET.
                self.game.set_bet(s.bet_amount, seat_idx)

    # ---- networking helpers ----
    def _start_host_lobby(self):
        self.role = NetRole.HOST
        self.local_ip = get_local_ip()
        self.host_server = HostServer(DEFAULT_PORT)
        self.host_server.start()
        if self.host_server.error:
            self._flash(self.host_server.error)
            self.host_server = None
            self.role = NetRole.SOLO
            return
        self.scene = Scene.LOBBY_HOST

    def _start_client_connect(self):
        host_ip = self.client_ip_input.strip() or "127.0.0.1"
        self.role = NetRole.CLIENT
        self.client_conn = ClientConnection(host_ip, DEFAULT_PORT)
        self.client_conn.start()
        if self.client_conn.error:
            self._flash(self.client_conn.error)
            self.client_conn = None
            self.role = NetRole.SOLO
            self.scene = Scene.LOBBY_CLIENT_INPUT
            return
        self.scene = Scene.LOBBY_CLIENT_WAIT

    def _teardown_network(self):
        if self.host_server:
            self.host_server.stop()
            self.host_server = None
        if self.client_conn:
            self.client_conn.stop()
            self.client_conn = None
        self.role = NetRole.SOLO
        self.client_state = None

    def _maybe_deal(self):
        """Host-only: if all seats are ready, deal."""
        if self.role != NetRole.HOST or not self.game:
            # solo: just deal directly
            if self.role == NetRole.SOLO and self.game and self.game.can_afford(self.game.bet_amount):
                self.game.deal_initial()
            return
        if all(s.ready for s in self.game.seats):
            # Reset ready flags for next round
            for s in self.game.seats:
                s.ready = False
            self.game.deal_initial()

    def _client_send_battle_action(self, name: str):
        """Client routes UI clicks to the host. Seat-1 actions only."""
        if not self.client_conn or not self.client_conn.connected:
            return
        # Map UI button names to wire actions; seat_idx is always 1 for client
        action_map = {
            "Bet -10": ("bet_delta", {"delta": -10}),
            "Bet -5":  ("bet_delta", {"delta": -5}),
            "Bet +5":  ("bet_delta", {"delta": 5}),
            "Bet +10": ("bet_delta", {"delta": 10}),
            "Min":     ("bet_set", {"amount": 5}),
            "Max":     ("bet_set", {"amount": 500}),
            "Ready":   ("ready", {}),
            "Deal":    ("ready", {}),
            "Hit":     ("hit", {}),
            "Stand":   ("stand", {}),
            "Double":  ("double", {}),
            "Split":   ("split", {}),
            "Surrender": ("surrender", {}),
            "Take Insurance":    ("insurance", {"take": True}),
            "Decline Insurance": ("insurance", {"take": False}),
            "Continue": ("continue", {}),
        }
        if name in action_map:
            act, args = action_map[name]
            self.client_conn.send_action(act, **args)

    def _host_apply_client_action(self, msg: dict):
        """Host receives an action from a client and applies it to the right seat."""
        if not self.game:
            return
        action = msg.get('action')
        args = msg.get('args', {})
        # Seat index comes from the network layer tagging the message
        seat_idx = msg.get('_seat_idx')
        if seat_idx is None or seat_idx >= len(self.game.seats):
            return
        g = self.game
        if action == "bet_delta":
            g.adjust_bet(args.get('delta', 0), seat_idx)
        elif action == "bet_set":
            g.set_bet(args.get('amount', 25), seat_idx)
        elif action == "ready":
            g.seats[seat_idx].ready = True
            self._maybe_deal()
        elif action == "hit":
            g.hit(seat_idx)
        elif action == "stand":
            g.stand(seat_idx)
        elif action == "double":
            g.double_down(seat_idx)
        elif action == "split":
            if g.can_split(seat_idx):
                g.split(seat_idx)
        elif action == "surrender":
            g.surrender(seat_idx)
        elif action == "insurance":
            g.take_insurance(args.get('take', False), seat_idx)
        elif action == "continue":
            self._after_round()

    def _enter_shop(self):
        self.scene = Scene.SHOP
        # Offer 3 relics the player doesn't already have
        owned = {r.name for r in self.run.relics}
        pool = [r for r in all_relics() if r.name not in owned]
        random.shuffle(pool)
        self.shop_offerings = pool[:3]

    def _flash(self, msg, duration=2.0):
        self.message_flash = msg
        self.message_flash_timer = duration

    # ---- main loop ----
    async def run_app(self):
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0
            self._handle_events()
            self._update(dt)
            self._draw()
            pygame.display.flip()
            if IS_WEB:
                await asyncio.sleep(0)
        pygame.quit()

    def _handle_events(self):
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                self.running = False
            elif ev.type == pygame.MOUSEMOTION:
                self.hover_pos = ev.pos
            elif ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
                self._on_click(ev.pos)
            elif ev.type == pygame.KEYDOWN:
                self._on_key(ev.key, ev.unicode if hasattr(ev, 'unicode') else "")

    def _on_key(self, key, unicode_char: str = ""):
        # Fullscreen toggle works in every scene. F11 is the canonical
        # binding; Alt+Enter is also conventional on Windows so we honor it
        # too (though we can't easily detect modifier keys here without
        # going back to the event — we use pygame.key.get_mods()).
        if key == pygame.K_F11:
            self._toggle_fullscreen()
            return
        if key == pygame.K_RETURN and (pygame.key.get_mods() & pygame.KMOD_ALT):
            self._toggle_fullscreen()
            return
        # Music mute toggle. Skipped while the user is typing in the IP-input
        # field so it doesn't eat their keystrokes.
        if key == pygame.K_m and self.scene != Scene.LOBBY_CLIENT_INPUT:
            self.sfx.toggle_music_mute()
            return
        if self.scene == Scene.MENU and key in (pygame.K_RETURN, pygame.K_SPACE):
            self.role = NetRole.SOLO
            self.start_run()
            return
        if self.scene == Scene.LOBBY_CLIENT_INPUT:
            if key == pygame.K_RETURN:
                if self.client_ip_input.strip():
                    self._start_client_connect()
                return
            if key == pygame.K_BACKSPACE:
                self.client_ip_input = self.client_ip_input[:-1]
                return
            if key == pygame.K_ESCAPE:
                self.scene = Scene.MENU
                return
            # Accept digits, dots, and ASCII letters (for hostnames)
            if unicode_char and (unicode_char.isdigit() or unicode_char == '.'
                                  or unicode_char.isalpha() or unicode_char in '-:'):
                if len(self.client_ip_input) < 32:
                    self.client_ip_input += unicode_char
            return
        if self.scene in (Scene.VICTORY, Scene.DEFEAT) and key in (pygame.K_RETURN, pygame.K_SPACE):
            self._teardown_network()
            self.scene = Scene.MENU
            return
        if self.scene == Scene.BATTLE and self.game:
            # Only the host or a solo player can act on seat 0;
            # client uses _client_send_battle_action
            g = self.game
            if g.phase == Phase.PLAYER_TURN:
                if self.role == NetRole.CLIENT:
                    if key == pygame.K_h: self._client_send_battle_action("Hit")
                    elif key == pygame.K_s: self._client_send_battle_action("Stand")
                    elif key == pygame.K_d: self._client_send_battle_action("Double")
                    elif key == pygame.K_p: self._client_send_battle_action("Split")
                    elif key == pygame.K_r: self._client_send_battle_action("Surrender")
                else:
                    if key == pygame.K_h: g.hit(0)
                    elif key == pygame.K_s: g.stand(0)
                    elif key == pygame.K_d: g.double_down(0)
                    elif key == pygame.K_p:
                        if g.can_split(0): g.split(0)
                    elif key == pygame.K_r: g.surrender(0)
            elif g.phase == Phase.BETTING and key == pygame.K_RETURN:
                if self.role == NetRole.CLIENT:
                    self._client_send_battle_action("Ready")
                elif self.role == NetRole.HOST:
                    g.seats[0].ready = True
                    self._maybe_deal()
                else:
                    g.deal_initial()

    # ---- click routing ----
    def _on_click(self, pos):
        for b in self.buttons:
            if b.hit(pos):
                # A subtle click for any button press. Specific actions like
                # win/blackjack play their own louder cues elsewhere.
                self.sfx.play('button')
                self._button_action(b.action_name())
                return

    def _button_action(self, name):
        # MENU
        if name == "Begin Run":
            self.role = NetRole.SOLO
            self.start_run()
            return
        if name == "Host LAN Co-op":
            self._start_host_lobby()
            return
        if name == "Join LAN Co-op":
            self.scene = Scene.LOBBY_CLIENT_INPUT
            self.client_ip_input = ""
            return
        if name == "Quit":
            self.running = False
            return
        # LOBBY
        if name == "Cancel Host":
            self._teardown_network()
            self.scene = Scene.MENU
            return
        if name == "Cancel Join":
            self._teardown_network()
            self.scene = Scene.MENU
            return
        if name == "Connect":
            self._start_client_connect()
            return
        if name == "Begin Co-op Run":
            num_seats = 1 + (self.host_server.connected_count if self.host_server else 0)
            num_seats = min(num_seats, MAX_PLAYERS)
            self.start_run(num_seats=num_seats)
            return
        # VICTORY / DEFEAT
        if name == "Return to Menu":
            self._teardown_network()
            self.scene = Scene.MENU
            return
        if name == "Run It Back":
            # Host-only: start a fresh run with the same lobby. The client
            # follows along automatically once the host's scene transitions
            # back to BATTLE — its scene-tracker picks up the change in the
            # next state snapshot.
            if self.role == NetRole.HOST and self.host_server:
                num_seats = 1 + self.host_server.connected_count
                num_seats = min(num_seats, MAX_PLAYERS)
                # Briefly unlock so connected_count is correct, then start_run
                # re-locks. Existing connections persist; no late-joiners.
                self.start_run(num_seats=num_seats)
            return
        # SHOP
        if name == "Skip Shop":
            self._advance_floor()
            return
        if name.startswith("Buy:"):
            idx = int(name.split(":")[1])
            self._buy_relic(idx)
            return

        # BATTLE - if I'm a client, send the action to the host instead
        if self.role == NetRole.CLIENT:
            self._client_send_battle_action(name)
            return

        g = self.game
        if g is None:
            return
        # Host handles seat 0 actions; seat 1 actions arrive over the network
        seat_idx = 0
        if name == "Bet -10": g.adjust_bet(-10, seat_idx); self.sfx.play('chip')
        elif name == "Bet -5": g.adjust_bet(-5, seat_idx); self.sfx.play('chip')
        elif name == "Bet +5": g.adjust_bet(5, seat_idx); self.sfx.play('chip')
        elif name == "Bet +10": g.adjust_bet(10, seat_idx); self.sfx.play('chip')
        elif name == "Min": g.set_bet(MIN_BET, seat_idx); self.sfx.play('chip')
        elif name == "Max": g.set_bet(MAX_BET, seat_idx); self.sfx.play('chip')
        elif name == "Ready":
            g.seats[seat_idx].ready = True
            self._maybe_deal()
        elif name == "Deal":
            if self.role == NetRole.HOST:
                g.seats[seat_idx].ready = True
                self._maybe_deal()
            elif g.can_afford(g.bet_amount):
                g.deal_initial()
            else:
                self._flash("Not enough gold")
        elif name == "Hit": g.hit(seat_idx)
        elif name == "Stand": g.stand(seat_idx)
        elif name == "Double": g.double_down(seat_idx)
        elif name == "Split":
            if g.can_split(seat_idx):
                g.split(seat_idx)
        elif name == "Surrender": g.surrender(seat_idx)
        elif name == "Take Insurance": g.take_insurance(True, seat_idx)
        elif name == "Decline Insurance": g.take_insurance(False, seat_idx)
        elif name == "Continue":
            self._after_round()

    # ---- post-round flow ----
    def _after_round(self):
        # Check if enemy defeated or player dead
        if self.run.enemy_hp <= 0:
            self.run.push_log(f"Defeated {self.run.current_enemy().name}!")
            # Final floor = victory
            if self.run.floor >= len(self.run.enemies) - 1:
                self.scene = Scene.VICTORY
                self.sfx.play('victory')
                return
            self._enter_shop()
            return
        if self.run.player_hp <= 0 or self.run.gold < MIN_BET:
            self.scene = Scene.DEFEAT
            self.sfx.play('defeat')
            return
        # Otherwise continue the same enemy with the same seat configuration
        prev_seats = len(self.game.seats) if self.game else 1
        prev_names = [s.name for s in self.game.seats] if self.game else None
        self._enter_battle(num_seats=prev_seats, seat_names=prev_names)

    def _advance_floor(self):
        self.run.floor += 1
        if self.run.floor >= len(self.run.enemies):
            self.scene = Scene.VICTORY
            self.sfx.play('victory')
            return
        # Preserve seat count and apply HP scaling
        prev_seats = len(self.game.seats) if self.game else 1
        prev_names = [s.name for s in self.game.seats] if self.game else None
        self.run.enemy_hp_max = self._scaled_enemy_hp(
            self.run.enemies[self.run.floor], prev_seats)
        self.run.enemy_hp = self.run.enemy_hp_max
        self.run.player_hp = min(self.run.player_max_hp, self.run.player_hp + 25)
        self.run.push_log(f"Descend to floor {self.run.floor + 1}: {self.run.current_enemy().name}")
        self.sfx.play('descend')
        self._enter_battle(num_seats=prev_seats, seat_names=prev_names)

    def _buy_relic(self, idx: int):
        if idx >= len(self.shop_offerings):
            return
        relic = self.shop_offerings[idx]
        cost = 50 + self.run.floor * 25
        if self.run.gold < cost:
            self._flash("Not enough gold")
            return
        self.run.gold -= cost
        self.run.relics.append(relic)
        self.run.push_log(f"Acquired: {relic.name}")
        self.sfx.play('relic')
        self._advance_floor()

    # ---- layout helpers (animations + drawing share these) ----------------

    def _battle_felt_rect(self) -> pygame.Rect:
        """Mirror of the felt rect computed in _draw_battle. Single source of
        truth so animations spawned in _update target the same slots
        rendered in _draw_battle."""
        return pygame.Rect(40, 40, SCREEN_W - 360, SCREEN_H - 80)

    def _deck_pile_origin(self) -> tuple[int, int]:
        """Top-of-deck (x, y) on the felt where flying cards launch from."""
        felt = self._battle_felt_rect()
        # Anchored at top-right of felt, offset slightly inward.
        return (felt.right - CARD_W - 30, felt.y + 30)

    def _dealer_origin(self) -> tuple[int, int]:
        """Anchor (x, y) where the dealer hand is drawn — must match _draw_dealer_area."""
        felt = self._battle_felt_rect()
        return (felt.x + 40, felt.y + 60)

    def _seat_hand_origin(self, seat_idx: int, hand_idx: int) -> tuple[int, int]:
        """Anchor (x, y) where the i-th hand of seat S is drawn.

        Mirrors the slot computation in _draw_player_area exactly. The hand
        offset for fan width depends on number of cards currently in hand,
        so callers using this for animation targets pass the predicted
        final card count separately via hand_card_xy."""
        felt = self._battle_felt_rect()
        seats = self.game.seats if self.game else []
        all_hands_seats = [(si, hi) for si, s in enumerate(seats)
                                    for hi in range(len(s.hands))]
        n = max(1, len(all_hands_seats))
        slot_w = (felt.width - 80) // n
        # Find slot index for (seat_idx, hand_idx)
        try:
            slot_i = all_hands_seats.index((seat_idx, hand_idx))
        except ValueError:
            # Hand not yet present in game state — fall back to last slot.
            slot_i = max(0, n - 1)
        slot_x = felt.x + 40 + slot_i * slot_w
        # Match the fanning offset: -max(0, len(h.cards)-1) * 14
        seat = seats[seat_idx] if seat_idx < len(seats) else None
        hand = seat.hands[hand_idx] if seat and hand_idx < len(seat.hands) else None
        n_cards = len(hand.cards) if hand else 1
        hx = slot_x + (slot_w - CARD_W) // 2 - max(0, (n_cards - 1)) * 14
        y = felt.bottom - CARD_H - PLAYER_ROW_BOTTOM_OFFSET
        return (hx, y)

    # ---- event drain (host + client) -------------------------------------

    def _drain_events_host(self, events: list):
        """Apply unseen events from the host's own Game.events queue."""
        if not events:
            return
        for ev in events:
            if ev['id'] <= self._last_event_id:
                continue
            self._spawn_for_event(ev)
            self._last_event_id = ev['id']

    def _drain_events_client(self, events: list):
        """Apply unseen events from a state snapshot's events array.

        Detects a host-side new-run reset via the snapshot's session id:
        if it differs from the last one we saw, the host called start_run
        again (e.g. via Run It Back), so we rebase our event tracker and
        clear stale animations from the previous run.
        """
        # Session check happens regardless of whether this snapshot
        # currently has events queued (the post-start_run BETTING phase
        # has none until deal_initial fires).
        if self.client_state is not None:
            session = self.client_state.get('session')
            if session is not None and session != self._client_seen_session:
                self._client_seen_session = session
                self._last_event_id = 0
                self.animations.clear()
        if not events:
            return
        for ev in events:
            if ev.get('id', 0) <= self._last_event_id:
                continue
            self._spawn_for_event(ev)
            self._last_event_id = ev['id']

    def _spawn_for_event(self, ev: dict):
        """Translate one game event to animation(s) + sound."""
        et = ev.get('type')
        if et == 'deal':
            card_data = ev.get('card', {})
            card = Card(rank=card_data.get('r', 'A'),
                        suit=card_data.get('s', '♠'),
                        face_up=card_data.get('u', True))
            from_xy = self._deck_pile_origin()
            # card_idx was recorded at emission time, so it's reliable even
            # if more cards have been added since the event fired (e.g. slow
            # client catching up across several snapshots).
            card_idx = ev.get('card_idx', 0)
            if ev.get('target') == 'dealer':
                dx, dy = self._dealer_origin()
                tx, ty = hand_card_xy(dx, dy, card_idx)
                anim = CardAnim(
                    card=card,
                    from_x=from_xy[0], from_y=from_xy[1],
                    to_x=tx, to_y=ty,
                    duration=0.45,
                    target_kind='dealer',
                    target_card_idx=card_idx,
                    start_face_up=card.face_up,
                    show_face_on_arrival=card.face_up,
                )
                self.animations.append(anim)
                self.sfx.play('card_deal')
            else:
                seat_idx = ev.get('seat_idx', 0)
                hand_idx = ev.get('hand_idx', 0)
                ox, oy = self._seat_hand_origin(seat_idx, hand_idx)
                tx, ty = hand_card_xy(ox, oy, card_idx)
                anim = CardAnim(
                    card=card,
                    from_x=from_xy[0], from_y=from_xy[1],
                    to_x=tx, to_y=ty,
                    duration=0.40,
                    target_kind='seat',
                    target_seat=seat_idx,
                    target_hand=hand_idx,
                    target_card_idx=card_idx,
                    start_face_up=True,
                    show_face_on_arrival=True,
                )
                self.animations.append(anim)
                self.sfx.play('card_deal')
        elif et == 'flip':
            # Hole-card reveal: small flip animation in place. No travel.
            card_data = ev.get('card', {})
            card = Card(rank=card_data.get('r', 'A'),
                        suit=card_data.get('s', '♠'),
                        face_up=True)
            card_idx = ev.get('card_idx', 1)
            dx, dy = self._dealer_origin()
            tx, ty = hand_card_xy(dx, dy, card_idx)
            anim = CardAnim(
                card=card,
                from_x=tx, from_y=ty,
                to_x=tx, to_y=ty,
                duration=0.35,
                target_kind='flip',
                target_card_idx=card_idx,
                start_face_up=False,
                show_face_on_arrival=True,
            )
            self.animations.append(anim)
            self.sfx.play('card_flip')
        elif et == 'shuffle':
            self.sfx.play('shuffle')
        elif et == 'result':
            kind = ev.get('kind')
            # Per-seat outcome cues. Multiple seats fire multiple events;
            # the mixer can play several at once on different channels.
            if kind == 'blackjack':
                self.sfx.play('blackjack')
            elif kind == 'win':
                self.sfx.play('win')
            elif kind == 'push':
                # Re-use the chip click — soft acknowledgment, not a win.
                self.sfx.play('chip')
            elif kind == 'lose':
                self.sfx.play('lose')
            elif kind == 'bust':
                self.sfx.play('bust')
            elif kind == 'dealer_bust':
                # Already covered by per-seat 'win' if any seat won; only
                # play a separate cue if no seat had a win this round.
                pass

    def _in_flight_skip_for_seat(self, seat_idx: int, hand_idx: int) -> set:
        """Card indices that should NOT be drawn in the static hand because
        they're currently mid-flight."""
        return {a.target_card_idx for a in self.animations
                if a.target_kind == 'seat'
                and a.target_seat == seat_idx
                and a.target_hand == hand_idx}

    def _in_flight_skip_for_dealer(self) -> set:
        """Same, for the dealer hand. Includes both 'dealer' deal animations
        AND 'flip' animations (which redraw the card in place)."""
        return {a.target_card_idx for a in self.animations
                if a.target_kind in ('dealer', 'flip')}

    def _hand_has_inflight(self, seat_idx: int, hand_idx: int) -> bool:
        return any(a.target_kind == 'seat'
                   and a.target_seat == seat_idx
                   and a.target_hand == hand_idx
                   for a in self.animations)

    def _dealer_has_inflight(self) -> bool:
        return any(a.target_kind in ('dealer', 'flip') for a in self.animations)

    # ---- update ----
    def _update(self, dt):
        if self.message_flash_timer > 0:
            self.message_flash_timer -= dt

        # Tick existing animations and clear any that finished. We do this
        # first so events spawned this frame can land at the correct slot
        # (the first card-anim's target_card_idx is reserved while it flies).
        if self.animations:
            for a in self.animations:
                a.elapsed += dt
            # Drop completed animations and play landing sound
            still = []
            for a in self.animations:
                if a.done():
                    if a.target_kind in ('seat', 'dealer'):
                        self.sfx.play('card_land')
                else:
                    still.append(a)
            self.animations = still

        # Networking polling
        if self.role == NetRole.HOST and self.host_server:
            # Drain inbox - apply client actions
            while True:
                try:
                    msg = self.host_server.inbox.get_nowait()
                except queue.Empty:
                    break
                if msg.get('type') == 'action':
                    self._host_apply_client_action(msg)
            # If client just connected and we're still in lobby, show ready state.
            # Actual run start happens when host clicks Begin Co-op Run.
        elif self.role == NetRole.CLIENT and self.client_conn:
            # Drain inbox - update local state from host
            while True:
                try:
                    msg = self.client_conn.inbox.get_nowait()
                except queue.Empty:
                    break
                mtype = msg.get('type')
                if mtype == 'seat_assignment':
                    self.client_conn.seat_idx = msg.get('seat_idx')
                elif mtype == 'state':
                    self.client_state = msg['state']
                    # Move from lobby to battle on first state we get with a game
                    if (self.scene == Scene.LOBBY_CLIENT_WAIT
                            and self.client_state.get('scene') in
                            ('BATTLE', 'SHOP', 'VICTORY', 'DEFEAT')):
                        self.scene = Scene[self.client_state['scene']]
                    elif self.client_state.get('scene') and self.scene != Scene.LOBBY_CLIENT_INPUT:
                        try:
                            target = Scene[self.client_state['scene']]
                            if target != self.scene and self.scene != Scene.LOBBY_CLIENT_WAIT:
                                self.scene = target
                        except KeyError:
                            pass
            # Detect disconnect
            if not self.client_conn.connected and self.scene != Scene.MENU:
                self._flash("Disconnected from host")
                self._teardown_network()
                self.scene = Scene.MENU

        # Drain game-events on host: spawn animations and play sounds for
        # any new events. This must happen before broadcasting state so the
        # snapshot we send reflects the same event id baseline the host UI
        # is operating on.
        if self.role != NetRole.CLIENT and self.game is not None:
            self._drain_events_host(self.game.events)

        # Host: broadcast state once per frame if connected and in a run
        if (self.role == NetRole.HOST and self.host_server
                and self.host_server.connected and self.run is not None):
            try:
                state = serialize_game_state(self)
                self.host_server.send_state(state)
            except Exception:
                pass

        # Drain game-events on client side from the snapshot. Building the
        # proxy game here (instead of just at draw time) lets event spawning
        # see accurate card counts and seat layouts. We DON'T persist the
        # proxy past this method — _draw_client_view rebuilds it from the
        # current snapshot — but during event spawning self.game must point
        # to the proxy so the layout helpers compute correct targets.
        if (self.role == NetRole.CLIENT and self.client_state is not None
                and 'game' in self.client_state):
            saved_run, saved_game = self.run, self.game
            try:
                proxy_run, proxy_game = self._build_proxy_run_and_game(self.client_state)
                self.run = proxy_run
                self.game = proxy_game
                self._drain_events_client(self.client_state['game'].get('events', []))
            finally:
                self.run = saved_run
                self.game = saved_game

        if self.scene != Scene.BATTLE or self.game is None:
            return
        g = self.game

        # Pause the dealer step while animations are playing — the dealer
        # should "pause dramatically" until the previous card has landed.
        if g.phase == Phase.DEALER_TURN:
            if not self.animations:
                self.dealer_step_timer -= dt
                if self.dealer_step_timer <= 0:
                    done = g.dealer_play_step()
                    # Drain the event(s) the step just emitted IMMEDIATELY,
                    # in the same frame. Without this, the hole-card flip sets
                    # dealer.cards[1].face_up = True at the data layer one frame
                    # before the flip animation gets spawned — so for a single
                    # frame, _draw_dealer_area sees `hole_hidden = False` and
                    # `_in_flight_skip_for_dealer()` returns empty, briefly
                    # flashing the dealer's full total before animation begins.
                    if self.role != NetRole.CLIENT:
                        self._drain_events_host(g.events)
                    # Slightly slower than the prior 0.5s to give the
                    # flashy flip a chance to breathe.
                    self.dealer_step_timer = 0.8
                    if done:
                        g.phase = Phase.SETTLE
        elif g.phase == Phase.SETTLE:
            # Don't resolve until all card animations have landed; the
            # win/blackjack/bust sounds should fire AFTER the last card lands.
            if not self.animations:
                g.resolve()
                self.round_over_timer = 0.0

    # ---- draw ----
    def _draw(self):
        self.screen.fill(BG_DARK)
        # Client-side rendering uses the snapshot, not local game state
        if self.role == NetRole.CLIENT and self.scene in (
                Scene.BATTLE, Scene.SHOP, Scene.VICTORY, Scene.DEFEAT):
            self._draw_client_view()
        elif self.scene == Scene.MENU:
            self._draw_menu()
        elif self.scene == Scene.LOBBY_HOST:
            self._draw_lobby_host()
        elif self.scene == Scene.LOBBY_CLIENT_INPUT:
            self._draw_lobby_client_input()
        elif self.scene == Scene.LOBBY_CLIENT_WAIT:
            self._draw_lobby_client_wait()
        elif self.scene == Scene.BATTLE:
            self._draw_battle()
        elif self.scene == Scene.SHOP:
            self._draw_shop()
        elif self.scene == Scene.VICTORY:
            self._draw_end(victory=True)
        elif self.scene == Scene.DEFEAT:
            self._draw_end(victory=False)

        if self.message_flash_timer > 0:
            f = self.fonts['h2']
            ts = f.render(self.message_flash, True, GOLD)
            r = ts.get_rect(center=(SCREEN_W // 2, SCREEN_H - 80))
            bg = r.inflate(40, 20)
            round_rect(self.screen, (10, 10, 20), bg, radius=10)
            round_rect(self.screen, GOLD, bg, radius=10, width=2)
            self.screen.blit(ts, r)

    # ---- LOBBY ----
    def _draw_lobby_host(self):
        self.buttons = []
        draw_text(self.screen, "WAITING FOR PLAYERS", self.fonts['title'], GOLD,
                  SCREEN_W // 2, 100, center=True)

        n_connected = self.host_server.connected_count if self.host_server else 0
        n_total = n_connected + 1  # plus host

        sub = (f"{n_total} player{'s' if n_total != 1 else ''} ready. "
               f"Up to {MAX_PLAYERS} total. Begin when ready."
               if n_connected > 0
               else "Tell other players to use Join LAN Co-op")
        draw_text(self.screen, sub, self.fonts['subtitle'], TEXT,
                  SCREEN_W // 2, 170, center=True)

        # Connection details
        info = pygame.Rect(SCREEN_W // 2 - 240, 220, 480, 140)
        round_rect(self.screen, BG_MID, info, radius=14)
        round_rect(self.screen, GOLD_DIM, info, radius=14, width=2)
        draw_text(self.screen, "Your IP address (share with other players):",
                  self.fonts['body'], TEXT_DIM, info.centerx, info.y + 20, center=True)
        draw_text(self.screen, self.local_ip, self.fonts['h1'], GOLD,
                  info.centerx, info.y + 70, center=True)
        draw_text(self.screen, f"Port: {DEFAULT_PORT}",
                  self.fonts['body'], TEXT_DIM, info.centerx, info.y + 110, center=True)

        # Player slots (4 rows)
        slot_y = 380
        slot_w = 480
        slot_x = SCREEN_W // 2 - slot_w // 2
        for i in range(MAX_PLAYERS):
            slot = pygame.Rect(slot_x, slot_y + i * 56, slot_w, 48)
            if i == 0:
                # Host slot - always present
                round_rect(self.screen, (24, 22, 32), slot, radius=10)
                round_rect(self.screen, GOLD, slot, radius=10, width=2)
                draw_text(self.screen, "Host (you)", self.fonts['body'], GOLD,
                          slot.x + 16, slot.y + 14)
                draw_text(self.screen, "● ready", self.fonts['small'], GREEN_ACCENT,
                          slot.right - 16, slot.y + 16, right=True)
            else:
                # Guest slot
                seat_idx = i  # the guest's seat index
                handle = self.host_server.clients.get(seat_idx) if self.host_server else None
                if handle and handle.alive:
                    round_rect(self.screen, (24, 22, 32), slot, radius=10)
                    round_rect(self.screen, GREEN_ACCENT, slot, radius=10, width=2)
                    draw_text(self.screen, f"Guest {seat_idx} — {handle.addr[0]}",
                              self.fonts['body'], TEXT, slot.x + 16, slot.y + 14)
                    draw_text(self.screen, "● connected", self.fonts['small'], GREEN_ACCENT,
                              slot.right - 16, slot.y + 16, right=True)
                else:
                    round_rect(self.screen, (18, 16, 24), slot, radius=10)
                    round_rect(self.screen, (60, 55, 65), slot, radius=10, width=1)
                    draw_text(self.screen, f"Guest {i} — empty",
                              self.fonts['body'], TEXT_DIM, slot.x + 16, slot.y + 14)
                    draw_text(self.screen, "○ waiting…", self.fonts['small'], TEXT_DIM,
                              slot.right - 16, slot.y + 16, right=True)

        # Buttons
        if n_connected >= 1:
            b = Button(pygame.Rect(SCREEN_W // 2 - 130, 660, 260, 50),
                       "Begin Co-op Run", accent=GOLD)
            b.draw(self.screen, self.fonts, b.rect.collidepoint(self.hover_pos))
            self.buttons.append(b)
        cancel = Button(pygame.Rect(SCREEN_W // 2 - 110, 730, 220, 40),
                        "Cancel Host", accent=GOLD_DIM)
        cancel.draw(self.screen, self.fonts, cancel.rect.collidepoint(self.hover_pos))
        self.buttons.append(cancel)

    def _draw_lobby_client_input(self):
        self.buttons = []
        draw_text(self.screen, "JOIN A GAME", self.fonts['title'], GOLD,
                  SCREEN_W // 2, 160, center=True)
        draw_text(self.screen, "Enter the host's IP address:",
                  self.fonts['subtitle'], TEXT, SCREEN_W // 2, 240, center=True)

        # Input box
        box = pygame.Rect(SCREEN_W // 2 - 240, 300, 480, 60)
        round_rect(self.screen, BG_MID, box, radius=10)
        round_rect(self.screen, GOLD, box, radius=10, width=2)
        display = self.client_ip_input + ("|" if (pygame.time.get_ticks() // 500) % 2 == 0 else "")
        draw_text(self.screen, display, self.fonts['h1'], TEXT,
                  box.centerx, box.centery, center=True)

        draw_text(self.screen, "Type the IP, then click Connect. ENTER also works.",
                  self.fonts['tiny'], TEXT_DIM, SCREEN_W // 2, 380, center=True)
        draw_text(self.screen, f"(Default port: {DEFAULT_PORT})",
                  self.fonts['tiny'], TEXT_DIM, SCREEN_W // 2, 400, center=True)

        # Buttons
        connect_btn = Button(pygame.Rect(SCREEN_W // 2 - 230, 470, 220, 50),
                             "Connect", accent=GOLD,
                             enabled=len(self.client_ip_input.strip()) > 0)
        cancel_btn = Button(pygame.Rect(SCREEN_W // 2 + 10, 470, 220, 50),
                            "Cancel Join", accent=GOLD_DIM)
        for b in (connect_btn, cancel_btn):
            b.draw(self.screen, self.fonts, b.rect.collidepoint(self.hover_pos))
            self.buttons.append(b)

    def _draw_lobby_client_wait(self):
        self.buttons = []
        draw_text(self.screen, "CONNECTING…", self.fonts['title'], GOLD,
                  SCREEN_W // 2, 280, center=True)
        if self.client_conn:
            target = f"{self.client_conn.host}:{self.client_conn.port}"
            draw_text(self.screen, target, self.fonts['subtitle'], TEXT_DIM,
                      SCREEN_W // 2, 360, center=True)
            status = "Connected. Waiting for host to begin run…" if self.client_conn.connected else "Trying to reach host…"
            draw_text(self.screen, status, self.fonts['body'], TEXT,
                      SCREEN_W // 2, 420, center=True)
        cancel_btn = Button(pygame.Rect(SCREEN_W // 2 - 110, 540, 220, 44),
                            "Cancel Join", accent=GOLD_DIM)
        cancel_btn.draw(self.screen, self.fonts, cancel_btn.rect.collidepoint(self.hover_pos))
        self.buttons.append(cancel_btn)

    # ---- CLIENT VIEW ----
    # Reconstruct minimal Run/Game-like objects from a state snapshot,
    # then reuse the existing battle drawing code. The client only renders;
    # it never mutates. Actions are sent over the wire instead.

    def _build_proxy_run_and_game(self, state: dict):
        proxy_run = RunState()
        proxy_run.gold = state['run']['gold']
        proxy_run.floor = state['run']['floor']
        proxy_run.enemy_hp = state['run']['enemy_hp']
        proxy_run.enemy_hp_max = state['run'].get('enemy_hp_max', state['run']['enemy_hp'])
        proxy_run.player_hp = state['run']['player_hp']
        proxy_run.player_max_hp = state['run']['player_max_hp']
        proxy_run.log = state['run']['log']
        # Build proxy enemies list - just enough for current_enemy() to work
        e = state.get('enemy')
        if e:
            from dataclasses import replace
            proxy_enemy = Enemy(
                name=e['name'], title=e['title'], hp=e['hp'],
                color=tuple(e['color']), icon=e['icon'],
                description=e['description'],
                # Pull rule flags from state if present; older host builds
                # may omit them, so fall back to dataclass defaults.
                hits_soft_17=e.get('hits_soft_17', True),
                bj_pays_6_5=e.get('bj_pays_6_5', False),
                no_surrender=e.get('no_surrender', False),
                no_insurance=e.get('no_insurance', False),
                ties_lose=e.get('ties_lose', False),
                dealer_peek=e.get('dealer_peek', True),
                extra=dict(e.get('extra', {})),
                luck=e.get('luck', 0),
            )
            # Fill leading slots so floor index matches
            proxy_run.enemies = [proxy_enemy] * (proxy_run.floor + 1)
            # Pad to reported total enemy count
            while len(proxy_run.enemies) < state['run']['enemy_count']:
                proxy_run.enemies.append(proxy_enemy)
        # Reconstruct relics by name
        relic_by_name = {r.name: r for r in all_relics()}
        proxy_run.relics = [relic_by_name[n] for n in state['run']['relics'] if n in relic_by_name]

        proxy_game = None
        if 'game' in state:
            gs = state['game']
            proxy_game = Game(proxy_run, num_seats=len(gs['seats']),
                              seat_names=[s['name'] for s in gs['seats']])
            proxy_game.phase = Phase[gs['phase']]
            proxy_game.active_seat_idx = gs['active_seat_idx']
            proxy_game.last_results = gs['last_results']
            for i, s_data in enumerate(gs['seats']):
                seat = proxy_game.seats[i]
                seat.hands = [_deserialize_hand(hd) for hd in s_data['hands']]
                seat.active_idx = s_data['active_idx']
                seat.bet_amount = s_data['bet_amount']
                seat.ready = s_data['ready']
                seat.finished = s_data['finished']
                seat.is_spectating = s_data.get('is_spectating', False)
            if gs['dealer']:
                proxy_game.dealer = _deserialize_hand(gs['dealer'])
            else:
                proxy_game.dealer = Hand()
            # v2: override the proxy's freshly-built shoe with the host's
            # actual count so the deck pile shrinks appropriately on screen.
            # The proxy doesn't actually deal from this shoe; we just patch
            # the count and total to match the wire snapshot.
            shoe_remaining = gs.get('shoe_remaining')
            shoe_total = gs.get('shoe_total')
            if shoe_remaining is not None and shoe_total is not None:
                # Replace internal cards list with a placeholder of the right
                # length so .remaining (which is len(self.cards)) matches.
                # Card identities don't matter — the shoe is decorative.
                proxy_game.shoe.cards = [Card('A', '♠')] * shoe_remaining
                proxy_game.shoe.total_cards = shoe_total
        return proxy_run, proxy_game

    def _draw_client_view(self):
        if self.client_state is None:
            draw_text(self.screen, "Loading state from host…",
                      self.fonts['h2'], TEXT, SCREEN_W // 2, SCREEN_H // 2, center=True)
            return
        # Temporarily swap in the proxy run/game so existing draw code works
        proxy_run, proxy_game = self._build_proxy_run_and_game(self.client_state)
        saved_run, saved_game = self.run, self.game
        saved_shop = self.shop_offerings
        self.run = proxy_run
        self.game = proxy_game
        # Reconstruct shop offerings if present
        relic_by_name = {r.name: r for r in all_relics()}
        self.shop_offerings = [relic_by_name[n] for n in self.client_state.get('shop', [])
                                if n in relic_by_name]
        try:
            scene = self.client_state.get('scene')
            if scene == 'BATTLE':
                self._draw_battle()
                # Replace any host-only buttons with the client's seat-1 controls
                self._adjust_buttons_for_client_view()
            elif scene == 'SHOP':
                # Client can't buy - just show "waiting for host"
                self._draw_shop_client()
            elif scene == 'VICTORY':
                self._draw_end(victory=True)
            elif scene == 'DEFEAT':
                self._draw_end(victory=False)
        finally:
            self.run = saved_run
            self.game = saved_game
            self.shop_offerings = saved_shop

    def _adjust_buttons_for_client_view(self):
        """The battle drawing uses seat 0's controls; client should drive seat 1.
        Re-render the action bar for seat 1 instead."""
        # We can't easily inspect what was already drawn, but we can rebuild
        # the action area for seat 1. Easiest: re-call _draw_action_bar_for_seat(1)
        # but we don't have one. Instead, modify _draw_action_bar to accept a seat index.
        pass  # handled in _draw_action_bar via self.role detection

    def _draw_shop_client(self):
        """Read-only shop view for the client - host does the buying."""
        self.buttons = []
        draw_text(self.screen, "THE WANDERING MERCHANT", self.fonts['title'], GOLD,
                  SCREEN_W // 2, 80, center=True)
        draw_text(self.screen, "The host is choosing a relic…",
                  self.fonts['subtitle'], TEXT_DIM, SCREEN_W // 2, 140, center=True)
        draw_text(self.screen, f"Gold: {self.run.gold}g  ·  HP: {self.run.player_hp}/{self.run.player_max_hp}",
                  self.fonts['body'], TEXT, SCREEN_W // 2, 180, center=True)

        # Show same offerings without buy buttons
        card_w, card_h = 280, 360
        gap = 30
        total_w = len(self.shop_offerings) * card_w + (max(0, len(self.shop_offerings) - 1)) * gap
        start = (SCREEN_W - total_w) // 2
        for i, r in enumerate(self.shop_offerings):
            rect = pygame.Rect(start + i * (card_w + gap), 240, card_w, card_h)
            round_rect(self.screen, BG_MID, rect, radius=14)
            round_rect(self.screen, r.color, rect, radius=14, width=3)
            icr = 50
            pygame.draw.circle(self.screen, r.color, (rect.centerx, rect.y + 80), icr)
            pygame.draw.circle(self.screen, (0, 0, 0), (rect.centerx, rect.y + 80), icr, 2)
            ic = self.fonts['h1'].render(r.icon, True, (10, 10, 20))
            self.screen.blit(ic, ic.get_rect(center=(rect.centerx, rect.y + 82)))
            draw_text(self.screen, r.name, self.fonts['h2'], TEXT,
                      rect.centerx, rect.y + 160, center=True)
            wrapped = self._wrap_text(r.description, self.fonts['body'], rect.width - 30)
            for j, line in enumerate(wrapped):
                draw_text(self.screen, line, self.fonts['body'], TEXT_DIM,
                          rect.centerx, rect.y + 200 + j * 26, center=True)
            draw_text(self.screen, "(host's choice)", self.fonts['tiny'], TEXT_DIM,
                      rect.centerx, rect.bottom - 30, center=True)

    # ---- MENU ----
    def _draw_menu(self):
        self.screen.fill(BG_DARK)
        # Decorative card silhouettes in background
        for i in range(8):
            angle = -25 + i * 6
            x = 100 + i * 130
            y = 600 + (i % 2) * 30
            surf = pygame.Surface((CARD_W, CARD_H), pygame.SRCALPHA)
            round_rect(surf, (40, 30, 55, 180), surf.get_rect(), radius=CARD_RADIUS)
            rotated = pygame.transform.rotate(surf, angle)
            self.screen.blit(rotated, (x, y))

        draw_text(self.screen, "DUNGEON", self.fonts['title'], GOLD,
                  SCREEN_W // 2, 180, center=True)
        draw_text(self.screen, "of CARDS", self.fonts['title'], PARCHMENT,
                  SCREEN_W // 2, 250, center=True)
        draw_text(self.screen, "A blackjack roguelike",
                  self.fonts['subtitle'], TEXT_DIM,
                  SCREEN_W // 2, 310, center=True)

        # Brief rules
        rules = [
            "Each hand is a battle. Win chips to deal damage.",
            "Lose chips to take damage. Defeat 7 dealer-monsters to escape.",
            "Standard blackjack: Hit · Stand · Double · Split · Surrender · Insurance",
            "Collect relics between floors to bend the rules in your favor.",
        ]
        for i, line in enumerate(rules):
            draw_text(self.screen, line, self.fonts['body'], TEXT,
                      SCREEN_W // 2, 380 + i * 30, center=True)

        self.buttons = []
        b1 = Button(pygame.Rect(SCREEN_W // 2 - 110, 510, 220, 52),
                    "Begin Run", accent=GOLD)
        b2 = Button(pygame.Rect(SCREEN_W // 2 - 110, 572, 220, 44),
                    "Host LAN Co-op" if not IS_WEB else "Web Co-op Soon",
                    accent=GOLD_DIM,
                    enabled=not IS_WEB)
        b3 = Button(pygame.Rect(SCREEN_W // 2 - 110, 624, 220, 44),
                    "Join LAN Co-op" if not IS_WEB else "Use Web Lobby",
                    accent=GOLD_DIM,
                    enabled=not IS_WEB)
        b4 = Button(pygame.Rect(SCREEN_W // 2 - 110, 686, 220, 36),
                    "Quit", accent=GOLD_DIM)
        for b in (b1, b2, b3, b4):
            b.draw(self.screen, self.fonts, b.rect.collidepoint(self.hover_pos))
            self.buttons.append(b)

        draw_text(self.screen, "ENTER to begin · H/S/D/P/R for in-battle actions · F11 fullscreen · M music",
                  self.fonts['tiny'], TEXT_DIM, SCREEN_W // 2, SCREEN_H - 30, center=True)

    # ---- BATTLE ----
    def _draw_battle(self):
        # Felt background panel
        felt = pygame.Rect(40, 40, SCREEN_W - 360, SCREEN_H - 80)
        # If a table.png sprite is present, use it as the felt background
        # (scaled to fit). Otherwise the procedural rounded rectangle.
        used_sprite = False
        if SPRITES is not None and SPRITES.table is not None:
            try:
                bg = pygame.transform.smoothscale(SPRITES.table, (felt.width, felt.height))
                self.screen.blit(bg, (felt.x, felt.y))
                # Clip with rounded edges by overpainting the corners — we
                # draw a thin felt-edge border to mask any aliasing.
                round_rect(self.screen, FELT_EDGE, felt, radius=24, width=3)
                used_sprite = True
            except pygame.error:
                used_sprite = False
        if not used_sprite:
            round_rect(self.screen, BG_FELT, felt, radius=24)
            round_rect(self.screen, FELT_EDGE, felt, radius=24, width=3)

        # Side panel
        side = pygame.Rect(SCREEN_W - 300, 40, 260, SCREEN_H - 80)
        round_rect(self.screen, BG_MID, side, radius=16)
        round_rect(self.screen, GOLD_DIM, side, radius=16, width=2)

        # Deck pile, top-right of felt. Drawn before hands so flying cards
        # appear to leave the pile when they emerge above static art.
        # Use the host's actual shoe when we have one; otherwise fall back
        # to client-cached counts (set by client view path).
        if self.game is not None:
            self._deck_remaining = self.game.shoe.remaining
            self._deck_total = self.game.shoe.total_cards
        deck_x, deck_y = self._deck_pile_origin()
        draw_deck_pile(self.screen, deck_x, deck_y,
                       self._deck_remaining, self._deck_total)
        # Tiny "deck" label below the stack
        draw_text(self.screen, f"Shoe: {self._deck_remaining}",
                  self.fonts['tiny'], TEXT_DIM,
                  deck_x + CARD_W // 2, deck_y + CARD_H + 14, center=True)

        self._draw_side_panel(side)
        self._draw_dealer_area(felt)
        self._draw_player_area(felt)
        self._draw_action_bar(felt)

        # Flying cards overlay — drawn last so they're always on top.
        for anim in self.animations:
            draw_card_in_flight(self.screen, anim, self.fonts)

    def _draw_side_panel(self, side):
        x = side.x + 16
        y = side.y + 16
        e = self.run.current_enemy()

        # Floor label
        draw_text(self.screen, f"FLOOR {self.run.floor + 1}/{len(self.run.enemies)}",
                  self.fonts['small'], TEXT_DIM, x, y)
        y += 22
        # Enemy header: icon centered + name below
        icon_r = 38
        cx, cy = side.centerx, y + icon_r
        pygame.draw.circle(self.screen, e.color, (cx, cy), icon_r)
        pygame.draw.circle(self.screen, (0, 0, 0), (cx, cy), icon_r, 3)
        # Render icon: vector if it's a suit, otherwise a label
        if e.icon in SUITS:
            draw_suit(self.screen, e.icon, cx, cy + 2, 50, (10, 10, 20))
        else:
            # Multi-letter label - use smaller font, sized to fit
            font = self.fonts['h2'] if len(e.icon) <= 4 else self.fonts['body']
            ic = font.render(e.icon, True, (10, 10, 20))
            self.screen.blit(ic, ic.get_rect(center=(cx, cy + 2)))
        y += icon_r * 2 + 8
        # Name and title centered. The side panel is only ~228px of usable
        # width inside the inner padding, and some boss names ("Apprentice
        # Croupier", "Black Deck Marshal", "Last Light Oracle") render wider
        # than that at h2. Pick the largest font that fits the panel width
        # to keep names on one line without overflowing the border.
        max_name_w = side.width - 32  # 16px inner padding on each side
        name_font = self._fit_text(e.name, max_name_w, ['h2', 'body', 'small'])
        draw_text(self.screen, e.name, name_font, TEXT, side.centerx, y, center=True)
        y += name_font.get_height() + 4
        title_font = self._fit_text(e.title, max_name_w, ['tiny'])
        draw_text(self.screen, e.title, title_font, TEXT_DIM,
                  side.centerx, y, center=True)
        y += 22

        # Enemy HP bar — uses scaled cap, not the static enemy.hp
        hp_max = self.run.enemy_hp_max if self.run.enemy_hp_max > 0 else e.hp
        self._draw_bar(x, y, side.width - 32, 16, self.run.enemy_hp,
                       hp_max, RED,
                       label=f"Dealer HP {max(0, self.run.enemy_hp)}/{hp_max}")
        y += 32

        # Rule callout
        draw_text(self.screen, "House Rules", self.fonts['small'], GOLD, x, y)
        y += 22
        wrapped = self._wrap_text(e.description, self.fonts['tiny'], side.width - 32)
        for line in wrapped:
            draw_text(self.screen, line, self.fonts['tiny'], TEXT, x, y)
            y += 16
        y += 10

        # Player HP & gold
        pygame.draw.line(self.screen, GOLD_DIM, (x, y), (side.right - 16, y), 1)
        y += 12
        self._draw_bar(x, y, side.width - 32, 16, self.run.player_hp,
                       self.run.player_max_hp, GREEN_ACCENT,
                       label=f"Your HP {self.run.player_hp}/{self.run.player_max_hp}")
        y += 28
        draw_text(self.screen, f"Gold: {self.run.gold}g",
                  self.fonts['h2'], GOLD, x, y)
        y += 30
        # Luck readout. Show only when nontrivial (player has any luck OR
        # the dealer does) so the side panel stays clean during early floors
        # where luck is 0/0 and irrelevant.
        player_luck = (int(getattr(self.run, 'luck', 0))
                        + int(self.run.relic_sum('luck_bonus')))
        dealer_luck = int(getattr(self.run.current_enemy(), 'luck', 0))
        if player_luck > 0 or dealer_luck > 0:
            net = player_luck - dealer_luck
            net_color = GREEN_ACCENT if net > 0 else (RED if net < 0 else TEXT_DIM)
            draw_text(self.screen, f"Luck: you {player_luck} · house {dealer_luck}",
                      self.fonts['tiny'], TEXT, x, y)
            y += 14
            sign = "+" if net > 0 else ""
            draw_text(self.screen, f"Net {sign}{net}",
                      self.fonts['tiny'], net_color, x, y)
            y += 14
        y += 8

        # Relics
        draw_text(self.screen, "Relics", self.fonts['small'], GOLD, x, y)
        y += 22
        if not self.run.relics:
            draw_text(self.screen, "(none yet)", self.fonts['tiny'], TEXT_DIM, x, y)
            y += 18
        else:
            for r in self.run.relics:
                badge = pygame.Rect(x, y, side.width - 32, 38)
                round_rect(self.screen, (24, 22, 32), badge, radius=8)
                round_rect(self.screen, r.color, badge, radius=8, width=1)
                ic = self.fonts['h2'].render(r.icon, True, r.color)
                self.screen.blit(ic, ic.get_rect(center=(badge.x + 18, badge.centery)))
                draw_text(self.screen, r.name, self.fonts['small'], TEXT,
                          badge.x + 38, badge.y + 4)
                # truncate description if too long
                desc = r.description
                while self.fonts['tiny'].size(desc)[0] > badge.width - 50 and len(desc) > 8:
                    desc = desc[:-2]
                if desc != r.description:
                    desc = desc[:-1] + "…"
                draw_text(self.screen, desc, self.fonts['tiny'], TEXT_DIM,
                          badge.x + 38, badge.y + 22)
                y += 44
                if y > side.bottom - 100:
                    break

        # Log at bottom (cap to fit)
        log_lines = self.run.log[-4:]
        log_y = side.bottom - 14 - len(log_lines) * 16
        for line in log_lines:
            # truncate if too long
            t = "› " + line
            while self.fonts['tiny'].size(t)[0] > side.width - 24 and len(t) > 8:
                t = t[:-2]
            if t != "› " + line:
                t = t[:-1] + "…"
            draw_text(self.screen, t, self.fonts['tiny'], TEXT_DIM, x, log_y)
            log_y += 16

    def _draw_bar(self, x, y, w, h, val, mx, color, label=""):
        bg = pygame.Rect(x, y, w, h)
        round_rect(self.screen, (15, 15, 22), bg, radius=4)
        if mx > 0:
            fill_w = int(w * max(0, val) / mx)
            if fill_w > 0:
                round_rect(self.screen, color, pygame.Rect(x, y, fill_w, h), radius=4)
        round_rect(self.screen, (60, 60, 70), bg, radius=4, width=1)
        if label:
            ls = self.fonts['tiny'].render(label, True, TEXT)
            self.screen.blit(ls, ls.get_rect(center=bg.center))

    def _wrap_text(self, text, font, max_w):
        words = text.split()
        lines, cur = [], ""
        for w in words:
            test = (cur + " " + w).strip()
            if font.size(test)[0] > max_w and cur:
                lines.append(cur)
                cur = w
            else:
                cur = test
        if cur:
            lines.append(cur)
        return lines

    def _fit_text(self, text: str, max_w: int, candidate_keys: list[str]):
        """Pick the first font from candidate_keys whose rendered text fits
        within max_w pixels. Falls back to the smallest candidate if nothing
        fits. Used to keep long boss names from spilling out of the side
        panel without wrapping or truncating."""
        for k in candidate_keys:
            f = self.fonts.get(k)
            if f is None:
                continue
            if f.size(text)[0] <= max_w:
                return f
        # Nothing fit — return the smallest available candidate.
        for k in reversed(candidate_keys):
            if self.fonts.get(k) is not None:
                return self.fonts[k]
        return self.fonts['body']

    def _draw_dealer_area(self, felt):
        x = felt.x + 40
        y = felt.y + 60
        draw_text(self.screen, "DEALER", self.fonts['small'], GOLD_DIM, x, y - 24)
        if self.game.dealer.cards:
            hole_hidden = (len(self.game.dealer.cards) > 1
                           and not self.game.dealer.cards[1].face_up)
            skip = self._in_flight_skip_for_dealer()
            # Suppress total badge while any dealer card is mid-flight, so
            # the value doesn't pop up before the card visually arrives.
            extra_hide = 1 if skip else 0
            draw_hand(self.screen, self.game.dealer, x, y, self.fonts,
                      label="", hide_total=hole_hidden,
                      skip_indices=skip, hide_total_extra=extra_hide)
            if hole_hidden:
                draw_text(self.screen, "(hole hidden)", self.fonts['tiny'], TEXT_DIM,
                          x, y + CARD_H + 44)
        else:
            ph = pygame.Rect(x, y, CARD_W, CARD_H)
            round_rect(self.screen, (20, 40, 30), ph, radius=CARD_RADIUS)
            round_rect(self.screen, FELT_EDGE, ph, radius=CARD_RADIUS, width=2)

        # House bank: a visual chip stack representing the dealer's remaining
        # HP (= chips you need to win away to defeat them). Placed BELOW the
        # dealer card row so that as the dealer accumulates hit cards (the
        # row grows rightward) the chips never get overlapped. Anchor x is
        # under the FIRST card slot, which is fixed regardless of how many
        # cards the dealer has — so the stack stays put as cards are added.
        # If hp is 0 (dying state), hide entirely.
        hp = max(0, self.run.enemy_hp)
        if hp > 0:
            # Chip stacks grow UPWARD from the anchor point, so we anchor at
            # the BOTTOM of the chip area. Account for max stack height
            # (max_chips=10 ~ 60px tall) plus a small gap below the dealer
            # totals/captions. Total badge sits at ~y + CARD_H + 22; the
            # "(hole hidden)" caption (when present) sits at +44. Anchor at
            # +95 leaves comfortable space.
            bank_anchor_y = y + CARD_H + 95
            bank_x = x + CARD_W // 2  # centered under first card slot
            draw_chip_stack(self.screen, bank_x, bank_anchor_y, hp,
                            self.fonts, show_value=False, max_chips=10)
            # "House" caption below the chip anchor (under the bottom chip's
            # edge strip).
            draw_text(self.screen, "House", self.fonts['tiny'], GOLD_DIM,
                      bank_x, bank_anchor_y + CHIP_EDGE_H + 6, center=True)

    def _draw_player_area(self, felt):
        seats = self.game.seats
        # If no seat has any hands, show the betting prompt with chip stacks
        if not any(s.hands for s in seats):
            cx = felt.centerx
            cy = felt.centery + 40
            if len(seats) == 1:
                draw_text(self.screen, "Place your bet, then DEAL.",
                          self.fonts['h2'], TEXT_DIM, cx, cy - 60, center=True)
                # Felt circle that frames the chip stack — looks like the
                # designated "betting spot" on a real blackjack table.
                spot = pygame.Rect(cx - 70, cy + 10, 140, 50)
                pygame.draw.ellipse(self.screen, (22, 44, 32), spot)
                pygame.draw.ellipse(self.screen, GOLD_DIM, spot, 2)
                # Chip stack centered in the spot. Anchor is the bottom chip's
                # center: the chips render upward from there.
                draw_chip_stack(self.screen, cx, cy + 28,
                                seats[0].bet_amount, self.fonts,
                                show_value=True)
            else:
                # Multi-seat betting: show each seat's chip stack on its own
                # betting spot
                draw_text(self.screen, "Both players place bets, then host deals.",
                          self.fonts['h2'], TEXT_DIM, cx, cy - 80, center=True)
                slot_w = 200
                start_x = cx - (slot_w * len(seats)) // 2
                for i, s in enumerate(seats):
                    sx = start_x + i * slot_w + slot_w // 2
                    is_spec = s.bet_amount == 0
                    edge = TEXT_DIM if is_spec else (GOLD if s.ready else GOLD_DIM)
                    # Seat name above
                    draw_text(self.screen, s.name, self.fonts['small'], TEXT,
                              sx, cy - 50, center=True)
                    # Betting spot circle
                    spot = pygame.Rect(sx - 60, cy - 5, 120, 44)
                    pygame.draw.ellipse(self.screen, (22, 44, 32), spot)
                    pygame.draw.ellipse(self.screen, edge, spot, 2)
                    if is_spec:
                        draw_text(self.screen, "—", self.fonts['h2'], TEXT_DIM,
                                  sx, cy + 12, center=True)
                        draw_text(self.screen, "spectating", self.fonts['tiny'],
                                  TEXT_DIM, sx, cy + 50, center=True)
                    else:
                        draw_chip_stack(self.screen, sx, cy + 14,
                                        s.bet_amount, self.fonts,
                                        show_value=True)
                        status = "READY" if s.ready else "betting…"
                        draw_text(self.screen, status, self.fonts['tiny'],
                                  GREEN_ACCENT if s.ready else TEXT_DIM,
                                  sx, cy + 60, center=True)
            return

        y = felt.bottom - CARD_H - PLAYER_ROW_BOTTOM_OFFSET
        # Total hands across all seats so we can lay them out
        all_hands_seats = [(seat_idx, h_idx, s, h)
                           for seat_idx, s in enumerate(seats)
                           for h_idx, h in enumerate(s.hands)]
        n = max(1, len(all_hands_seats))
        slot_w = (felt.width - 80) // n

        for slot_i, (seat_idx, h_idx, s, h) in enumerate(all_hands_seats):
            slot_x = felt.x + 40 + slot_i * slot_w
            hx = slot_x + (slot_w - CARD_W) // 2 - max(0, (len(h.cards) - 1)) * 14
            # Label includes seat name when multi-seat. The bet amount is
            # already visualized below the hand as a chip stack, so the label
            # focuses on identity / status here.
            if len(seats) > 1:
                label = f"{s.name} · H{h_idx+1}"
            elif len(s.hands) > 1:
                label = f"Hand {h_idx+1}" + (" · DOUBLED" if h.has_doubled else "")
            else:
                label = "DOUBLED" if h.has_doubled else ""
            is_active = (seat_idx == self.game.active_seat_idx
                         and h_idx == s.active_idx
                         and self.game.phase == Phase.PLAYER_TURN)
            dim = (h.status in (HandStatus.BUST, HandStatus.SURRENDERED,
                                HandStatus.STAND, HandStatus.DOUBLED)
                   and not is_active)
            skip = self._in_flight_skip_for_seat(seat_idx, h_idx)
            extra_hide = 1 if skip else 0
            draw_hand(self.screen, h, hx, y, self.fonts,
                      highlight=is_active, label=label, dim=dim,
                      skip_indices=skip, hide_total_extra=extra_hide)
            # Chip stack to the LEFT of the hand showing the bet that's on
            # the line for THIS hand. Skip during the brief "in-flight" state
            # right at deal so the chips don't pop in before the cards land.
            if h.bet > 0 and not skip:
                # Card row spans roughly hx .. hx + len(cards)*spacing + CARD_W,
                # so anchor chips just LEFT of the row, vertically centered
                # against the cards.
                stack_cx = hx - 32
                stack_cy = y + CARD_H - 18  # bottom-aligned with cards
                draw_chip_stack(self.screen, stack_cx, stack_cy,
                                h.bet, self.fonts,
                                show_value=False, max_chips=8)
                # Tiny gold caption under the chip stack with the bet value.
                cap = f"{h.bet}g"
                cs = self.fonts['tiny'].render(cap, True, GOLD)
                self.screen.blit(cs, cs.get_rect(midtop=(stack_cx, y + CARD_H + 6)))

    def _draw_action_bar(self, felt):
        self.buttons = []
        bar_y = felt.bottom - 70
        g = self.game

        # Determine which seat this UI is controlling
        if self.role == NetRole.CLIENT and self.client_conn and self.client_conn.seat_idx is not None:
            my_seat_idx = self.client_conn.seat_idx
        else:
            my_seat_idx = 0
        my_seat = g.seats[my_seat_idx] if my_seat_idx < len(g.seats) else None
        is_multi = len(g.seats) > 1

        if g.phase == Phase.BETTING:
            # Bet adjusters + Ready/Deal
            # In multi-seat: button says "Ready"; deals when both ready
            # In solo: button says "Deal"; deals immediately
            deal_label = "Ready" if is_multi else "Deal"
            # Buttons are 90px wide; space dx values 95px apart to leave a
            # 5px gap between adjacent buttons (no overlap). Deal/Ready is
            # 130px wide and gets extra clearance from Max.
            specs = [("Min", -285), ("Bet -10", -190), ("Bet -5", -95),
                     ("Bet +5", 0), ("Bet +10", 95), ("Max", 190), (deal_label, 305)]
            for name, dx in specs:
                w = 90 if name not in ("Deal", "Ready") else 130
                b = Button(pygame.Rect(felt.centerx + dx - w // 2, bar_y, w, 44),
                           name, accent=(GOLD if name in ("Deal", "Ready") else GOLD_DIM))
                if name in ("Deal", "Ready"):
                    if my_seat and my_seat.ready:
                        b.text = "Waiting…"
                        b.enabled = False
                    else:
                        # The bankroll has to cover every seat's bet combined.
                        # Spectators contribute 0 so they don't gate anyone.
                        total_bets = sum(s.bet_amount for s in g.seats)
                        b.enabled = self.run.gold >= total_bets and total_bets > 0
                b.draw(self.screen, self.fonts, b.rect.collidepoint(self.hover_pos))
                self.buttons.append(b)

        elif g.phase == Phase.INSURANCE_OFFER:
            draw_text(self.screen, "Dealer shows ACE — buy insurance?",
                      self.fonts['h2'], GOLD, felt.centerx, bar_y - 30, center=True)
            cost = my_seat.bet_amount // 2 if my_seat else 0
            for i, name in enumerate(["Take Insurance", "Decline Insurance"]):
                b = Button(pygame.Rect(felt.centerx - 220 + i * 220, bar_y, 200, 44),
                           name, accent=GOLD if i == 0 else GOLD_DIM,
                           hint=f"costs {cost}g, pays 2:1" if i == 0 else "")
                b.draw(self.screen, self.fonts, b.rect.collidepoint(self.hover_pos))
                self.buttons.append(b)

        elif g.phase == Phase.PLAYER_TURN:
            # Whose turn is it?
            is_my_turn = (g.active_seat_idx == my_seat_idx)
            if is_my_turn:
                h = g.active()
                specs = [
                    ("Hit", True),
                    ("Stand", True),
                    ("Double", h.can_double() and g.can_afford(h.bet)
                               and not g.enemy.extra.get('no_double', False)),
                    ("Split", g.can_split(my_seat_idx)),
                    ("Surrender", h.can_surrender() and not g.enemy.no_surrender),
                ]
                total_w = len(specs) * 110 + (len(specs) - 1) * 10
                start = felt.centerx - total_w // 2
                for i, (name, enabled) in enumerate(specs):
                    b = Button(pygame.Rect(start + i * 120, bar_y, 110, 44),
                               name, enabled=enabled,
                               accent=GOLD if name in ("Hit", "Stand") else GOLD_DIM)
                    b.draw(self.screen, self.fonts, b.rect.collidepoint(self.hover_pos))
                    self.buttons.append(b)
            else:
                # Other player's turn
                other = g.seats[g.active_seat_idx]
                draw_text(self.screen, f"{other.name} is playing…",
                          self.fonts['h2'], TEXT_DIM, felt.centerx, bar_y + 16, center=True)

        elif g.phase == Phase.DEALER_TURN:
            draw_text(self.screen, "Dealer plays…", self.fonts['h2'], TEXT_DIM,
                      felt.centerx, bar_y + 16, center=True)

        elif g.phase == Phase.ROUND_OVER:
            # Show outcome panel - position it in the middle empty space between
            # dealer (top of felt) and player hands (bottom of felt)
            n_results = len(g.last_results)
            panel_h = max(70, 30 + n_results * 24)
            mid_y = (felt.y + 220 + (bar_y - 160)) // 2 - panel_h // 2
            panel = pygame.Rect(felt.centerx - 280, mid_y, 560, panel_h)
            round_rect(self.screen, (10, 10, 20), panel, radius=12)
            round_rect(self.screen, GOLD, panel, radius=12, width=2)
            for i, msg in enumerate(g.last_results[:4]):
                is_win = "+" in msg or "BLACKJACK" in msg or "WIN" in msg
                is_loss = ("-" in msg and "+" not in msg) or "Bust" in msg or "Lose" in msg
                color = GOLD if is_win else (RED if is_loss else TEXT)
                draw_text(self.screen, msg, self.fonts['body'], color,
                          panel.centerx, panel.y + 14 + i * 22, center=True)
            b = Button(pygame.Rect(felt.centerx - 80, bar_y, 160, 44),
                       "Continue", accent=GOLD)
            b.draw(self.screen, self.fonts, b.rect.collidepoint(self.hover_pos))
            self.buttons.append(b)

    # ---- SHOP ----
    def _draw_shop(self):
        self.buttons = []
        draw_text(self.screen, "THE WANDERING MERCHANT", self.fonts['title'], GOLD,
                  SCREEN_W // 2, 80, center=True)
        draw_text(self.screen, "Choose a relic, or descend with what you have.",
                  self.fonts['subtitle'], TEXT_DIM, SCREEN_W // 2, 140, center=True)
        draw_text(self.screen, f"Gold: {self.run.gold}g  ·  HP: {self.run.player_hp}/{self.run.player_max_hp}",
                  self.fonts['body'], TEXT, SCREEN_W // 2, 180, center=True)

        cost = 50 + self.run.floor * 25
        card_w, card_h = 280, 360
        gap = 30
        total_w = len(self.shop_offerings) * card_w + (len(self.shop_offerings) - 1) * gap
        start = (SCREEN_W - total_w) // 2
        for i, r in enumerate(self.shop_offerings):
            rect = pygame.Rect(start + i * (card_w + gap), 240, card_w, card_h)
            round_rect(self.screen, BG_MID, rect, radius=14)
            round_rect(self.screen, r.color, rect, radius=14, width=3)
            # Icon circle
            icr = 50
            pygame.draw.circle(self.screen, r.color, (rect.centerx, rect.y + 80), icr)
            pygame.draw.circle(self.screen, (0, 0, 0), (rect.centerx, rect.y + 80), icr, 2)
            ic = self.fonts['enemy_icon'].render(r.icon, True, (10, 10, 20))
            self.screen.blit(ic, ic.get_rect(center=(rect.centerx, rect.y + 82)))
            draw_text(self.screen, r.name, self.fonts['h2'], TEXT,
                      rect.centerx, rect.y + 160, center=True)
            wrapped = self._wrap_text(r.description, self.fonts['body'], rect.width - 30)
            for j, line in enumerate(wrapped):
                draw_text(self.screen, line, self.fonts['body'], TEXT_DIM,
                          rect.centerx, rect.y + 200 + j * 26, center=True)
            # Buy button - display shows price, action is the index
            bb = Button(pygame.Rect(rect.x + 40, rect.bottom - 60, card_w - 80, 44),
                        f"Buy ({cost}g)",
                        enabled=self.run.gold >= cost,
                        accent=GOLD,
                        action=f"Buy:{i}")
            bb.draw(self.screen, self.fonts, bb.rect.collidepoint(self.hover_pos))
            self.buttons.append(bb)

        skip = Button(pygame.Rect(SCREEN_W // 2 - 110, 660, 220, 50),
                      "Skip Shop", accent=GOLD_DIM)
        skip.draw(self.screen, self.fonts, skip.rect.collidepoint(self.hover_pos))
        self.buttons.append(skip)

    # ---- VICTORY / DEFEAT ----
    def _draw_end(self, victory: bool):
        self.buttons = []
        title = "YOU ESCAPED THE DUNGEON" if victory else "DEFEATED"
        sub = ("With pockets full of gold and a legend behind you."
               if victory else "The dealer pockets your last chip.")
        color = GOLD if victory else RED
        draw_text(self.screen, title, self.fonts['title'], color,
                  SCREEN_W // 2, 220, center=True)
        draw_text(self.screen, sub, self.fonts['subtitle'], TEXT,
                  SCREEN_W // 2, 290, center=True)
        if self.run:
            draw_text(self.screen, f"Final gold: {self.run.gold}",
                      self.fonts['h2'], TEXT, SCREEN_W // 2, 360, center=True)
            draw_text(self.screen, f"Floors cleared: {self.run.floor + (1 if victory else 0)}/{len(self.run.enemies)}",
                      self.fonts['h2'], TEXT, SCREEN_W // 2, 400, center=True)
            if self.run.relics:
                draw_text(self.screen, "Relics: " + ", ".join(r.name for r in self.run.relics),
                          self.fonts['body'], TEXT_DIM, SCREEN_W // 2, 440, center=True)

        # Multiplayer: offer "Run It Back" so the lobby doesn't have to
        # disband to start over. Solo runs just go back to the menu.
        # Host can trigger; client sees it but it's gated until the host
        # decides — clients show a waiting state instead.
        in_multiplayer = (
            (self.role == NetRole.HOST and self.host_server
             and self.host_server.connected)
            or (self.role == NetRole.CLIENT and self.client_conn
                and self.client_conn.connected)
        )

        if in_multiplayer:
            # Two side-by-side buttons. Run It Back is the prominent one.
            run_back = Button(
                pygame.Rect(SCREEN_W // 2 - 260, 540, 240, 50),
                "Run It Back", accent=GOLD,
                hint=("starts a new run with the same lobby"
                      if self.role == NetRole.HOST
                      else "waiting for host to choose"))
            if self.role == NetRole.CLIENT:
                # Client can't initiate the restart — the host owns the run
                # state. Show the button as a passive indicator.
                run_back.text = "Waiting for host…"
                run_back.enabled = False
            run_back.draw(self.screen, self.fonts,
                          run_back.rect.collidepoint(self.hover_pos))
            self.buttons.append(run_back)
            menu_btn = Button(
                pygame.Rect(SCREEN_W // 2 + 20, 540, 240, 50),
                "Return to Menu", accent=GOLD_DIM)
            menu_btn.draw(self.screen, self.fonts,
                          menu_btn.rect.collidepoint(self.hover_pos))
            self.buttons.append(menu_btn)
        else:
            b = Button(pygame.Rect(SCREEN_W // 2 - 120, 540, 240, 50),
                       "Return to Menu", accent=GOLD)
            b.draw(self.screen, self.fonts, b.rect.collidepoint(self.hover_pos))
            self.buttons.append(b)


# =============================================================================
# NETWORKING (LAN co-op)
# =============================================================================
#
# Architecture:
#   - Host runs the authoritative Game + RunState. Listens on TCP.
#   - Client connects, sends ACTION messages, receives STATE snapshots.
#   - Wire format: newline-delimited JSON over TCP. UTF-8.
#
# Co-op model:
#   Both players share gold, HP, relics, floor progression.
#   Each player has their own seat at the table with their own hand(s).
#   Both hands resolve against the same dealer in the same round.
#
# Limitations (intentional, for scope):
#   - LAN only. No NAT traversal, no encryption.
#   - 2 players exactly.
#   - Host is also a player. If host disconnects, the run ends for the client.

import socket
import threading
import json
import queue

DEFAULT_PORT = 50007
# v2 adds the game-events array for animation/sound replay on clients.
# Older v1 hosts will simply omit the 'events' field — the client tolerates
# missing events and just skips animations.
# v2 also (later) gained an `enemy.luck` field for dealer-luck biasing.
# Older v2 hosts won't include it; the client falls back to luck=0.
PROTO_VERSION = 2


def _serialize_card(c: Card) -> dict:
    return {'r': c.rank, 's': c.suit, 'u': c.face_up}


def _deserialize_card(d: dict) -> Card:
    return Card(rank=d['r'], suit=d['s'], face_up=d['u'])


def _serialize_hand(h: Hand) -> dict:
    return {
        'cards': [_serialize_card(c) for c in h.cards],
        'bet': h.bet,
        'status': h.status.name,
        'is_split_hand': h.is_split_hand,
        'is_split_aces': h.is_split_aces,
        'has_doubled': h.has_doubled,
        'insurance_bet': h.insurance_bet,
    }


def _deserialize_hand(d: dict) -> Hand:
    return Hand(
        cards=[_deserialize_card(c) for c in d['cards']],
        bet=d['bet'],
        status=HandStatus[d['status']],
        is_split_hand=d['is_split_hand'],
        is_split_aces=d['is_split_aces'],
        has_doubled=d['has_doubled'],
        insurance_bet=d['insurance_bet'],
    )


def serialize_game_state(app: 'App') -> dict:
    """Snapshot enough state for the client to render the same view as the host."""
    g = app.game
    run = app.run
    state = {
        'v': PROTO_VERSION,
        'scene': app.scene.name,
        # Bumped each time the host calls start_run. The client compares
        # against the last session it saw to detect multiplayer restarts.
        'session': app._run_session,
        'run': {
            'gold': run.gold,
            'floor': run.floor,
            'enemy_hp': run.enemy_hp,
            'enemy_hp_max': run.enemy_hp_max,
            'player_hp': run.player_hp,
            'player_max_hp': run.player_max_hp,
            'log': list(run.log),
            'relics': [r.name for r in run.relics],
            'enemy_count': len(run.enemies),
        },
        'shop': [r.name for r in app.shop_offerings] if app.scene == Scene.SHOP else [],
    }
    if g and run.current_enemy() is not None:
        state['game'] = {
            'phase': g.phase.name,
            'active_seat_idx': g.active_seat_idx,
            'dealer': _serialize_hand(g.dealer) if g.dealer.cards else None,
            'seats': [
                {
                    'name': s.name,
                    'hands': [_serialize_hand(h) for h in s.hands],
                    'active_idx': s.active_idx,
                    'bet_amount': s.bet_amount,
                    'ready': s.ready,
                    'finished': s.finished,
                    'is_spectating': s.is_spectating,
                }
                for s in g.seats
            ],
            'last_results': list(g.last_results),
            # v2: animation/sound events. The client tracks the highest event
            # id it has played and skips older ones, so resending the same
            # events on every snapshot is safe (idempotent at the client).
            # We only ship the recent tail to keep packet size reasonable.
            'events': list(g.events[-32:]),
            # v2: shoe state for the deck-pile rendering on the client.
            'shoe_remaining': g.shoe.remaining,
            'shoe_total': g.shoe.total_cards,
        }
        e = run.current_enemy()
        state['enemy'] = {
            'name': e.name,
            'title': e.title,
            'hp': e.hp,
            'icon': e.icon,
            'description': e.description,
            'color': list(e.color),
            # Rule flags — the client's proxy needs these so its UI button
            # gating (Double, Surrender, Insurance, etc.) matches the host
            # engine's rules.
            'hits_soft_17': e.hits_soft_17,
            'bj_pays_6_5': e.bj_pays_6_5,
            'no_surrender': e.no_surrender,
            'no_insurance': e.no_insurance,
            'ties_lose': e.ties_lose,
            'dealer_peek': e.dealer_peek,
            'extra': dict(e.extra),
            # Dealer luck — purely cosmetic on the client (it informs the
            # side-panel readout) since all card draws are decided host-side.
            'luck': getattr(e, 'luck', 0),
        }
    return state


MAX_PLAYERS = 4   # 1 host + up to 3 guests


@dataclass
class ClientHandle:
    """One connected client on the host. seat_idx is 1..N (host is seat 0)."""
    seat_idx: int
    sock: socket.socket
    addr: tuple
    read_thread: Optional[threading.Thread] = None
    alive: bool = True


class HostServer:
    """Host runs this. Accepts up to MAX_PLAYERS-1 client connections.
    Each connected client gets a seat index (1..N). Actions arrive in inbox
    tagged with their originating seat. send_state() broadcasts to all clients."""

    def __init__(self, port: int = DEFAULT_PORT, max_clients: int = MAX_PLAYERS - 1):
        self.port = port
        self.max_clients = max_clients
        self.sock: Optional[socket.socket] = None
        self.clients: dict[int, ClientHandle] = {}    # seat_idx -> handle
        self.inbox: "queue.Queue[dict]" = queue.Queue()
        self.error: Optional[str] = None
        self._stop = False
        self._accept_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._send_lock = threading.Lock()
        self._next_seat_idx = 1
        # Once the run starts we close to new connections (set externally)
        self.locked: bool = False

    @property
    def connected_count(self) -> int:
        return sum(1 for c in self.clients.values() if c.alive)

    @property
    def connected(self) -> bool:
        """At least one client is connected — for backwards compat with 2p code."""
        return self.connected_count > 0

    def start(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.sock.bind(('', self.port))
            self.sock.listen(self.max_clients)
            self.sock.settimeout(0.5)
            self._accept_thread = threading.Thread(target=self._accept_loop, daemon=True)
            self._accept_thread.start()
        except Exception as e:
            self.error = f"Could not host on port {self.port}: {e}"

    def _accept_loop(self):
        while not self._stop:
            if self.locked or self.connected_count >= self.max_clients:
                # Don't accept more - sleep briefly
                try:
                    cs, addr = self.sock.accept()
                    # Politely refuse: close immediately
                    cs.close()
                except socket.timeout:
                    continue
                except Exception:
                    if self._stop:
                        return
                continue
            try:
                cs, addr = self.sock.accept()
                with self._lock:
                    seat_idx = self._next_seat_idx
                    self._next_seat_idx += 1
                    handle = ClientHandle(seat_idx=seat_idx, sock=cs, addr=addr)
                    self.clients[seat_idx] = handle
                # Tell the client which seat it is
                self._send_to(seat_idx, {'type': 'seat_assignment', 'seat_idx': seat_idx})
                t = threading.Thread(target=self._read_loop, args=(handle,), daemon=True)
                handle.read_thread = t
                t.start()
            except socket.timeout:
                continue
            except Exception as e:
                if not self._stop:
                    self.error = f"Accept failed: {e}"
                return

    def _read_loop(self, handle: ClientHandle):
        buf = b""
        try:
            while not self._stop and handle.alive:
                chunk = handle.sock.recv(4096)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    if not line.strip():
                        continue
                    try:
                        msg = json.loads(line.decode('utf-8'))
                        # Tag with seat origin so host knows who sent it
                        msg['_seat_idx'] = handle.seat_idx
                        self.inbox.put(msg)
                    except json.JSONDecodeError:
                        pass
        except Exception:
            pass
        finally:
            handle.alive = False
            try:
                handle.sock.close()
            except Exception:
                pass

    def _send_to(self, seat_idx: int, msg: dict):
        h = self.clients.get(seat_idx)
        if not h or not h.alive:
            return
        try:
            data = (json.dumps(msg) + "\n").encode('utf-8')
            with self._send_lock:
                h.sock.sendall(data)
        except Exception:
            h.alive = False

    def send_state(self, state: dict):
        """Broadcast state to all live clients."""
        msg = {'type': 'state', 'state': state}
        data = (json.dumps(msg) + "\n").encode('utf-8')
        dead = []
        for seat_idx, h in list(self.clients.items()):
            if not h.alive:
                dead.append(seat_idx)
                continue
            try:
                with self._send_lock:
                    h.sock.sendall(data)
            except Exception:
                h.alive = False
                dead.append(seat_idx)
        # Cleanup dead handles
        for k in dead:
            self.clients.pop(k, None)

    def stop(self):
        self._stop = True
        for h in list(self.clients.values()):
            try:
                h.alive = False
                h.sock.close()
            except Exception:
                pass
        try:
            if self.sock:
                self.sock.close()
        except Exception:
            pass


class ClientConnection:
    """The joining player runs this. Connects to host, sends actions,
    receives state snapshots into an inbox. seat_idx is set by host."""

    def __init__(self, host: str, port: int = DEFAULT_PORT):
        self.host = host
        self.port = port
        self.sock: Optional[socket.socket] = None
        self.inbox: "queue.Queue[dict]" = queue.Queue()
        self.connected = False
        self.error: Optional[str] = None
        self.seat_idx: Optional[int] = None     # assigned by host on connect
        self._stop = False
        self._read_thread: Optional[threading.Thread] = None
        self._send_lock = threading.Lock()

    def start(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(5.0)
            self.sock.connect((self.host, self.port))
            self.sock.settimeout(None)
            self.connected = True
            self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
            self._read_thread.start()
        except Exception as e:
            self.error = f"Could not connect to {self.host}:{self.port} — {e}"

    def _read_loop(self):
        buf = b""
        try:
            while not self._stop:
                chunk = self.sock.recv(8192)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    if not line.strip():
                        continue
                    try:
                        msg = json.loads(line.decode('utf-8'))
                        self.inbox.put(msg)
                    except json.JSONDecodeError:
                        pass
        except Exception:
            pass
        finally:
            self.connected = False

    def send_action(self, action: str, **kwargs):
        if not self.connected or self.sock is None:
            return
        try:
            payload = {'type': 'action', 'action': action, 'args': kwargs}
            data = (json.dumps(payload) + "\n").encode('utf-8')
            with self._send_lock:
                self.sock.sendall(data)
        except Exception:
            self.connected = False

    def stop(self):
        self._stop = True
        try:
            if self.sock:
                self.sock.close()
        except Exception:
            pass


def get_local_ip() -> str:
    """Best-effort local IP detection for displaying to the host."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    asyncio.run(App().run_app())
