# Dungeon of Cards

Browser-native GitHub Pages version of Dungeon of Cards.

## What Works

- One hosted version at the repo root.
- Canvas rendering modeled after the original Pygame table: felt, cards, chips, side panel, enemies, relics, and run log.
- Original background song converted to browser-safe OGG.
- WebAudio sound effects for dealing, flips, busts, wins, losses, pushes, and shuffles.
- Blackjack rules: hit, stand, double, split, surrender, insurance, dealer peek, H17/S17, 6:5 blackjack, push-wins/push-loses, hit fees, five-card Charlie, refunds, healing, bonus damage, and luck.
- Free no-backend co-op using WebRTC manual invite/answer signaling.

## Hosting

GitHub Pages serves the game from:

https://bamsanchezmo.github.io/Dungeon_Of_Cards/

## Multiplayer Note

No paid services are used. Because there is no server, the lobby code is a table label and the actual connection uses copy/paste WebRTC invite/answer text. A true "enter only 4 characters from anywhere" flow requires an always-online lookup service.
