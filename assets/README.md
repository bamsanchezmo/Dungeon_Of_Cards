# Dungeon of Cards assets

Replace art by keeping the same filenames in these folders.

## Art

- `art/cards/` — card backs and future card frame art.
- `art/suits/` — suit symbols.
- `art/glyphs/` — card rank and UI symbol glyphs.
- `art/relics/` — relic icons.
- `art/ui/` — frames, chips, dividers, texture, tokens, doodles.
- `art/effects/` — blood, heartbeat, hit/win/loss visual effects.
- `art/marks/` — gold/debt marks and signature flourishes.
- `art/dealers/` — future dealer/boss portraits.
- `art/maps/` — future floor-map node, route, elevator, and background art.
- `art/backgrounds/` — future menu/table/casino backgrounds.

## Audio

- `audio/music/` — looping music tracks.
- `audio/sfx/` — sound effects.

Current music replacement filenames:

MP3 is the intended replacement format. The old OGG placeholders can still act as a temporary fallback while you are swapping in finished songs.

- `audio/music/menu_theme.mp3`
- `audio/music/floor_01_lobby_tables.mp3`
- `audio/music/floor_02_slots_and_side_bets.mp3`
- `audio/music/floor_03_security_checkpoint.mp3`
- `audio/music/floor_04_bone_lounge.mp3`
- `audio/music/floor_05_vault_hall.mp3`
- `audio/music/floor_06_mirror_casino.mp3`
- `audio/music/floor_07_dragon_tables.mp3`
- `audio/music/floor_08_clockwork_pit.mp3`
- `audio/music/floor_09_black_felt.mp3`
- `audio/music/floor_10_penthouse.mp3`
- `audio/music/boss_01_floor_01.mp3`
- `audio/music/boss_02_floor_02.mp3`
- `audio/music/boss_03_floor_03.mp3`
- `audio/music/boss_04_floor_04.mp3`
- `audio/music/boss_05_floor_05.mp3`
- `audio/music/boss_06_floor_06.mp3`
- `audio/music/boss_07_floor_07.mp3`
- `audio/music/boss_08_floor_08.mp3`
- `audio/music/boss_09_floor_09.mp3`
- `audio/music/boss_10_floor_10.mp3`

The game currently loads specific filenames from `src/app.js`; easiest replacement path is to overwrite the matching file with new art/audio.
