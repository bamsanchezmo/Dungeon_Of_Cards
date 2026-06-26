# Dungeon of Cards

Browser-native GitHub Pages version of Dungeon of Cards.

## What Works

- One hosted version at the repo root.
- Canvas rendering modeled after the original Pygame table: felt, cards, chips, side panel, enemies, relics, and run log.
- Original background song converted to browser-safe OGG.
- WebAudio sound effects for dealing, flips, busts, wins, losses, pushes, and shuffles.
- Blackjack rules: hit, stand, double, split, surrender, insurance, dealer peek, H17/S17, 6:5 blackjack, push-wins/push-loses, hit fees, five-card Charlie, refunds, healing, bonus damage, and luck.
- Free link-based co-op using PeerJS signaling and WebRTC data connections.

## Hosting

GitHub Pages serves the game from:

https://bamsanchezmo.github.io/Dungeon_Of_Cards/

## Multiplayer Note

No paid services are used. GitHub Pages hosts the game, and the browser uses the free public PeerJS signaling server so a host can share one lobby link. Guests can join from that link or enter the 4-character code.
