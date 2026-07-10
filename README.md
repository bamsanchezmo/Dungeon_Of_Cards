# Dungeon of Cards

Browser-native GitHub Pages version of Dungeon of Cards.

## What Works

- One hosted version at the repo root.
- Canvas rendering modeled after the original Pygame table: felt, cards, chips, side panel, enemies, relics, and run log.
- Original background song converted to browser-safe OGG.
- WebAudio sound effects for dealing, flips, busts, wins, losses, pushes, and shuffles.
- Blackjack rules: hit, stand, double, split, surrender, insurance, dealer peek, H17/S17, 6:5 blackjack, push-wins/push-loses, hit fees, five-card Charlie, refunds, healing, bonus damage, and luck.
- Free link-based co-op using Supabase Realtime rooms, which work across home, mobile, and restrictive networks.
- Global top-five leaderboard using the same free Supabase project, with local fallback if the leaderboard table is unavailable.

## Hosting

GitHub Pages serves the game from:

https://bamsanchezmo.github.io/Dungeon_Of_Cards/

## Multiplayer Note

No paid services are used. GitHub Pages hosts the game, and browsers exchange host-authoritative game messages through a Supabase Realtime room. A host can share one lobby link; guests can join from that link or enter the 4-letter code. Because multiplayer uses secure WebSockets instead of peer-to-peer connections, it works across different Wi-Fi, cellular, and NAT configurations without a TURN server.

## Leaderboard Note

Run `supabase_leaderboard.sql` in the Supabase SQL editor once to create the shared leaderboard table and public read/write policies. The game still saves scores locally if the global table is not available.
