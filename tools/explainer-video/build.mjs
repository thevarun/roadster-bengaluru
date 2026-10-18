// Assemble the explainer: one video segment per narration beat, sized to that beat's audio.
// Usage: node build.mjs [say|eleven] [out.mp4]
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = new URL('.', import.meta.url).pathname;
const backend = process.argv[2] || 'say';
const OUTFILE = process.argv[3] || DIR + `explainer-${backend}.mp4`;
const beats = JSON.parse(readFileSync(DIR + `vo-${backend}.json`, 'utf8'));
const SEG = DIR + `seg-${backend}/`; mkdirSync(SEG, { recursive: true });
const FPS = 30, XF = 0.3, GAP = 0.35, SCENE_GAP = 0.7;
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

const clipPos = {}; const vlist = [], alist = [];
beats.forEach((b, i) => {
  const sceneEnd = !beats[i + 1] || beats[i + 1].id.split('-')[0] !== b.id.split('-')[0];
  const lead = i === 0 ? 0.4 : 0;
  const dur = +(lead + b.dur + (sceneEnd ? SCENE_GAP : GAP)).toFixed(3);
  const out = SEG + `${String(i).padStart(2, '0')}-${b.id}.mp4`;
  const [kind, ref] = [b.v.split(':')[0], b.v.slice(b.v.indexOf(':') + 1)];
  if (kind === 'slide') {
    const img = DIR + 'slides/' + ref.replace('/', '-') + '.png';
    const prev = beats[i - 1]?.v;
    if (prev && prev.startsWith('slide:') && prev !== b.v) {
      const pimg = DIR + 'slides/' + prev.slice(6).replace('/', '-') + '.png';
      ff(['-loop', '1', '-t', String(XF + 0.05), '-i', pimg, '-loop', '1', '-t', String(dur + 0.05), '-i', img,
        '-filter_complex', `[0]fps=${FPS},format=yuv420p[a];[1]fps=${FPS},format=yuv420p[b];[a][b]xfade=transition=fade:duration=${XF}:offset=0[v]`,
        '-map', '[v]', '-t', String(dur), ...enc, out]);
    } else {
      ff(['-loop', '1', '-t', String(dur), '-i', img, '-vf', `fps=${FPS},format=yuv420p`, ...enc, out]);
    }
  } else {
    const start = clipPos[ref] || 0, frames = readdirSync(DIR + 'clips/' + ref).length;
    const n = Math.round(dur * FPS);
    if (start + n > frames) throw new Error(`clip ${ref} too short: need ${start + n}, have ${frames}`);
    ff(['-framerate', String(FPS), '-start_number', String(start), '-i', DIR + `clips/${ref}/f%04d.jpg`, '-frames:v', String(n), ...enc, out]);
    clipPos[ref] = start + n;
  }
  vlist.push(`file '${out}'`);
  // narration for this beat, padded to the segment length
  const aout = SEG + `${String(i).padStart(2, '0')}.wav`;
  ff(['-i', b.wav, '-af', `adelay=${Math.round(lead * 1000)},apad=whole_dur=${dur}`, '-ar', '48000', '-ac', '1', aout]);
  alist.push(`file '${aout}'`);
  b.start = beats.slice(0, i).reduce((a, x) => a + x.segDur, 0); b.segDur = dur;
});
writeFileSync(SEG + 'v.txt', vlist.join('\n')); writeFileSync(SEG + 'a.txt', alist.join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', SEG + 'v.txt', '-c', 'copy', SEG + 'video.mp4']);
ff(['-f', 'concat', '-safe', '0', '-i', SEG + 'a.txt', '-c', 'pcm_s16le', SEG + 'voice.wav']);

// horn stings: the Roadster horn on the cold open, the taxi horn on the outro
const total = beats.reduce((a, b) => a + b.segDur, 0);
const outro = beats.find(b => b.id === 'outro-1').start;
const horn = '/Users/varuntorka/Coding/Misc-Experiments/roadster-bengaluru/audio/';
ff(['-i', SEG + 'video.mp4', '-i', SEG + 'voice.wav', '-i', horn + 'roadster-horn.mp3', '-i', horn + 'taxi-horn.mp3',
  '-filter_complex',
  `[1]loudnorm=I=-16:TP=-1.5:LRA=11[vo];` +
  `[2]volume=0.35,adelay=3000:all=1[h1];` +
  `[3]volume=0.3,adelay=${Math.round((outro + beats.find(b => b.id === 'outro-1').segDur - 1.6) * 1000)}:all=1[h2];` +
  `[vo][h1][h2]amix=inputs=3:normalize=0:duration=first[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', OUTFILE]);
console.log('done', OUTFILE, total.toFixed(1) + 's');
