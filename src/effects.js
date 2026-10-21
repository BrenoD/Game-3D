// Efeitos especiais: partículas, clarões de luz, anéis, cortes, números de dano e tremor de câmera.
import * as THREE from 'three';

const VERT = `
attribute float size;
attribute vec4 color;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

const tmpC = new THREE.Color();
function rgb(hex) {
  tmpC.setHex(hex, THREE.LinearSRGBColorSpace);
  return [tmpC.r, tmpC.g, tmpC.b];
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (v) => (Array.isArray(v) ? rnd(v[0], v[1]) : v);

class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max;
    this.parts = [];
    this.pool = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.siz = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, gravity, drag) {
    if (this.parts.length >= this.max) return;
    const p = this.pool.pop() || {};
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = 0; p.maxLife = life; p.s0 = s0; p.s1 = s1;
    p.r0 = c0[0]; p.g0 = c0[1]; p.b0 = c0[2];
    p.r1 = c1[0]; p.g1 = c1[1]; p.b1 = c1[2];
    p.a0 = a0; p.gravity = gravity; p.drag = drag;
    this.parts.push(p);
  }

  update(dt) {
    const P = this.parts;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.pool.push(p); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      P[w] = p;
      const t = p.life / p.maxLife;
      const j3 = w * 3, j4 = w * 4;
      this.pos[j3] = p.x; this.pos[j3 + 1] = p.y; this.pos[j3 + 2] = p.z;
      this.col[j4] = p.r0 + (p.r1 - p.r0) * t;
      this.col[j4 + 1] = p.g0 + (p.g1 - p.g0) * t;
      this.col[j4 + 2] = p.b0 + (p.b1 - p.b0) * t;
      this.col[j4 + 3] = p.a0 * Math.min(1, t * 12) * (1 - t);
      this.siz[w] = p.s0 + (p.s1 - p.s0) * t;
      w++;
    }
    P.length = w;
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

const TRAILS = {
  arcane: { color: 0xe2c2ff, color1: 0x6a1ad0, size: 0.45, life: [0.2, 0.4], speed: 0.6, step: 0.3 },
  fire: { color: 0xfff0a0, color1: 0xff3a00, size: 0.75, life: [0.2, 0.45], speed: 1, step: 0.25, smoke: 0.35 },
  meteor: { color: 0xfff0a0, color1: 0xff2a00, size: 2.2, life: [0.3, 0.6], speed: 2, step: 0.3, smoke: 0.8 },
  bullet: { color: 0xffffff, color1: 0xffa020, size: 0.2, life: [0.06, 0.14], speed: 0, step: 0.25 },
  green: { color: 0xd0fff0, color1: 0x10a070, size: 0.4, life: [0.2, 0.4], speed: 0.8, step: 0.3 },
  frost: { color: 0xffffff, color1: 0x3aa0ff, size: 0.45, life: [0.2, 0.4], speed: 0.5, step: 0.3 },
  arrow: { color: 0xffffff, color1: 0x777777, size: 0.12, life: [0.1, 0.2], speed: 0, step: 0.4, alpha: 0.5 },
  rock: { color: 0xb59a76, color1: 0x5a4a38, size: 0.6, life: [0.3, 0.6], speed: 0.5, step: 0.5, additive: false, alpha: 0.6 },
  dark: { color: 0xff6af0, color1: 0x300040, size: 0.5, life: [0.2, 0.4], speed: 0.5, step: 0.3 },
};

const EXPLOSIONS = {
  fire: { core: 0xfff4c0, mid: 0xff6a00, smoke: 0x3a3330, light: 0xff7a2a },
  meteor: { core: 0xfff4c0, mid: 0xff4a00, smoke: 0x2a2420, light: 0xff6a20, debris: true },
  arcane: { core: 0xffe6ff, mid: 0x9a3cff, smoke: 0x2a1840, light: 0xb070ff },
  green: { core: 0xe0fff4, mid: 0x18d98a, smoke: 0x1e3a30, light: 0x40ffb0 },
  rock: { core: 0xe0d0b0, mid: 0x8a7458, smoke: 0x6b5a45, light: 0xffc080, debris: true },
  frost: { core: 0xffffff, mid: 0x40b0ff, smoke: 0x9ac8e8, light: 0x80d0ff },
};

export class Effects {
  constructor(scene, camera, floaterEl) {
    this.scene = scene;
    this.camera = camera;
    this.floaterEl = floaterEl;
    this.add = new ParticleSystem(scene, 7000, true);
    this.norm = new ParticleSystem(scene, 3000, false);
    this.meshes = [];
    this.floaters = [];
    this.shakeAmt = 0;
    this.lights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 2);
      l.userData = { t: 1, dur: 1, i0: 0 };
      scene.add(l);
      this.lights.push(l);
    }
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48); this.ringGeo.rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(1, 40); this.discGeo.rotateX(-Math.PI / 2);
    this.cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true); this.cylGeo.translate(0, 0.5, 0);
    this.spikeGeo = new THREE.ConeGeometry(0.35, 1, 5); this.spikeGeo.translate(0, 0.5, 0);
    this.slashGeo = new THREE.RingGeometry(1.0, 1.75, 28, 1, -Math.PI / 2 - 1.25, 2.5);
    this.v = new THREE.Vector3();
  }

  setScale(height, fov) {
    const s = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.add.mat.uniforms.uScale.value = s;
    this.norm.mat.uniforms.uScale.value = s;
  }

  // emissor genérico de partículas
  emit(o) {
    const sys = o.additive === false ? this.norm : this.add;
    const c0 = rgb(o.color ?? 0xffffff);
    const c1 = o.color1 !== undefined ? rgb(o.color1) : c0;
    const n = o.count ?? 8, spread = o.spread ?? 1, jit = o.jitter ?? 0;
    const a0 = o.alpha ?? 1, grav = o.gravity ?? 0, drag = o.drag ?? 0;
    for (let i = 0; i < n; i++) {
      let dx, dy, dz;
      if (o.dir) {
        dx = o.dir.x + (Math.random() * 2 - 1) * spread;
        dy = o.dir.y + (Math.random() * 2 - 1) * spread;
        dz = o.dir.z + (Math.random() * 2 - 1) * spread;
      } else {
        dx = Math.random() * 2 - 1; dy = Math.random() * 2 - 1; dz = Math.random() * 2 - 1;
      }
      if (o.flat) dy *= o.flat;
      const len = Math.hypot(dx, dy, dz) || 1, sp = pick(o.speed ?? [1, 3]);
      sys.spawn(
        o.pos.x + (Math.random() * 2 - 1) * jit,
        o.pos.y + (Math.random() * 2 - 1) * jit * (o.flat ?? 1),
        o.pos.z + (Math.random() * 2 - 1) * jit,
        (dx / len) * sp, (dy / len) * sp, (dz / len) * sp,
        pick(o.life ?? [0.4, 0.8]), pick(o.size ?? 0.5), o.size1 !== undefined ? pick(o.size1) : 0,
        c0, c1, a0, grav, drag,
      );
    }
  }

  // rastro entre duas posições (projéteis)
  trail(style, from, to) {
    const t = TRAILS[style];
    if (!t) return;
    const sys = t.additive === false ? this.norm : this.add;
    const c0 = rgb(t.color), c1 = rgb(t.color1);
    const d = from.distanceTo(to);
    const steps = Math.min(14, Math.max(1, Math.ceil(d / t.step)));
    for (let i = 0; i < steps; i++) {
      const k = i / steps;
      const x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k, z = from.z + (to.z - from.z) * k;
      const s = t.speed;
      sys.spawn(x, y, z, rnd(-s, s), rnd(-s, s), rnd(-s, s), pick(t.life), t.size * rnd(0.7, 1.2), 0, c0, c1, t.alpha ?? 1, 0, 1);
    }
    if (t.smoke && Math.random() < t.smoke) {
      this.norm.spawn(to.x, to.y, to.z, rnd(-0.3, 0.3), rnd(0.5, 1.2), rnd(-0.3, 0.3), rnd(0.6, 1.1), t.size * 0.6, t.size * 2, rgb(0x555555), rgb(0x333333), 0.35, 0, 1);
    }
  }

  flash(pos, color, intensity, dur, dist = 20) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.userData.t / l.userData.dur > best.userData.t / best.userData.dur) best = l;
    best.position.copy(pos);
    best.color.setHex(color);
    best.distance = dist;
    best.userData.t = 0; best.userData.dur = dur; best.userData.i0 = intensity;
    best.intensity = intensity;
  }

  addMesh(obj, dur, update) {
    this.scene.add(obj);
    this.meshes.push({ obj, t: 0, dur, update });
  }

  basicMat(color, opacity = 1, additive = true) {
    return new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
    });
  }

  ring(pos, color, radius, dur = 0.45, y = 0.15) {
    const m = new THREE.Mesh(this.ringGeo, this.basicMat(color, 0.9));
    m.position.copy(pos); m.position.y += y;
    this.addMesh(m, dur, (k) => {
      const s = 0.2 * radius + radius * 0.8 * (1 - Math.pow(1 - k, 3));
      m.scale.set(s, 1, s);
      m.material.opacity = 0.9 * (1 - k);
    });
  }

  telegraph(pos, radius, dur, color = 0xff2a2a) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(this.discGeo, this.basicMat(color, 0.18, false));
    const fill = new THREE.Mesh(this.discGeo, this.basicMat(color, 0.3, false));
    const edge = new THREE.Mesh(this.ringGeo, this.basicMat(color, 0.8, false));
    disc.scale.set(radius, 1, radius); edge.scale.set(radius, 1, radius);
    g.add(disc, fill, edge);
    g.position.copy(pos); g.position.y += 0.2;
    this.addMesh(g, dur, (k) => { fill.scale.set(radius * k, 1, radius * k); });
  }

  pillar(pos, color, radius, height, dur) {
    const m = new THREE.Mesh(this.cylGeo, this.basicMat(color, 0.6));
    m.position.copy(pos);
    this.addMesh(m, dur, (k) => {
      const r = radius * (1 - k * 0.7);
      m.scale.set(r, height * Math.min(1, k * 5), r);
      m.material.opacity = 0.6 * (1 - k);
    });
  }

  slash(center, yaw, color, scale = 1, tilt = 0) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.slashGeo, this.basicMat(color, 0.95));
    m.rotation.x = -Math.PI / 2;
    g.add(m);
    g.position.copy(center);
    g.rotation.set(0, yaw, tilt);
    this.addMesh(g, 0.25, (k) => {
      const s = scale * (0.75 + 0.45 * k);
      g.scale.set(s, s, s);
      m.rotation.z = -0.9 + k * 1.4;
      m.material.opacity = 0.95 * (1 - k);
    });
    this.emit({ pos: center, count: 8, speed: [2, 6], life: [0.15, 0.35], size: 0.25, color: 0xffffff, color1: color, drag: 4 });
  }

  spikes(pos, radius, count, color, getH) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = radius * (0.25 + Math.random() * 0.75);
      const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
      const m = new THREE.Mesh(this.spikeGeo, this.basicMat(color, 0.85, false));
      m.position.set(x, getH(x, z) - 0.2, z);
      m.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      const h = 1 + Math.random() * 1.6;
      const delay = (r / radius) * 0.25;
      this.addMesh(m, 1.4 + delay, (k, t) => {
        const kk = Math.max(0, t - delay);
        const grow = Math.min(1, kk * 8);
        const fade = t > 1.0 + delay ? 1 - (t - 1.0 - delay) / 0.4 : 1;
        m.scale.set(1, Math.max(0.01, h * grow * fade), 1);
        m.material.opacity = 0.85 * fade;
      });
    }
  }

  text(pos, str, cls = '') {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = str;
    this.floaterEl.appendChild(el);
    this.floaters.push({ el, pos: pos.clone(), t: 0, dur: cls.includes('big') ? 1.6 : 1.0, dx: (Math.random() - 0.5) * 30 });
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  // ---------- presets ----------
  muzzle(pos, dir, color = 0xffd36b, big = false) {
    this.emit({ pos, dir, spread: big ? 0.35 : 0.2, speed: [6, 16], life: [0.05, 0.14], size: big ? [0.5, 0.9] : [0.3, 0.55], size1: 0.05, color: 0xffffff, color1: color, count: big ? 22 : 9, drag: 6 });
    this.emit({ pos, dir, spread: 0.4, speed: [1, 3], life: [0.3, 0.6], size: 0.3, size1: 0.9, color: 0x999999, alpha: 0.3, additive: false, count: big ? 6 : 2 });
    this.flash(pos, color, big ? 60 : 30, 0.08, 14);
  }

  impact(pos, style) {
    switch (style) {
      case 'sparks':
        this.emit({ pos, count: 12, speed: [3, 9], gravity: 18, life: [0.2, 0.5], size: 0.18, size1: 0.02, color: 0xfff0a0, color1: 0xff7a00 });
        this.flash(pos, 0xffb040, 12, 0.08, 8);
        break;
      case 'arcane':
        this.emit({ pos, count: 20, speed: [2, 6], drag: 3, life: [0.25, 0.5], size: 0.45, size1: 0.05, color: 0xf0d8ff, color1: 0x7a2cff });
        this.ring(pos, 0xb070ff, 1.6, 0.3, 0);
        this.flash(pos, 0xb070ff, 20, 0.15, 10);
        break;
      case 'frost':
        this.emit({ pos, count: 18, speed: [2, 6], gravity: 6, life: [0.3, 0.6], size: 0.35, size1: 0.05, color: 0xffffff, color1: 0x3aa0ff });
        break;
      case 'arrow':
        this.emit({ pos, count: 6, speed: [1, 3], gravity: 8, life: [0.2, 0.4], size: 0.15, color: 0xdddddd, color1: 0x777777 });
        break;
      case 'hit':
      default:
        this.emit({ pos, count: 8, speed: [2, 6], gravity: 10, life: [0.15, 0.35], size: 0.22, size1: 0.02, color: 0xffffff, color1: 0xff4040 });
    }
  }

  explosion(pos, radius, style = 'fire') {
    const s = EXPLOSIONS[style] || EXPLOSIONS.fire;
    const up = { x: 0, y: 0.6, z: 0 };
    this.emit({ pos, count: Math.round(22 + radius * 6), speed: [radius * 1.2, radius * 3.2], drag: 5, life: [0.3, 0.6], size: [radius * 0.35, radius * 0.6], size1: 0.1, color: s.core, color1: s.mid });
    this.emit({ pos, count: 26, speed: [4, radius * 4], gravity: 9, life: [0.6, 1.2], size: 0.22, size1: 0.02, color: s.mid, color1: 0xff2200 });
    this.emit({ pos, dir: up, spread: 1, count: 14, speed: [1, radius * 0.9], drag: 2, life: [1.0, 2.2], size: radius * 0.35, size1: radius * 0.95, color: s.smoke, alpha: 0.5, additive: false });
    if (s.debris) this.emit({ pos, dir: { x: 0, y: 1, z: 0 }, spread: 0.9, count: 18, speed: [6, 14], gravity: 28, life: [0.8, 1.4], size: 0.35, size1: 0.3, color: 0x6b5440, color1: 0x3a2e24, additive: false });
    this.ring(pos, s.mid, radius * 1.15, 0.45);
    this.v.copy(pos); this.v.y += 1.2;
    this.flash(this.v, s.light, 60 + radius * 25, 0.4, radius * 7);
  }

  frostNova(pos, radius, getH) {
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2;
      this.add.spawn(pos.x, pos.y + 0.6, pos.z, Math.cos(a) * radius * 2.4, rnd(0, 1.5), Math.sin(a) * radius * 2.4, rnd(0.4, 0.6), 0.6, 0.1, rgb(0xffffff), rgb(0x3a9cff), 1, 0, 3.2);
    }
    this.ring(pos, 0x8fd8ff, radius, 0.5);
    this.ring(pos, 0xffffff, radius * 0.7, 0.35);
    this.spikes(pos, radius, 16, 0xbfeaff, getH);
    this.v.copy(pos); this.v.y += 1;
    this.flash(this.v, 0x80d0ff, 80, 0.4, radius * 4);
  }

  levelUp(pos) {
    this.pillar(pos, 0xffd76a, 1.6, 14, 1.2);
    this.ring(pos, 0xffd76a, 6, 0.8);
    this.emit({ pos, jitter: 1, dir: { x: 0, y: 1, z: 0 }, spread: 0.4, speed: [2, 7], life: [1, 1.6], size: 0.35, size1: 0.05, color: 0xfff6c0, color1: 0xffa000, count: 70, drag: 0.5 });
    this.v.copy(pos); this.v.y += 2;
    this.flash(this.v, 0xffd76a, 90, 1.0, 20);
  }

  heal(pos, color = 0x6aff8a) {
    this.emit({ pos, jitter: 0.6, dir: { x: 0, y: 1, z: 0 }, spread: 0.3, speed: [1.5, 3.5], life: [0.6, 1.0], size: 0.3, size1: 0.05, color: 0xe0ffe8, color1: color, count: 24 });
  }

  dust(pos, n = 4, color = 0xb8a582) {
    this.emit({ pos, jitter: 0.25, dir: { x: 0, y: 0.6, z: 0 }, spread: 1, speed: [0.5, 1.6], drag: 2, life: [0.5, 0.9], size: 0.25, size1: 0.8, color, alpha: 0.45, additive: false, count: n });
  }

  splash(pos, n = 8) {
    this.emit({ pos, jitter: 0.3, dir: { x: 0, y: 1, z: 0 }, spread: 0.5, speed: [2, 4.5], gravity: 14, life: [0.4, 0.7], size: 0.22, size1: 0.08, color: 0xe8f6ff, color1: 0x5aa8e0, alpha: 0.8, additive: false, count: n });
  }

  deathBurst(pos, color) {
    this.emit({ pos, jitter: 0.5, count: 26, speed: [2, 6], drag: 2, life: [0.4, 0.9], size: 0.4, size1: 0.05, color: 0xffffff, color1: color });
    this.emit({ pos, jitter: 0.6, dir: { x: 0, y: 1, z: 0 }, spread: 0.8, count: 10, speed: [0.5, 2], drag: 1, life: [1, 1.8], size: 0.6, size1: 1.6, color: 0x444444, alpha: 0.45, additive: false });
  }

  // ---------- atualização ----------
  update(dt, camera, width, height) {
    this.add.update(dt);
    this.norm.update(dt);

    for (const l of this.lights) {
      const u = l.userData;
      if (u.t >= u.dur) { l.intensity = 0; continue; }
      u.t += dt;
      const k = Math.min(1, u.t / u.dur);
      l.intensity = u.i0 * (1 - k) * (1 - k);
    }

    for (let i = this.meshes.length - 1; i >= 0; i--) {
      const m = this.meshes[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      m.update?.(k, m.t);
      if (m.t >= m.dur) {
        this.scene.remove(m.obj);
        m.obj.traverse((o) => o.material?.dispose());
        this.meshes.splice(i, 1);
      }
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      f.pos.y += dt * 1.4;
      if (f.t >= f.dur) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      this.v.copy(f.pos).project(camera);
      if (this.v.z > 1) { f.el.style.opacity = 0; continue; }
      const x = (this.v.x * 0.5 + 0.5) * width + f.dx * f.t;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      const k = f.t / f.dur;
      f.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3})`;
      f.el.style.opacity = k > 0.6 ? (1 - k) / 0.4 : 1;
    }

    this.shakeAmt *= Math.exp(-7 * dt);
    if (this.shakeAmt < 0.002) this.shakeAmt = 0;
  }
}
