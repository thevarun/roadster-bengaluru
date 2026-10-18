# Explainer video pipeline

A ~6 min narrated explainer of how the game works, built from `script.json` (one entry per narration beat, each with a visual: `slide:<id>/<step>` or `clip:<name>`).

1. `node tts.mjs say` drafts the voice with macOS `say`. For the final: `ELEVEN_ENV_FILE=~/Coding/vt-video-studio/.env node tts.mjs eleven` (the key is read from that file, never printed). The default voice is "Shrey" on eleven_v3; set `ELEVEN_VOICE_ID` to override. Each scene is one take (v3 can't stitch requests), split into beats with character timestamps. Takes are cached per scene, so an edit re-bills only that scene.
2. `./render-slides.sh` screenshots `slides.html` states.
3. `./run-footage.sh` captures gameplay with teaching overlays (`ov.js`), driving the game through `window.__game`. It needs the local server on :8742 and uses headless Chrome with GPU (Metal); swiftshader hangs.
4. `node build.mjs eleven ../../media/explainer.mp4` sizes each segment to its narration and muxes the result.

Outputs (frames, audio, segments) are gitignored.
