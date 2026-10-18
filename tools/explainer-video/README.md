# Explainer video pipeline

A ~6 min narrated explainer of how the game works, built from `script.json` (one entry per narration beat, each with a visual: `slide:<id>/<step>` or `clip:<name>`).

1. `node tts.mjs say` drafts the voice with macOS `say`. Use `node tts.mjs eleven` for the final (needs `ELEVENLABS_API_KEY`; optional `ELEVEN_VOICE_ID`). Audio is cached per line, so edits only re-bill changed lines.
2. `./render-slides.sh` screenshots `slides.html` states.
3. `./run-footage.sh` captures gameplay with teaching overlays (`ov.js`), driving the game through `window.__game`. It needs the local server on :8742 and uses headless Chrome with GPU (Metal); swiftshader hangs.
4. `node build.mjs eleven ../../media/explainer.mp4` sizes each segment to its narration and muxes the result.

Outputs (frames, audio, segments) are gitignored.
