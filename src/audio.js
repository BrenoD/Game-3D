// Efeitos sonoros sintetizados em tempo real com Web Audio (sem arquivos de áudio).
let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.45;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setVolume(v) { if (master) master.gain.value = v; }

function noise({ dur = 0.2, freq = 1000, freqEnd, q = 1, type = 'lowpass', vol = 0.5, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone({ freq = 440, freqEnd, dur = 0.2, type = 'sine', vol = 0.3, delay = 0, attack = 0.005 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  shot(v = 1) {
    noise({ dur: 0.14, freq: 4000, freqEnd: 500, type: 'bandpass', q: 0.8, vol: 0.7 * v });
    tone({ freq: 220, freqEnd: 50, dur: 0.12, type: 'square', vol: 0.18 * v });
  },
  shotgun(v = 1) {
    noise({ dur: 0.35, freq: 2500, freqEnd: 200, type: 'lowpass', vol: 0.9 * v });
    tone({ freq: 140, freqEnd: 40, dur: 0.25, type: 'square', vol: 0.25 * v });
  },
  slash(v = 1) { noise({ dur: 0.2, freq: 900, freqEnd: 4500, type: 'bandpass', q: 2.5, vol: 0.45 * v }); },
  whoosh(v = 1) { noise({ dur: 0.35, freq: 300, freqEnd: 2000, type: 'bandpass', q: 1.5, vol: 0.5 * v }); },
  magic(v = 1) {
    tone({ freq: 520, freqEnd: 1300, dur: 0.25, type: 'triangle', vol: 0.18 * v });
    tone({ freq: 780, freqEnd: 1900, dur: 0.2, type: 'sine', vol: 0.1 * v, delay: 0.03 });
  },
  fire(v = 1) {
    noise({ dur: 0.45, freq: 300, freqEnd: 1800, type: 'lowpass', vol: 0.5 * v });
    tone({ freq: 160, freqEnd: 90, dur: 0.4, type: 'sawtooth', vol: 0.08 * v });
  },
  explosion(v = 1) {
    noise({ dur: 1.1, freq: 900, freqEnd: 50, type: 'lowpass', vol: 1.0 * v });
    tone({ freq: 95, freqEnd: 28, dur: 0.8, type: 'sine', vol: 0.6 * v });
  },
  ice(v = 1) {
    for (let i = 0; i < 6; i++) tone({ freq: 1800 + Math.random() * 1800, dur: 0.25, type: 'sine', vol: 0.06 * v, delay: i * 0.035 });
    noise({ dur: 0.5, freq: 6000, freqEnd: 2000, type: 'highpass', vol: 0.35 * v });
  },
  hit(v = 1) { noise({ dur: 0.08, freq: 1100, type: 'lowpass', vol: 0.45 * v }); tone({ freq: 140, freqEnd: 70, dur: 0.08, type: 'square', vol: 0.12 * v }); },
  hurt(v = 1) { tone({ freq: 260, freqEnd: 120, dur: 0.22, type: 'sawtooth', vol: 0.16 * v }); noise({ dur: 0.1, freq: 700, vol: 0.3 * v }); },
  step(v = 1) { noise({ dur: 0.06, freq: 260 + Math.random() * 120, type: 'lowpass', vol: 0.14 * v }); },
  splash(v = 1) { noise({ dur: 0.18, freq: 1800, freqEnd: 600, type: 'bandpass', vol: 0.18 * v }); },
  jump(v = 1) { noise({ dur: 0.12, freq: 400, freqEnd: 900, type: 'bandpass', vol: 0.15 * v }); },
  levelUp(v = 1) { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'triangle', vol: 0.2 * v, delay: i * 0.09 })); },
  skill(v = 1) { [660, 990, 1320].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.15 * v, delay: i * 0.06 })); },
  pickup(v = 1) { tone({ freq: 880, freqEnd: 1760, dur: 0.15, type: 'triangle', vol: 0.2 * v }); },
  quest(v = 1) { [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.4, type: 'sine', vol: 0.18 * v, delay: i * 0.12 })); },
  warcry(v = 1) {
    tone({ freq: 110, freqEnd: 165, dur: 0.9, type: 'sawtooth', vol: 0.2 * v, attack: 0.08 });
    tone({ freq: 165, freqEnd: 220, dur: 0.9, type: 'sawtooth', vol: 0.12 * v, attack: 0.08 });
  },
  enemyDie(v = 1) { tone({ freq: 300, freqEnd: 60, dur: 0.4, type: 'sawtooth', vol: 0.12 * v }); },
  growl(v = 1) { tone({ freq: 90, freqEnd: 70, dur: 0.5, type: 'sawtooth', vol: 0.12 * v }); noise({ dur: 0.4, freq: 300, vol: 0.15 * v }); },
  bow(v = 1) { tone({ freq: 300, freqEnd: 150, dur: 0.12, type: 'triangle', vol: 0.15 * v }); noise({ dur: 0.15, freq: 2000, freqEnd: 800, type: 'bandpass', vol: 0.2 * v }); },
  click(v = 1) { tone({ freq: 1200, dur: 0.05, type: 'square', vol: 0.05 * v }); },
};
