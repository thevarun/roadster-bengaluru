# Roadster: Namma Bengaluru — agent notes

A comedy browser game: fly a Tesla Roadster through Bengaluru traffic (HSR Layout → Silk Board → ORR → Marathahalli → Whitefield) before the 9:30 standup. Static site, no build step. The only asset files are five small CC0 horn MP3s in `audio/`.

## Run / deploy
- Local: `python3 -m http.server 8742` in this folder, then open http://localhost:8742. ES modules mean `file://` won't work.
- Live: GitHub Pages serves `main` at the repo root (https://thevarun.github.io/roadster-bengaluru/). **Pushing to `main` deploys.**
- After editing `game.js` or `style.css`, bump the `?v=N` query on both links in `index.html`. Otherwise browsers and Pages serve stale copies.

## Files
- `index.html`: HUD, overlays (title, pause, showroom `#garage`, end screen, `#ogcard`), touch buttons, OG/Twitter meta, Three.js import map (pinned r160 from jsdelivr).
- `style.css`: Tesla-minimal HUD (white, thin Inter type, glass panels) set against desi elements (Baloo 2, marigold, truck-art).
- `game.js`: everything else, in commented sections: scene, sky, vehicle versions and the Roadster builder, traffic builders (`BUILDERS`), scenery, particles, audio (`AU`: CC0 horn samples plus WebAudio synth), UI helpers, input, game state, spawning, FSD, `update()`, render sync, showroom and pooja, flow and main loop.
- `audio/`: five trimmed CC0 horn MP3s, credited in the README.
- `_screenshots/`: the four current images the README uses. Don't commit dev-iteration screenshots here.

## Conventions
- World: forward is **-Z**. `car.s` is distance travelled; the car's world z is `-car.s`. Obstacles store `x`, `z`, `w`, `d`, `h`, `vz` (forward speed). Collision is an AABB in x/z plus a height check (`car.y >= o.h` means you're above it).
- Tuning knobs at the top of `game.js`: `MODES` (Chill/Sport/Plaid cruise speeds), `SEC_PER_MIN` (clock difficulty; the clock scales with mode), `STAGES` / `STAGE_CFG` (route and traffic mix), plus hop, hover and gas constants.
- The car must never rest on a vehicle roof: from the chase cam it looks like a stuck hover. Landing on a roof triggers a bounce (`ROOF HOP`) that clears a bus and pushes the car forward.
- Without an env map, metallic materials render near-black, so "chrome" is a bright low-metalness grey.
- Flat decals (shadows, potholes) use the `DECAL` polygon-offset material options. Without them they z-fight with the road and flicker.
- Messaging channels, one per event, never both:
  - `flash()`: centre text for on-road events (crashes, stunts).
  - `toast()`: phone notifications (WhatsApp, e-challan SMS).
  - `hint()`: bottom pill for tips.
  - `banner()`: stage names.
- Humour lives in data arrays (`AUTO_SLOGANS`, `SHOPS`, `BILLBOARDS`, `TICKER`, `KANNADA_HITS`, `buildEvents()`). Kanglish lines are fine, but **only Latin script anywhere**: the audience is English-speaking.
- Keep the scene calm. Buildings and vehicles carry almost no text (a few shop boards, HORN OK PLEASE on tankers), and the menus stay minimal. The user pushed back on visual clutter, so add detail sparingly.
- Audio is SFX only (no music, removed as annoying), with one mute switch (`AU.setMuted`, persisted as `rb-muted`). Every voice, including the reverb return, must route through `AU.sfx` so that pause and mute really silence it.
- Horns use real CC0 recordings (`SAMPLES` in `game.js`, credited in the README) through `AU.sample()`. Trim windows and gains were measured per file. Autos and bikes reuse the car honk, pitched up. Synth voices are the fallback and are still used for the Shaadi band-baaja and the musical truck horn. The user found the pure-synth horns inauthentic, so prefer recordings for anything that should sound real.
- Fan parody: keep the "not affiliated with Tesla" line on the title screen and in the README.
- Vehicles: `MODEL_ORDER` / `MODELS` (Roadster, Kaali-Peeli taxi, Shaadi Edition) and `PAINTS` sit above `buildRoadster(cfg)`. **Every version keeps the Roadster body.** Variants only dress it (Taxi: black body, yellow roof, TAXI sign, flag meter; Shaadi: instanced marigold and rose garlands). Flowers are Shaadi-only. An Ambassador variant was tried and cut as not distinct enough. Gameplay `mods` (hover drain, hop, steer, horn reach) are applied through `VEH`, and horns are per model (`AU.playerHorn(model)`). Saved as `rb-car`.
- Showroom: its own room (`showroomScene`: dark studio, turntable, light strips, marigold toran). `setGarage(open, 'title'|'pause')` moves `carMesh` into that room and back. ‹ › or ←/→ swap cars, H tests the horn. Opens from the title card's "Enter the showroom" or the pause menu's "Change car". "Take delivery" plays the lemon-and-coconut pooja, but only when the choice changed. Debug: `__game.showroom.rot`, `__game.poojaStep(sec)`. Opening it switches `AU` to the `'showroom'` scene and unpauses the sfx bus (pause mutes sfx), so the horn test and pooja are audible even when opened from pause. Closing restores the scene and the pause mute.

## Testing
- `window.__game` is a debug hook. `__game.sim(seconds, ctlFn)` fast-forwards the simulation at a fixed 60 Hz, independent of requestAnimationFrame (which throttles in hidden or automated tabs). Set `__game.keys.*` / `__game.pressed.*` inside `ctlFn` to drive input. It returns `{s, x, y, speed, air, clock, state, crashes, swag}`.
- A good smoke test: start a game, teleport (`car.s = 880`), hop and hold to clear the Silk Board wall, and check `read_console_messages` for errors. For balance, run a simple avoid-and-hop bot through the full route in each drive mode and compare arrival times.
- The window `blur` event auto-pauses the game, and automated browser tools can trigger it. Set `window.__noAutoPause = true` before taking screenshots.
- Audio starts on the first user gesture (browser autoplay rules), and the horn samples load after that. For silent checks, use `__game.AU.setMuted(true, false)`; the analyser `__game.AU.meter` taps the mix before the master mute, so levels can still be measured. Remember the user can hear the browser pane, so don't leave a game running.

## Share card and icons
- `og.png` (1200×630) is a real render: `index.html?og` builds a parody of the Tesla launch-stage photo (dark stage, red floor light, Roadster mid-flip on a vapour trail over autos, a cow, a BMTC bus and a tanker) in `setupOgCard()`, with the wordmark from `#ogcard`. Regenerate it with the local server running:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir=/tmp/chrome-og --hide-scrollbars --use-angle=swiftshader --enable-unsafe-swiftshader --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=8000 --screenshot="$PWD/og.png" "http://localhost:8742/?og"`
- `favicon.svg` is the source icon. To make `apple-touch-icon.png` (180) and `favicon-32.png`, inline it as base64 in a `data:text/html` page, screenshot it at 600×600, and crop with `sips -c N N`. Headless Chrome won't go below its minimum window size.
- OG and Twitter meta tags in `index.html` use absolute Pages URLs.

## Git and releases
Conventional Commits, one line, no Co-Authored-By trailer. Releases are tagged (`v1.0.0` = first public release) with GitHub Release notes.
