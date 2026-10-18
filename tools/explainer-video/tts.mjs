// Narration: one audio file per beat, cached by text so re-runs only synthesise changed lines.
// Usage: node tts.mjs [say|eleven]   (eleven needs ELEVENLABS_API_KEY; optional ELEVEN_VOICE_ID)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const DIR = new URL('.', import.meta.url).pathname;
const backend = process.argv[2] || 'say';
const script = JSON.parse(readFileSync(DIR + 'script.json', 'utf8'));
const OUT = DIR + 'vo/' + backend + '/'; mkdirSync(OUT, { recursive: true });
const beats = script.scenes.flatMap(s => s.beats.map((b, i) => ({ ...b, id: `${s.id}-${i}` })));
const VOICE = process.env.ELEVEN_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // "George": warm, storyteller

async function eleven(b, i, mp3) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: b.t, model_id: 'eleven_multilingual_v2',
      previous_text: beats[i - 1]?.t, next_text: beats[i + 1]?.t,          // keeps intonation continuous across beats
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
}

const manifest = [];
for (let i = 0; i < beats.length; i++) {
  const b = beats[i];
  const h = createHash('sha1').update(backend + VOICE + b.t).digest('hex').slice(0, 10);
  const wav = OUT + `${b.id}-${h}.wav`;
  if (!existsSync(wav)) {
    const raw = OUT + `${b.id}-${h}.` + (backend === 'say' ? 'aiff' : 'mp3');
    if (backend === 'say') execFileSync('say', ['-v', 'Rishi', '-r', '178', '-o', raw, b.t]);
    else await eleven(b, i, raw);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-ar', '48000', '-ac', '1', wav]);
    console.log('made', b.id);
  }
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString();
  manifest.push({ id: b.id, v: b.v, wav, dur });
}
writeFileSync(DIR + `vo-${backend}.json`, JSON.stringify(manifest, null, 1));
console.log('beats', manifest.length, 'speech', manifest.reduce((a, b) => a + b.dur, 0).toFixed(1) + 's');
