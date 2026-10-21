// Função de altura do terreno — compartilhada por tudo que precisa "pisar" no chão.
import { fbm, lerp, smoothstep } from './noise.js';

export const WORLD_HALF = 300;
export const WATER_LEVEL = 0;
export const BOUND = WORLD_HALF - 18;

export function heightAt(x, z) {
  const n = fbm(x * 0.0055 + 50, z * 0.0055 + 50, 5);
  let h = (n - 0.46) * 70;
  const m = fbm(x * 0.0028 - 80, z * 0.0028 + 20, 4);
  h += Math.max(0, m - 0.52) * 260;
  // vila plana no centro
  const d = Math.hypot(x, z);
  h = lerp(3.5, h, smoothstep(24, 70, d));
  // montanhas nas bordas do mundo
  const e = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(235, 295, e) * 50;
  return h;
}
