# Roadster: Namma Bengaluru — agent notes

A comedy browser game: fly a Tesla Roadster through Bengaluru traffic (HSR Layout → Silk Board → ORR → Marathahalli → Whitefield) before the 9:30 standup. Static site, no build step, no asset files.

## Run / deploy
- Local: `python3 -m http.server 8742` in this folder, then open http://localhost:8742. ES modules mean `file://` won't work.
- Live: GitHub Pages serves `main` at the repo root (https://thevarun.github.io/roadster-bengaluru/). **Pushing to `main` deploys.**
- After editing `game.js` or `style.css`, bump the `?v=N` query on both links in `index.html`. Otherwise browsers and Pages serve stale copies.

## Files
- `index.html`: HUD, overlays (title, pause, end screen), touch buttons, Three.js import map (pinned r160 from jsdelivr).
- `style.css`: Tesla-minimal HUD (white, thin Inter type, glass panels) set against desi elements (Baloo 2, marigold, truck-art).
- `game.js`: everything else, in commented sections: scene, Roadster mesh, traffic builders (`BUILDERS`), scenery, particles, audio (`AU`, all synthesised WebAudio), UI helpers, input, game state, spawning, `update()`, render sync, flow and main loop.

## Conventions
- World: forward is **-Z**. `car.s` is distance travelled; the car's world z is `-car.s`. Obstacles store `x`, `z`, `w`, `d`, `h`, `vz` (forward speed). Collision is an AABB in x/z plus a height check (`car.y >= o.h` means you're above it).
- Tuning knobs at the top of `game.js`: `MODES` (Chill/Sport/Plaid cruise speeds), `SEC_PER_MIN` (clock difficulty; the clock scales with mode), `STAGES` / `STAGE_CFG` (route and traffic mix), plus hop, hover and gas constants.
- Messaging channels, one per event, never both:
  - `flash()`: centre text for on-road events (crashes, stunts).
  - `toast()`: phone notifications (WhatsApp, e-challan SMS).
  - `hint()`: bottom pill for tips.
  - `banner()`: stage names.
- Humour lives in data arrays (`AUTO_SLOGANS`, `SHOPS`, `BILLBOARDS`, `TICKER`, `KANNADA_HITS`, `buildEvents()`). Keep Kannada/Kanglish lines accurate.
- Fan parody: keep the "not affiliated with Tesla" line on the title screen and in the README.

## Testing
- `window.__game` is a debug hook. `__game.sim(seconds, ctlFn)` fast-forwards the simulation at a fixed 60 Hz, independent of requestAnimationFrame (which throttles in hidden or automated tabs). Set `__game.keys.*` / `__game.pressed.*` inside `ctlFn` to drive input. It returns `{s, x, y, speed, air, clock, state, crashes, swag}`.
- A good smoke test: start a game, teleport (`car.s = 880`), hop and hold to clear the Silk Board wall, and check `read_console_messages` for errors. For balance, run a simple avoid-and-hop bot through the full route in each drive mode and compare arrival times.
- The window `blur` event auto-pauses the game, and automated browser tools can trigger it. Call `setPaused(false)` or click Resume before taking screenshots.
- Audio is synthesised and starts on the first user gesture. Remember the user can hear the browser pane, so don't leave a game running.

## Git
Conventional Commits, one line, no Co-Authored-By trailer.
