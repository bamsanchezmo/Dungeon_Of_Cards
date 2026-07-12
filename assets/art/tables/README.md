# In-game table scene art

These assets are used after a player enters a table and starts playing blackjack.

Each floor folder supports three primary gameplay assets:

- `background.png` — optional scene/background behind the blackjack felt.
- `table.png` — normal table art drawn under the cards.
- `boss_table.png` — boss table art drawn under the cards for boss encounters; include the boss in this image if they should be visible while playing.

Optional:

- `decoration.png` — prop art layered into the scene.

The game falls back to canvas-drawn felt when an asset is missing, so floors can be upgraded one at a time.
