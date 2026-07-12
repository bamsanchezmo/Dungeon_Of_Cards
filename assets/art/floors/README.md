# Floor map art

Drop generated PNG art into these folders to replace the procedural-looking map pieces.

Each floor folder supports these filenames:

- `background.png` — full map board / casino-floor background.
- `table.png` — normal table node art for that floor.
- `boss_table.png` — boss table node art for that floor.
- `boss_portrait.png` — reserved for boss preview art.
- `elevator.png` — floor-specific elevator art.
- `decoration.png` — optional accent prop layered over the map background.

Shared fallback assets live in `shared/`:

- `start_marker.png`
- `elevator.png`
- `table_common.png`
- `table_uncommon.png`
- `table_rare.png`
- `table_epic.png`
- `table_legendary.png`
- `table_mythic.png`
- `route_line.png`

The game tries floor-specific art first, then shared fallback art, then procedural drawing.
