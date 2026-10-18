// Narration: one audio file per beat, cached so re-runs only synthesise changed text.
// Usage: node tts.mjs [say|eleven]
//   eleven: needs ELEVENLABS_API_KEY, or ELEVEN_ENV_FILE pointing at a .env that defines it (read here, never printed).
//   Optional ELEVEN_VOICE_ID (default "Shrey", Indian-English narrator).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const DIR = new URL('.', import.meta.url).pathname;
const backend = process.argv[2] || 'say';
const script = JSON.parse(readFileSync(DIR + 'script.json', 'utf8'));
const OUT = DIR + 'vo/' + backend + '/'; mkdirSync(OUT, { recursive: true });
const VOICE = process.env.ELEVEN_VOICE_ID || 'IMzcdjL6UK1gZxag6QAU';
const MODEL = 'eleven_v3';
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
const toWav = (src, dst, ss, to) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...(ss != null ? ['-ss', ss.toFixed(3), '-to', to.toFixed(3)] : []), '-i', src, '-ar', '48000', '-ac', '1', dst]);
const dur = (f) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();

if (backend === 'eleven' && !process.env.ELEVENLABS_API_KEY && process.env.ELEVEN_ENV_FILE) {
  for (const line of readFileSync(process.env.ELEVEN_ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\n]*)"?\s*$/); if (m) process.env.ELEVENLABS_API_KEY = m[1];
  }
}

// eleven_v3 has no request stitching, so each scene is ONE take (consistent tone),
// split into beats at the gaps between them using the character timestamps.
async function elevenScene(scene, base) {
  const text = scene.beats.map(b => b.t).join(' ');
  const json = base + '.json', mp3 = base + '.mp3';
  if (!existsSync(json)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, apply_text_normalization: 'off' }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const r = await res.json();
    writeFileSync(mp3, Buffer.from(r.audio_base64, 'base64'));
    writeFileSync(json, JSON.stringify(r.alignment));
    console.log('recorded scene', scene.id);
  }
  const a = JSON.parse(readFileSync(json, 'utf8')), chars = a.characters.join('');
  const total = dur(mp3); let from = 0; const cuts = [0];
  for (let k = 1; k < scene.beats.length; k++) {
    const at = chars.indexOf(scene.beats[k].t.slice(0, 24), from);
    if (at < 0) throw new Error(`beat ${scene.id}-${k} not found in alignment`);
    let prev = at - 1; while (prev > 0 && /\s/.test(chars[prev])) prev--;
    cuts.push((a.character_end_times_seconds[prev] + a.character_start_times_seconds[at]) / 2); from = at;
  }
  cuts.push(total);
  return scene.beats.map((b, k) => ({ src: mp3, ss: cuts[k], to: cuts[k + 1] }));
}

const manifest = [];
for (const scene of script.scenes) {
  const ids = scene.beats.map((b, i) => `${scene.id}-${i}`);
  let parts;
  if (backend === 'eleven') parts = await elevenScene(scene, OUT + `${scene.id}-${hash(VOICE + MODEL + scene.beats.map(b => b.t).join('|'))}`);
  for (let i = 0; i < scene.beats.length; i++) {
    const b = scene.beats[i];
    const wav = OUT + `${ids[i]}-${hash(backend + VOICE + (parts ? parts[i].src + parts[i].ss : b.t))}.wav`;
    if (!existsSync(wav)) {
      if (parts) toWav(parts[i].src, wav, parts[i].ss, parts[i].to);
      else { const aiff = wav.replace(/wav$/, 'aiff'); execFileSync('say', ['-v', 'Rishi', '-r', '178', '-o', aiff, b.t]); toWav(aiff, wav); }
    }
    manifest.push({ id: ids[i], v: b.v, wav, dur: dur(wav) });
  }
}
writeFileSync(DIR + `vo-${backend}.json`, JSON.stringify(manifest, null, 1));
console.log('beats', manifest.length, 'speech', manifest.reduce((a, b) => a + b.dur, 0).toFixed(1) + 's');
