# Roadster: Namma Bengaluru Edition

You just took delivery of a ₹2.5 crore flying Roadster. You still have to get from HSR Layout to Whitefield by the 9:30 AM standup. Through Silk Board.

A small browser game: Tesla minimalism versus Bengaluru chaos. Hop over autos, hover across the Silk Board gridlock on cold-gas thrusters, barrel-roll over BMTC buses, and fly over cows to show respect.

**▶ Play: https://thevarun.github.io/roadster-bengaluru/**

![Silk Board](_screenshots/06-silk-board-v2.jpg)

## Run locally

No build step. It's static files, but ES modules need a local server:

```bash
python3 -m http.server 8742
```

Open http://localhost:8742.

## Controls

| Key | Action |
| --- | --- |
| ← → / A D | Steer (lanes are a suggestion) |
| Space | Hop · hold to hover |
| F | Barrel roll (in the air) |
| W / ↑ | Rear thrusters (uses cold gas) |
| S / ↓ | Brake |
| H | Horn |
| P / Esc | Pause |
| M | Mute |

Visit the showroom (bottom right of the title screen, or Change car from pause): the launch-event Roadster, the Mumbai kaali-peeli Roadster taxi, or the marigold-draped Shaadi Edition. Each has its own horn and handling, and delivery includes a lemon-and-coconut pooja.

Drive modes (Chill / Sport / Plaid) change cruise speed. The clock scales with the mode, so Chill isn't a handicap. Touch controls appear on phones.

## Route

HSR Layout → Silk Board Junction → Outer Ring Road / Bellandur → Marathahalli Bridge → Whitefield.

## Tech

- [Three.js](https://threejs.org) r160 from a CDN, low-poly flat-shaded geometry, all built in code
- Horns are real recordings (below), and everything else is synthesised with WebAudio (moo, thrusters, band-baaja, temple bell). If a recording fails to load, the horns fall back to synth.
- `game.js` holds everything: world, traffic AI, physics, HUD, audio.

## Credits

Horn recordings by Joseph Sardin, [BigSoundBank](https://bigsoundbank.com), released under CC0 (public domain):

- `audio/roadster-horn.mp3`: 4th honk of [Klaxons inside car](https://bigsoundbank.com/klaxons-inside-car-s0558.html)
- `audio/taxi-horn.mp3`: [Old car horn #3](https://bigsoundbank.com/old-car-horn-3-s0256.html)
- `audio/car-horn.mp3`: [Car horn #4](https://bigsoundbank.com/car-horn-4-s0260.html) (also pitched up for autos and two-wheelers)
- `audio/bus-horn.mp3`: [Bus horn](https://bigsoundbank.com/bus-horn-s3594.html)
- `audio/truck-horn.mp3`: [Truck Horn](https://bigsoundbank.com/truck-horn-s2721.html)

---

Fan-made parody. Not affiliated with Tesla, SpaceX, BMTC, or any cow.
