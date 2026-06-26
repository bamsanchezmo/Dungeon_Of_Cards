# Dungeon of Cards Web

Static, GitHub Pages-friendly web prototype for Dungeon of Cards.

## What works

- Runs from static files: no npm, build step, server, or paid backend.
- Mobile-friendly layout with large touch controls.
- Solo blackjack battle loop.
- Free WebRTC host/join flow with copy/paste invite and answer text.
- A 4-character lobby code is shown as a lobby label.

## Important lobby note

A true "enter 4-character code from anywhere" flow requires an always-online
lookup/signaling service so the joining browser can find the hosting browser.
This prototype avoids paid services by using manual WebRTC invite/answer text.

For internet play, the app uses free public STUN servers to help WebRTC discover
connection routes. If you want zero third-party network dependency, remove the
`iceServers` entries in `src/webrtc.js`; direct connections will then mostly be
limited to same-network or unusually permissive NAT setups.

## GitHub Pages

1. Create a personal repository, for example `dungeon-of-cards`.
2. Put these files at the repo root.
3. In GitHub, open **Settings > Pages**.
4. Set **Source** to `Deploy from a branch`.
5. Choose `main` and `/root`.
6. Visit `https://YOUR_USERNAME.github.io/dungeon-of-cards/`.

## Next porting steps

- Move over the Python game's full enemy/relic campaign rules.
- Add card/chip/relic/boss sprite asset loading.
- Add multi-guest host offers, one invite per guest.
- Replace manual invite/answer with a free backend later only if you decide a
  short-code lobby lookup is worth having.
