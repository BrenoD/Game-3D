// Mundo aberto: terreno, água, vegetação, vila, céu e ciclo dia/noite.
import * as THREE from 'three';
import { fbm, mulberry32, smoothstep, lerp } from './noise.js';
import { heightAt, WORLD_HALF, WATER_LEVEL } from './terrain.js';

export { heightAt, WORLD_HALF, WATER_LEVEL };

const CELL = 16;

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.low = !!opts.low; // modo leve para celulares
    this.rand = mulberry32(42);
    this.grid = new Map();
    this.time = 0.3; // 0.25 = nascer do sol, 0.5 = meio-dia
    this.day = 1;
    this.dayLength = 360; // segundos por dia
    this.sunDir = new THREE.Vector3();

    this.buildLights();
    this.buildSky();
    this.buildTerrain();
    this.buildWater();
    this.buildVillage();
    this.buildVegetation();
  }

  // ---------- colisões simples (círculos num grid) ----------
  addCollider(x, z, r) {
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push({ x, z, r });
  }

  resolveCollision(pos, radius) {
    const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.grid.get(`${cx + i},${cz + j}`);
        if (!list) continue;
        for (const c of list) {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const min = c.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = c.x + (dx / d) * min;
            pos.z = c.z + (dz / d) * min;
          }
        }
      }
    }
  }

  findLandSpot(rand, minD, maxD, minH = 1.0, maxH = 22) {
    for (let i = 0; i < 500; i++) {
      const a = rand() * Math.PI * 2;
      const d = minD + rand() * (maxD - minD);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) > 250) continue;
      const h = heightAt(x, z);
      if (h > minH && h < maxH && this.slope(x, z) < 1.6) return new THREE.Vector3(x, h, z);
    }
    return new THREE.Vector3(minD, heightAt(minD, 0), 0);
  }

  slope(x, z) {
    const h = heightAt(x, z);
    return Math.abs(heightAt(x + 1.5, z) - h) + Math.abs(heightAt(x, z + 1.5) - h);
  }

  // ---------- luzes e céu ----------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a32, 1.0);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.low ? 1024 : 2048, this.low ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.scene.fog = this.low ? new THREE.Fog(0x8cc4ef, 45, 160) : new THREE.Fog(0x8cc4ef, 60, 210);
    this.scene.background = new THREE.Color(0x8cc4ef);
  }

  buildSky() {
    const n = 1500, pos = new Float32Array(n * 3);
    const r = mulberry32(9);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * 600;
      pos[i * 3 + 1] = Math.abs(u) * 600;
      pos[i * 3 + 2] = Math.sin(a) * s * 600;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }));
    this.scene.add(this.sunMesh, this.moonMesh);

    this.skyDay = new THREE.Color(0x8cc4ef);
    this.skyNight = new THREE.Color(0x070b1c);
    this.skySunset = new THREE.Color(0xf08a4b);
    this.sunColorDay = new THREE.Color(0xfff1d6);
    this.sunColorSet = new THREE.Color(0xffa060);
    this.moonColor = new THREE.Color(0x7f98ff);
    this.skyColor = new THREE.Color();
  }

  // ---------- terreno ----------
  buildTerrain() {
    const size = WORLD_HALF * 2, seg = 220;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const sand = new THREE.Color(0xd8c48a), wetSand = new THREE.Color(0x9c8a5c);
    const grass = new THREE.Color(0x6aa83f), grass2 = new THREE.Color(0x3d7a2c);
    const dirt = new THREE.Color(0x8a7550), rock = new THREE.Color(0x7d7468), snow = new THREE.Color(0xf2f4f8);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const s = this.slope(x, z);
      const v = fbm(x * 0.04, z * 0.04, 2);
      if (h < -0.5) c.copy(wetSand);
      else if (h < 1.3) c.copy(sand);
      else {
        c.copy(grass2).lerp(grass, smoothstep(0.35, 0.65, v));
        const d = Math.hypot(x, z);
        if (d < 26) c.lerp(dirt, smoothstep(26, 10, d) * 0.7);
        c.lerp(rock, Math.max(smoothstep(17, 26, h), smoothstep(2.0, 3.6, s)));
        c.lerp(snow, smoothstep(34, 42, h));
      }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x2f7fb0, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.2 });
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.position.y = WATER_LEVEL;
    this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  // ---------- vegetação e pedras (instanciadas) ----------
  buildVegetation() {
    const r = this.rand;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();

    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 2.4, 6); trunkGeo.translate(0, 1.2, 0);
    const pineLow = new THREE.ConeGeometry(1.7, 3.6, 7); pineLow.translate(0, 3.4, 0);
    const pineTop = new THREE.ConeGeometry(1.2, 2.8, 7); pineTop.translate(0, 5.2, 0);
    const roundGeo = new THREE.IcosahedronGeometry(2.0, 0); roundGeo.translate(0, 3.9, 0);
    const flat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });

    const PINES = 750, ROUNDS = 550;
    const trunks = new THREE.InstancedMesh(trunkGeo, flat(0x6b4a2f), PINES + ROUNDS);
    const lows = new THREE.InstancedMesh(pineLow, flat(0xffffff), PINES);
    const tops = new THREE.InstancedMesh(pineTop, flat(0xffffff), PINES);
    const rounds = new THREE.InstancedMesh(roundGeo, flat(0xffffff), ROUNDS);
    let ti = 0, pi = 0, ri = 0;

    const okTree = (x, z) => {
      const h = heightAt(x, z);
      if (h < 1.6 || h > 30) return false;
      if (Math.hypot(x, z) < 32) return false;
      if (this.slope(x, z) > 2.4) return false;
      return true;
    };
    let tries = 0;
    while ((pi < PINES || ri < ROUNDS) && tries++ < 60000) {
      const x = (r() * 2 - 1) * (WORLD_HALF - 10), z = (r() * 2 - 1) * (WORLD_HALF - 10);
      const forest = fbm(x * 0.012 + 7, z * 0.012 - 3, 3);
      if (forest < 0.5 && r() > 0.12) continue;
      if (!okTree(x, z)) continue;
      const h = heightAt(x, z);
      const sc = 0.75 + r() * 0.8;
      q.setFromAxisAngle(up, r() * Math.PI * 2);
      p.set(x, h - 0.2, z);
      s.set(sc, sc * (0.85 + r() * 0.4), sc);
      m4.compose(p, q, s);
      const pine = h > 12 || r() < 0.55;
      if (pine && pi < PINES) {
        trunks.setMatrixAt(ti++, m4);
        lows.setMatrixAt(pi, m4); tops.setMatrixAt(pi, m4);
        col.setHSL(0.33 + r() * 0.05, 0.45, 0.22 + r() * 0.08);
        lows.setColorAt(pi, col); tops.setColorAt(pi, col.offsetHSL(0, 0, 0.04));
        pi++;
      } else if (!pine && ri < ROUNDS) {
        trunks.setMatrixAt(ti++, m4);
        rounds.setMatrixAt(ri, m4);
        const autumn = r() < 0.18;
        col.setHSL(autumn ? 0.07 + r() * 0.06 : 0.25 + r() * 0.07, autumn ? 0.7 : 0.5, 0.32 + r() * 0.1);
        rounds.setColorAt(ri, col);
        ri++;
      } else continue;
      this.addCollider(x, z, 0.55 * sc);
    }
    trunks.count = ti; lows.count = pi; tops.count = pi; rounds.count = ri;
    for (const im of [trunks, lows, tops, rounds]) {
      im.castShadow = true; im.receiveShadow = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.scene.add(im);
    }

    // pedras
    const ROCKS = 420;
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), flat(0xffffff), ROCKS);
    let k = 0; tries = 0;
    while (k < ROCKS && tries++ < 20000) {
      const x = (r() * 2 - 1) * (WORLD_HALF - 10), z = (r() * 2 - 1) * (WORLD_HALF - 10);
      const h = heightAt(x, z);
      if (h < -3 || Math.hypot(x, z) < 30) continue;
      const big = r() < 0.25;
      const sx = (big ? 1.8 : 0.5) + r() * (big ? 2 : 0.9);
      s.set(sx, sx * (0.5 + r() * 0.5), sx * (0.7 + r() * 0.6));
      q.setFromEuler(new THREE.Euler(r() * 0.5, r() * Math.PI * 2, r() * 0.5));
      p.set(x, h - s.y * 0.3, z);
      m4.compose(p, q, s);
      rocks.setMatrixAt(k, m4);
      col.setHSL(0.08, 0.06 + r() * 0.06, 0.35 + r() * 0.2);
      rocks.setColorAt(k, col);
      if (sx > 1.0) this.addCollider(x, z, sx * 0.85);
      k++;
    }
    rocks.count = k;
    rocks.castShadow = true; rocks.receiveShadow = true;
    rocks.instanceColor.needsUpdate = true;
    this.scene.add(rocks);

    // tufos de grama e flores
    const GRASS = this.low ? 3500 : 9000;
    const grassGeo = new THREE.ConeGeometry(0.12, 0.55, 3); grassGeo.translate(0, 0.27, 0);
    const grassM = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), GRASS);
    const FLOWERS = this.low ? 700 : 1600;
    const flowerM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x111111 }), FLOWERS);
    const flowerCols = [0xff5a6e, 0xffd84a, 0xffffff, 0xb07cff, 0x5ab8ff];
    let gi = 0, fi = 0; tries = 0;
    while ((gi < GRASS || fi < FLOWERS) && tries++ < 80000) {
      const x = (r() * 2 - 1) * (WORLD_HALF - 15), z = (r() * 2 - 1) * (WORLD_HALF - 15);
      const h = heightAt(x, z);
      if (h < 1.5 || h > 17 || this.slope(x, z) > 1.8) continue;
      if (gi < GRASS) {
        const sc = 0.7 + r() * 0.9;
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4));
        p.set(x, h - 0.05, z); s.set(sc, sc, sc);
        m4.compose(p, q, s);
        grassM.setMatrixAt(gi, m4);
        col.setHSL(0.24 + r() * 0.08, 0.55, 0.3 + r() * 0.15);
        grassM.setColorAt(gi, col);
        gi++;
      }
      if (fi < FLOWERS && r() < 0.2) {
        p.set(x + 0.4, h + 0.35, z + 0.3); s.set(1, 1, 1); q.identity();
        m4.compose(p, q, s);
        flowerM.setMatrixAt(fi, m4);
        flowerM.setColorAt(fi, col.setHex(flowerCols[(r() * flowerCols.length) | 0]));
        fi++;
      }
    }
    grassM.count = gi; flowerM.count = fi;
    grassM.receiveShadow = true;
    grassM.instanceColor.needsUpdate = true; flowerM.instanceColor.needsUpdate = true;
    this.scene.add(grassM, flowerM);
  }

  // ---------- vila ----------
  buildVillage() {
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, ...o });
    const wallM = std(0xe8dcc0), roofM = std(0x9a3b2a), woodM = std(0x6b4a2f), doorM = std(0x4a3020), winM = std(0xffd98a, { emissive: 0xffb040, emissiveIntensity: 0.0 });
    this.windowMat = winM;
    const add = (mesh, parent) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

    const angles = [0.35, 1.45, 2.55, 3.75, 4.95];
    this.houses = [];
    angles.forEach((a, i) => {
      const x = Math.cos(a) * 21, z = Math.sin(a) * 21;
      const g = new THREE.Group();
      g.position.set(x, heightAt(x, z), z);
      g.rotation.y = Math.atan2(-x, -z);
      const w = 6 + (i % 2), dpt = 5;
      add(new THREE.Mesh(new THREE.BoxGeometry(w, 3.6, dpt), wallM), g).position.y = 1.8;
      const roof = add(new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, dpt) * 0.78, 2.8, 4), roofM), g);
      roof.position.y = 5.0; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, dpt / w + 0.15);
      add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.15), doorM), g).position.set(0, 1.1, dpt / 2 + 0.05);
      for (const sx of [-1, 1]) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.12), winM), g).position.set(sx * (w / 2 - 1.2), 2.1, dpt / 2 + 0.05);
      }
      // vigas de madeira
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), woodM), g).position.set(sx * w / 2, 1.8, sz * dpt / 2);
      }
      this.scene.add(g);
      this.houses.push(g);
      // colisão aproximada da casa
      const right = new THREE.Vector3(Math.cos(g.rotation.y), 0, -Math.sin(g.rotation.y));
      for (const o of [-1.6, 0, 1.6]) this.addCollider(x + right.x * o, z + right.z * o, 2.7);
    });

    // fogueira central
    const fire = new THREE.Group();
    const stoneM = std(0x777777);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), stoneM), fire);
      s.position.set(Math.cos(a) * 1.1, 0.15, Math.sin(a) * 1.1);
    }
    for (let i = 0; i < 4; i++) {
      const log = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6), woodM), fire);
      log.rotation.z = Math.PI / 2 - 0.35; log.rotation.y = (i / 4) * Math.PI; log.position.y = 0.3;
    }
    fire.position.set(0, heightAt(0, 0), 0);
    this.scene.add(fire);
    this.firePos = new THREE.Vector3(0, fire.position.y + 0.5, 0);
    this.fireLight = new THREE.PointLight(0xff8a3a, 30, 30, 1.6);
    this.fireLight.position.set(0, fire.position.y + 1.5, 0);
    this.scene.add(this.fireLight);
    this.addCollider(0, 0, 1.4);

    // poço
    const well = new THREE.Group();
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.0, 10), stoneM), well).position.y = 0.5;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 10), std(0x2a5d8a)), well).position.y = 0.95;
    for (const sx of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), woodM), well).position.set(sx * 0.95, 1.6, 0);
    const wr = add(new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), roofM), well); wr.position.y = 3.0; wr.rotation.y = Math.PI / 4;
    well.position.set(-9, heightAt(-9, 7), 7);
    this.scene.add(well);
    this.addCollider(-9, 7, 1.3);
  }

  // ---------- atualização ----------
  update(dt, focus, camera, fx) {
    this.time += dt / this.dayLength;
    if (this.time >= 1) { this.time -= 1; this.day++; }

    const ang = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const daylight = smoothstep(-0.12, 0.3, this.sunDir.y);
    this.daylight = daylight;
    const night = this.sunDir.y < 0;
    const lightDir = night ? this.sunDir.clone().negate() : this.sunDir;

    this.sun.position.copy(focus).addScaledVector(lightDir, 120);
    this.sun.target.position.copy(focus);
    const sunset = smoothstep(0.35, 0.0, Math.abs(this.sunDir.y));
    if (night) {
      this.sun.color.copy(this.moonColor);
      this.sun.intensity = 0.45;
    } else {
      this.sun.color.copy(this.sunColorDay).lerp(this.sunColorSet, sunset);
      this.sun.intensity = lerp(0.45, 2.8, daylight);
    }
    this.hemi.intensity = lerp(0.38, 1.0, daylight);

    this.skyColor.copy(this.skyNight).lerp(this.skyDay, daylight).lerp(this.skySunset, sunset * 0.55);
    this.scene.background.copy(this.skyColor);
    this.scene.fog.color.copy(this.skyColor);
    this.starMat.opacity = 1 - daylight;

    this.stars.position.copy(camera.position);
    this.sunMesh.position.copy(camera.position).addScaledVector(this.sunDir, 500);
    this.moonMesh.position.copy(camera.position).addScaledVector(this.sunDir, -500);

    this.windowMat.emissiveIntensity = (1 - daylight) * 1.6;

    // fogueira
    this.fireLight.intensity = (18 + Math.random() * 10) * (0.5 + (1 - daylight) * 1.2);
    if (fx) {
      fx.emit({ pos: this.firePos, jitter: 0.35, dir: { x: 0, y: 1, z: 0 }, spread: 0.25, speed: [1.5, 3], life: [0.4, 0.9], size: [0.5, 0.9], size1: 0.05, color: 0xffe08a, color1: 0xff3000, count: 2 });
      if (Math.random() < 0.3) fx.emit({ pos: this.firePos, jitter: 0.2, dir: { x: 0, y: 1, z: 0 }, spread: 0.15, speed: [1.5, 2.5], life: [1.5, 2.5], size: 0.5, size1: 1.6, color: 0x555555, alpha: 0.25, additive: false, count: 1 });
    }
  }

  clockText() {
    const hours = (this.time * 24) % 24;
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
    return `Dia ${this.day} — ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
