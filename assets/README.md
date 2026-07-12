# Dungeon of Cards assets

Replace art by keeping the same filenames in these folders.

## Art

- `art/cards/` — card backs and future card frame art.
- `art/suits/` — suit symbols.
- `art/glyphs/` — card rank and UI symbol glyphs.
- `art/relics/` — relic icons.
- `art/ui/` — menu/splash backgrounds, frames, chips, dividers, texture, tokens, doodles.
- `art/effects/` — blood, heartbeat, hit/win/loss visual effects.
- `art/marks/` — gold/debt marks and signature flourishes.
- `art/dealers/` — future dealer/boss portraits.
- `art/maps/` — future floor-map node, route, elevator, and background art.
- `art/backgrounds/` — future menu/table/casino backgrounds.

## Floor map art

Use `art/floors/` for replaceable map visuals.

Current floor-map replacement folders:

- `art/floors/shared/`
- `art/floors/floor_01_lobby_tables/`
- `art/floors/floor_02_slots_and_side_bets/`
- `art/floors/floor_03_security_checkpoint/`
- `art/floors/floor_04_bone_lounge/`
- `art/floors/floor_05_vault_hall/`
- `art/floors/floor_06_mirror_casino/`
- `art/floors/floor_07_dragon_tables/`
- `art/floors/floor_08_clockwork_pit/`
- `art/floors/floor_09_black_felt/`
- `art/floors/floor_10_penthouse/`

Each floor folder can contain:

- `background.png`
- `table.png`
- `boss_table.png`
- `boss_portrait.png`
- `elevator.png`
- `decoration.png`

Shared fallback assets can go in `art/floors/shared/` as `start_marker.png`, `elevator.png`, `table_common.png`, `table_uncommon.png`, `table_rare.png`, `table_epic.png`, `table_legendary.png`, `table_mythic.png`, and `route_line.png`.

The game tries floor-specific art first, shared fallback art second, and procedural drawing last.

## Menu and splash art

Use `art/ui/` for replaceable title/menu visuals:

- `splash_background.png`
- `main_menu_background.png`

The game draws UI and buttons over these images, so avoid baked-in text or button labels when replacing them.

## In-game table scene art

Use `art/tables/` for visuals shown after sitting at a table.

Each floor table folder should contain:

- `background.png`
- `table.png`
- `boss_table.png`

Optional:

- `decoration.png`

Floor 1 already includes generated starter table assets in `art/tables/floor_01_lobby_tables/`.

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

## Floor card backs

Use `art/cards/floor_backs/` for per-floor face-down card backs.

The game expects:

- `floor_01_card_back.png`
- `floor_02_card_back.png`
- `floor_03_card_back.png`
- `floor_04_card_back.png`
- `floor_05_card_back.png`
- `floor_06_card_back.png`
- `floor_07_card_back.png`
- `floor_08_card_back.png`
- `floor_09_card_back.png`
- `floor_10_card_back.png`

The editable generated source grid is `art/cards/floor_backs/source/floor_card_backs_grid.png`.
