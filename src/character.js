// Modelos de personagens feitos com primitivas (low-poly) e suas animações procedurais.
import * as THREE from 'three';
import { lerp } from './noise.js';

const geoCache = new Map();
function box(w, h, d) {
  const k = `${w},${h},${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...extra });
}
function part(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function collectMats(root) {
  const mats = new Set();
  root.traverse((o) => { if (o.isMesh && o.material.emissive) mats.add(o.material); });
  return [...mats].map((m) => ({ m, base: m.emissive.clone(), baseI: m.emissiveIntensity }));
}

// ---------- humanoide ----------
export function buildHumanoid(o) {
  const skin = mat(o.skin ?? 0xe0b48a), body = mat(o.body), legs = mat(o.legs ?? o.body);
  const accent = mat(o.accent ?? 0x333333, { metalness: 0.3, roughness: 0.5 });
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(part(box(0.72, 0.8, 0.42), body, 0, 0.45, 0));
  torso.add(part(box(0.76, 0.12, 0.46), accent, 0, 0.1, 0));
  if (o.robe) torso.add(part(box(0.78, 0.7, 0.48), body, 0, -0.25, 0));

  const head = new THREE.Group();
  head.position.y = 0.9;
  torso.add(head);
  head.add(part(box(0.46, 0.46, 0.46), skin, 0, 0.18, 0));
  const eyeM = mat(o.eye ?? 0x111111, o.eyeGlow ? { emissive: o.eye, emissiveIntensity: 2.5 } : {});
  head.add(part(box(0.08, 0.08, 0.04), eyeM, -0.11, 0.22, 0.23));
  head.add(part(box(0.08, 0.08, 0.04), eyeM, 0.11, 0.22, 0.23));
  buildHat(o.hat, head, accent, body, skin);

  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.48, 0.78, 0);
    torso.add(g);
    g.add(part(box(0.2, 0.42, 0.22), body, 0, -0.18, 0));
    g.add(part(box(0.18, 0.36, 0.2), skin, 0, -0.55, 0));
    const hand = new THREE.Group();
    hand.position.y = -0.72;
    g.add(hand);
    return { g, hand };
  };
  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.19, 0.02, 0);
    hips.add(g);
    g.add(part(box(0.26, 0.9, 0.28), legs, 0, -0.45, 0));
    g.add(part(box(0.28, 0.14, 0.36), accent, 0, -0.88, 0.05));
    return g;
  };
  const L = arm(-1), R = arm(1);
  if (o.pauldrons) {
    L.g.add(part(box(0.32, 0.18, 0.34), accent, 0, 0.05, 0));
    R.g.add(part(box(0.32, 0.18, 0.34), accent, 0, 0.05, 0));
  }
  if (o.cape) {
    const cape = part(box(0.66, 1.1, 0.05), mat(o.cape), 0, 0.25, -0.25);
    cape.rotation.x = 0.12;
    torso.add(cape);
  }

  const rig = {
    kind: 'humanoid', root, hips, torso, head,
    armL: L.g, armR: R.g, handR: R.hand, handL: L.hand,
    legL: leg(-1), legR: leg(1),
    attack: 0, attackStyle: 'swing', weaponType: o.weapon,
  };
  buildWeapon(o.weapon, rig, o);
  root.scale.setScalar(o.scale ?? 1);
  rig.mats = collectMats(root);
  return rig;
}

function buildHat(type, head, accent, body, skin) {
  switch (type) {
    case 'helmet': {
      head.add(part(box(0.52, 0.22, 0.52), accent, 0, 0.38, 0));
      head.add(part(box(0.08, 0.2, 0.3), accent, 0, 0.56, 0));
      break;
    }
    case 'wizard': {
      const m = mat(0x3b2a7a);
      const brim = part(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 10), m, 0, 0.42, 0);
      const cone = part(new THREE.ConeGeometry(0.3, 0.8, 8), m, 0, 0.82, -0.04);
      cone.rotation.x = -0.25;
      head.add(brim, cone);
      break;
    }
    case 'cap': {
      const m = mat(0x4a3424);
      head.add(part(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 10), m, 0, 0.42, 0));
      head.add(part(new THREE.CylinderGeometry(0.26, 0.3, 0.26, 10), m, 0, 0.55, 0));
      break;
    }
    case 'ears': {
      const l = part(new THREE.ConeGeometry(0.09, 0.4, 4), skin, -0.32, 0.25, 0);
      const r = part(new THREE.ConeGeometry(0.09, 0.4, 4), skin, 0.32, 0.25, 0);
      l.rotation.z = Math.PI / 2 + 0.3; r.rotation.z = -Math.PI / 2 - 0.3;
      head.add(l, r);
      break;
    }
    case 'beard': {
      const w = mat(0xeeeeee);
      head.add(part(box(0.42, 0.34, 0.12), w, 0, -0.05, 0.22));
      head.add(part(box(0.48, 0.1, 0.48), w, 0, 0.42, 0));
      break;
    }
    case 'horns': {
      const m = mat(0x3a3a3a);
      const l = part(new THREE.ConeGeometry(0.08, 0.35, 5), m, -0.2, 0.5, 0);
      const r = part(new THREE.ConeGeometry(0.08, 0.35, 5), m, 0.2, 0.5, 0);
      l.rotation.z = 0.5; r.rotation.z = -0.5;
      head.add(l, r);
      break;
    }
    case 'hood': {
      head.add(part(box(0.54, 0.3, 0.54), body, 0, 0.36, -0.02));
      break;
    }
  }
}

function buildWeapon(type, rig, o) {
  const g = new THREE.Group();
  rig.handR.add(g);
  rig.weapon = g;
  rig.muzzle = new THREE.Object3D();
  g.add(rig.muzzle);
  const steel = mat(0xd8dde6, { metalness: 0.8, roughness: 0.25 });
  const wood = mat(0x6b4a2f);
  const gold = mat(0xd4af37, { metalness: 0.7, roughness: 0.3 });
  switch (type) {
    case 'sword':
      g.add(part(box(0.07, 0.24, 0.07), wood, 0, 0, 0));
      g.add(part(box(0.38, 0.06, 0.1), gold, 0, -0.13, 0));
      g.add(part(box(0.1, 1.1, 0.035), steel, 0, -0.72, 0));
      rig.muzzle.position.y = -1.25;
      g.rotation.x = -1.9;
      rig.weaponBase = -1.9;
      break;
    case 'staff': {
      g.add(part(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 6), wood, 0, 0.25, 0.08));
      const orbM = mat(o.orbColor ?? 0xb070ff, { emissive: o.orbColor ?? 0xb070ff, emissiveIntensity: 2.2 });
      const orb = part(new THREE.IcosahedronGeometry(0.17, 0), orbM, 0, 1.36, 0.08);
      g.add(orb);
      g.add(part(new THREE.TorusGeometry(0.16, 0.03, 4, 8), gold, 0, 1.2, 0.08));
      rig.orb = orb;
      rig.muzzle.position.set(0, 1.36, 0.08);
      rig.weaponBase = 0;
      break;
    }
    case 'gun': {
      const dark = mat(0x2c2c34, { metalness: 0.6, roughness: 0.4 });
      g.add(part(box(0.1, 0.22, 0.12), wood, 0, 0.05, 0));
      g.add(part(box(0.15, 0.36, 0.2), dark, 0, -0.18, 0));
      g.add(part(box(0.08, 0.7, 0.08), dark, 0, -0.62, 0));
      const runeM = mat(0xffcf40, { emissive: 0xffb020, emissiveIntensity: 2 });
      g.add(part(box(0.16, 0.06, 0.16), runeM, 0, -0.5, 0));
      g.add(part(box(0.16, 0.06, 0.16), runeM, 0, -0.85, 0));
      rig.muzzle.position.y = -1.0;
      g.rotation.x = -1.57;
      rig.weaponBase = -1.57;
      break;
    }
    case 'club':
      g.add(part(box(0.12, 0.3, 0.12), wood, 0, 0, 0));
      g.add(part(box(0.22, 0.6, 0.22), wood, 0, -0.45, 0));
      g.add(part(box(0.26, 0.08, 0.26), steel, 0, -0.6, 0));
      g.rotation.x = -1.9;
      rig.weaponBase = -1.9;
      break;
    case 'axe':
      g.add(part(box(0.1, 1.1, 0.1), wood, 0, -0.35, 0));
      g.add(part(box(0.06, 0.5, 0.55), steel, 0, -0.75, 0.25));
      g.rotation.x = -1.9;
      rig.weaponBase = -1.9;
      break;
    case 'bow': {
      const bow = part(new THREE.TorusGeometry(0.6, 0.035, 4, 12, Math.PI), wood, 0, 0, 0.1);
      bow.rotation.z = Math.PI / 2;
      g.add(bow);
      g.add(part(box(0.01, 1.2, 0.01), mat(0xeeeeee), 0, 0, 0.1));
      rig.muzzle.position.set(0, 0, 0.3);
      rig.weaponBase = 0;
      break;
    }
    default:
      rig.weaponBase = 0;
  }
}

// estilo: 'swing' (corte), 'cast' (magia), 'aim' (tiro), 'spin', 'slam'
export function animateHumanoid(rig, phase, move, t) {
  const s = Math.sin(phase) * 0.75 * move;
  rig.legL.rotation.x = s;
  rig.legR.rotation.x = -s;
  rig.armL.rotation.x = -s * 0.8;
  rig.armL.rotation.z = 0;
  rig.hips.position.y = 0.95 + Math.abs(Math.cos(phase)) * 0.07 * move;
  // respiração
  rig.torso.rotation.x = Math.sin(t * 2) * 0.02 + move * 0.08;
  rig.torso.rotation.y = 0;

  const a = rig.attack;
  let rx = s * 0.8, rz = 0;
  if (a > 0) {
    switch (rig.attackStyle) {
      case 'swing':
        rx = a < 0.3 ? lerp(0, -2.7, a / 0.3) : lerp(-2.7, 0.3, Math.min(1, (a - 0.3) / 0.45));
        rig.torso.rotation.y = a < 0.3 ? lerp(0, 0.4, a / 0.3) : lerp(0.4, -0.5, Math.min(1, (a - 0.3) / 0.45));
        break;
      case 'cast':
        rx = -1.6 + Math.sin(a * Math.PI) * -0.3;
        rig.armL.rotation.x = -1.3 * Math.sin(a * Math.PI);
        rig.armL.rotation.z = 0.3 * Math.sin(a * Math.PI);
        break;
      case 'aim':
        rx = -1.5 + (a < 0.15 ? -0.4 * (1 - a / 0.15) : 0);
        rig.armL.rotation.x = -1.3;
        rig.armL.rotation.z = -0.5;
        break;
      case 'raise':
        rx = -2.9; rz = 0.3;
        rig.armL.rotation.x = -2.9; rig.armL.rotation.z = -0.3;
        break;
      case 'spin':
        rx = -1.5; rz = 1.2;
        rig.armL.rotation.z = -1.2;
        break;
      case 'slam':
        rx = a < 0.6 ? lerp(0, -3.0, a / 0.6) : lerp(-3.0, -0.6, (a - 0.6) / 0.4);
        rig.armL.rotation.x = rx;
        break;
    }
  } else if (rig.weaponType === 'gun') {
    rx = -0.3 + s * 0.3;
  }
  rig.armR.rotation.x = rx;
  rig.armR.rotation.z = rz;
  // a arma de fogo fica sempre apontando para frente
  if (rig.weaponType === 'gun') rig.weapon.rotation.x = rig.weaponBase - rx;
  if (rig.orb) rig.orb.rotation.y = t * 3;
}

// ---------- lobo ----------
export function buildWolf(o = {}) {
  const fur = mat(o.color ?? 0x6e6a66), dark = mat(0x3a3836);
  const eyeM = mat(0xffd040, { emissive: 0xffc020, emissiveIntensity: 2 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.85;
  root.add(body);
  body.add(part(box(0.62, 0.58, 1.35), fur, 0, 0, 0));
  body.add(part(box(0.7, 0.66, 0.5), fur, 0, 0.06, 0.38));
  const head = new THREE.Group();
  head.position.set(0, 0.25, 0.78);
  body.add(head);
  head.add(part(box(0.46, 0.42, 0.46), fur, 0, 0, 0));
  head.add(part(box(0.26, 0.2, 0.36), dark, 0, -0.08, 0.36));
  head.add(part(box(0.07, 0.07, 0.03), eyeM, -0.12, 0.08, 0.24));
  head.add(part(box(0.07, 0.07, 0.03), eyeM, 0.12, 0.08, 0.24));
  const earL = part(new THREE.ConeGeometry(0.08, 0.22, 4), dark, -0.14, 0.3, -0.05);
  const earR = part(new THREE.ConeGeometry(0.08, 0.22, 4), dark, 0.14, 0.3, -0.05);
  head.add(earL, earR);
  const tail = part(box(0.14, 0.14, 0.7), fur, 0, 0.15, -0.95);
  tail.rotation.x = 0.5;
  body.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.22, 0.45], [0.22, 0.45], [-0.22, -0.45], [0.22, -0.45]]) {
    const g = new THREE.Group();
    g.position.set(x, -0.15, z);
    body.add(g);
    g.add(part(box(0.16, 0.62, 0.18), fur, 0, -0.3, 0));
    legs.push(g);
  }
  root.scale.setScalar(o.scale ?? 1);
  const rig = { kind: 'wolf', root, body, head, tail, legs, attack: 0 };
  rig.mats = collectMats(root);
  return rig;
}

export function animateWolf(rig, phase, move, t) {
  const s = Math.sin(phase) * 0.9 * move;
  rig.legs[0].rotation.x = s; rig.legs[3].rotation.x = s;
  rig.legs[1].rotation.x = -s; rig.legs[2].rotation.x = -s;
  rig.body.position.y = 0.85 + Math.abs(Math.cos(phase)) * 0.08 * move;
  rig.tail.rotation.y = Math.sin(t * 6) * 0.4;
  const a = rig.attack;
  rig.head.rotation.x = a > 0 ? -Math.sin(a * Math.PI) * 0.6 : Math.sin(t * 1.5) * 0.05;
  rig.head.position.z = 0.78 + (a > 0 ? Math.sin(a * Math.PI) * 0.35 : 0);
}

export function animateRig(rig, phase, move, t) {
  if (rig.kind === 'wolf') animateWolf(rig, phase, move, t);
  else animateHumanoid(rig, phase, move, t);
}

// brilho de dano / congelamento
export function setRigTint(rig, hit, frozen) {
  for (const e of rig.mats) {
    if (hit > 0) { e.m.emissive.setHex(0xffffff); e.m.emissiveIntensity = 0.9; }
    else if (frozen > 0) { e.m.emissive.setHex(0x2a7ad8); e.m.emissiveIntensity = 0.8; }
    else { e.m.emissive.copy(e.base); e.m.emissiveIntensity = e.baseI; }
  }
}
