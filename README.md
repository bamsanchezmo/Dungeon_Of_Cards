# Dungeon of Cards Web

Static, GitHub Pages-friendly web builds for Dungeon of Cards.

## What works

- `original-web/` runs the original Pygame game in the browser through pygbag.
- The root page keeps the JavaScript WebRTC prototype for free no-backend multiplayer experiments.
- Runs from static files on GitHub Pages.
- The original music is converted to OGG for browser packaging.
- A 4-character lobby code is shown as a lobby label in the prototype flow.

## Important lobby note

A true "enter 4-character code from anywhere" flow requires an always-online
lookup/signaling service so the joining browser can find the hosting browser.
The prototype avoids paid services by using manual WebRTC invite/answer text.

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

For this repository:

- Main page: `https://bamsanchezmo.github.io/Dungeon_Of_Cards/`
- Original Pygame build: `https://bamsanchezmo.github.io/Dungeon_Of_Cards/original-web/`

## Next porting steps

- Connect the original Pygame game state to browser-safe WebRTC messages.
- Add multi-guest host offers, one invite per guest.
- Replace manual invite/answer with a free backend later only if a short-code
  lobby lookup becomes worth having.
