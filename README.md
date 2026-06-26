# Dungeon of Cards

Browser-native GitHub Pages version of Dungeon of Cards.

## What Works

- One hosted version at the repo root.
- Canvas rendering modeled after the original Pygame table: felt, cards, chips, side panel, enemies, relics, and run log.
- Original background song converted to browser-safe OGG.
- WebAudio sound effects for dealing, flips, busts, wins, losses, pushes, and shuffles.
- Blackjack rules: hit, stand, double, split, surrender, insurance, dealer peek, H17/S17, 6:5 blackjack, push-wins/push-loses, hit fees, five-card Charlie, refunds, healing, bonus damage, and luck.
- Free link-based co-op using PeerJS signaling, WebRTC data connections, and TURN fallback for mobile networks.

## Hosting

GitHub Pages serves the game from:

https://bamsanchezmo.github.io/Dungeon_Of_Cards/

## Multiplayer Note

No paid services are used. GitHub Pages hosts the game, and the browser uses the free public PeerJS signaling server so a host can share one lobby link. Guests can join from that link or enter the 8-character code. The WebRTC config includes STUN plus public Open Relay TURN entries for mobile and cellular networks that cannot connect peer-to-peer directly.
