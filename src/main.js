// Ponto de entrada: monta a cena, conecta os sistemas, trata entrada (teclado/mouse/toque) e roda o loop.
import * as THREE from 'three';
import { World } from './world.js';
import { heightAt } from './terrain.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { NPCs } from './npcs.js';
import { Quests } from './quests.js';
import { UI } from './ui.js';
import { initAudio, sfx } from './audio.js';

const params = new URLSearchParams(location.search);
const isTouch = params.has('touch') || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const debug = params.has('debug');
document.body.classList.toggle('touch', isTouch);

// ---------- renderização ----------
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

const game = { scene, camera, renderer, running: false, timers: [], isTouch };
game.world = new World(scene, { low: isTouch });
game.fx = new Effects(scene, camera, document.getElementById('floaters'));
game.ui = new UI(game);
game.projectiles = new Projectiles(game);
game.enemies = new EnemyManager(game);
game.quests = new Quests(game);
game.npcs = new NPCs(game);
game.enemies.setup();

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  game.fx.setScale(innerHeight * renderer.getPixelRatio(), camera.fov);
}
addEventListener('resize', resize);
resize();

// ---------- orbes de cura ----------
const orbGeo = new THREE.IcosahedronGeometry(0.3, 1);
const orbMat = new THREE.MeshBasicMaterial({ color: 0x6aff8a });
game.orbs = {
  list: [],
  spawn(pos) {
    const mesh = new THREE.Mesh(orbGeo, orbMat);
    mesh.position.copy(pos);
    scene.add(mesh);
    this.list.push({ mesh, pos: mesh.position, base: heightAt(pos.x, pos.z) + 0.8, t: Math.random() * 6, life: 40 });
  },
  update(dt) {
    const p = game.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.t += dt; o.life -= dt;
      o.pos.y = o.base + Math.sin(o.t * 3) * 0.2;
      o.mesh.rotation.y += dt * 2;
      const d = o.pos.distanceTo(p.pos.clone().setY(p.pos.y + 0.8));
      if (d < 6 && !p.dead) o.pos.lerp(p.pos.clone().setY(p.pos.y + 1), Math.min(1, dt * (8 - d)));
      if (Math.random() < 0.15) game.fx.emit({ pos: o.pos, jitter: 0.2, dir: { x: 0, y: 1, z: 0 }, spread: 0.3, speed: [0.5, 1.2], life: [0.4, 0.7], size: 0.2, color: 0xc0ffd0, color1: 0x20c050, count: 1 });
      if ((d < 1.4 && !p.dead) || o.life <= 0) {
        if (o.life > 0) {
          p.heal(p.maxHp * 0.2);
          p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.2);
          game.sfx('pickup');
        }
        scene.remove(o.mesh);
        this.list.splice(i, 1);
      }
    }
  },
};

// ---------- API usada pelas habilidades ----------
const tmp = new THREE.Vector3();
game.sfx = (name, pos, vol = 1) => {
  if (!sfx[name]) return;
  let v = vol;
  if (pos && game.player) {
    v *= Math.max(0, 1 - pos.distanceTo(game.player.pos) / 70);
    if (v < 0.02) return;
  }
  sfx[name](v);
};
game.later = (delay, fn) => game.timers.push({ t: delay, fn });

game.aim = (range) => {
  const p = game.player;
  const flat = new THREE.Vector3(-Math.sin(p.camYaw), 0, -Math.cos(p.camYaw));
  const eye = p.pos.clone(); eye.y += 1.4;
  let best = null, bestScore = Infinity;
  for (const e of game.enemies.active) {
    if (e.dead) continue;
    const c = e.center();
    tmp.subVectors(c, eye);
    const d = tmp.length();
    if (d > range) continue;
    const fl = Math.hypot(tmp.x, tmp.z) || 1;
    const cos = (tmp.x * flat.x + tmp.z * flat.z) / fl;
    const ang = Math.acos(Math.min(1, Math.max(-1, cos)));
    const cone = isTouch ? 0.8 : 0.42; // no celular a mira automática é mais generosa
    if (ang > cone) continue;
    const score = ang * 25 + d;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (best) {
    const dir = best.center().sub(eye).normalize();
    const f = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    return { dir, flat: f, target: best };
  }
  return { dir: flat.clone(), flat, target: null };
};

game.castOrigin = (p, flat) => {
  const o = p.pos.clone();
  o.y += 1.45;
  o.addScaledVector(flat, 0.9);
  o.x += flat.z * -0.35; o.z += flat.x * 0.35;
  return o;
};

game.spawnProjectile = (o) => game.projectiles.spawn(o);

game.damageEnemy = (e, dmg, opts = {}) => {
  const crit = Math.random() < (game.player?.crit ?? 0.12);
  const amount = Math.max(1, Math.round(dmg * (crit ? 2 : 1) * (0.9 + Math.random() * 0.2)));
  e.takeDamage(amount, opts, crit);
};

game.hitArc = (origin, dir, range, halfAngle, dmg, opts = {}) => {
  let n = 0;
  for (const e of [...game.enemies.active]) {
    if (e.dead) continue;
    const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
    const d = Math.hypot(dx, dz) - e.type.radius;
    if (d > range || Math.abs(e.pos.y - origin.y) > 4) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / (Math.hypot(dx, dz) || 1))));
    if (ang > halfAngle && d > 0.8) continue;
    game.damageEnemy(e, dmg, { ...opts, from: origin });
    n++;
  }
  return n;
};

game.hitRadius = (center, radius, dmg, opts = {}) => {
  let n = 0;
  for (const e of [...game.enemies.active]) {
    if (e.dead) continue;
    const d = Math.hypot(e.pos.x - center.x, e.pos.z - center.z) - e.type.radius;
    if (d > radius || Math.abs(e.pos.y - center.y) > 5) continue;
    game.damageEnemy(e, dmg, { ...opts, from: center });
    n++;
  }
  return n;
};

game.explode = (pos, radius, dmg, style, opts = {}) => {
  game.fx.explosion(pos, radius, style);
  game.sfx('explosion', pos);
  const d = pos.distanceTo(game.player.pos);
  game.fx.shake(Math.max(0, 0.5 - d * 0.015) * Math.min(1.5, radius / 5));
  return game.hitRadius(pos, radius, dmg, { knock: 10, ...opts });
};

game.onEnemyKilled = (e) => {
  const p = game.player;
  p.kills++;
  p.gainXp(e.xp);
  const c = e.center(); c.y += e.type.height * 0.5 + 0.5;
  game.fx.text(c, `+${e.xp} XP`, 'xp');
  game.quests.onKill(e.typeId);
  if (Math.random() < (e.type.boss ? 1 : 0.3)) game.orbs.spawn(e.center());
  if (e.type.boss) {
    game.enemies.bossRespawn = 300;
    game.ui.log('O Golem Ancião foi derrotado!', 'gold');
    game.fx.levelUp(e.pos);
    for (let i = 0; i < 4; i++) game.orbs.spawn(e.center().add(new THREE.Vector3(Math.random() * 4 - 2, 0, Math.random() * 4 - 2)));
  }
};

game.onPlayerDeath = () => {
  game.sfx('enemyDie', null, 1.5);
  game.ui.showDeath(true);
  if (document.pointerLockElement) document.exitPointerLock();
};

function respawn() {
  game.ui.showDeath(false);
  game.player.respawn();
  game.enemies.resetAggro();
  game.ui.log('Você renasceu na vila.');
  requestLock();
}
document.getElementById('respawn-btn').onclick = respawn;

// ---------- entrada ----------
const input = { keys: {}, mdx: 0, mdy: 0, wheel: 0, lmb: false, joy: { x: 0, y: 0 } };
game.input = input;

function requestLock() {
  if (isTouch || debug || !game.running) return;
  canvas.requestPointerLock?.();
}

function interact() {
  if (game.ui.advanceDialog()) return;
  const n = game.npcs.nearest(game.player.pos);
  if (n) game.npcs.talk(n);
}

function toggleSkills(open) {
  game.ui.toggleSkills(open);
  if (game.ui.skillsOpen) { if (document.pointerLockElement) document.exitPointerLock(); }
  else requestLock();
}
document.getElementById('skills-close').onclick = () => toggleSkills(false);
document.getElementById('sp-badge').onclick = () => toggleSkills(true);
document.getElementById('dialog').onclick = () => game.ui.advanceDialog();

addEventListener('keydown', (e) => {
  input.keys[e.code] = true;
  if (!game.running) return;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyK' || e.code === 'Tab') { e.preventDefault(); toggleSkills(); return; }
  if (game.ui.skillsOpen || game.player.dead) return;
  if (e.code === 'Digit1') game.player.useAbility(1);
  if (e.code === 'Digit2') game.player.useAbility(2);
  if (e.code === 'Digit3') game.player.useAbility(3);
  if (e.code === 'KeyE' || e.code === 'KeyF') interact();
});
addEventListener('keyup', (e) => { input.keys[e.code] = false; });
addEventListener('blur', () => { input.keys = {}; input.lmb = false; });

addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || (debug && e.buttons & 2)) {
    input.mdx += e.movementX;
    input.mdy += e.movementY;
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (isTouch || !game.running) return;
  if (document.pointerLockElement !== canvas && !debug) { requestLock(); return; }
  if (e.button === 0) input.lmb = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.lmb = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { input.wheel += e.deltaY; }, { passive: true });
document.getElementById('pause').onclick = requestLock;
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) input.lmb = false; });

// ---------- controles de toque ----------
if (isTouch) {
  const base = document.getElementById('joy-base'), knob = document.getElementById('joy-knob');
  let joyId = null, camId = null, joyC = { x: 0, y: 0 }, camLast = { x: 0, y: 0 };
  const R = 55;
  const setJoy = (t) => {
    let dx = t.clientX - joyC.x, dy = t.clientY - joyC.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.joy.x = dx / R; input.joy.y = dy / R;
  };
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    initAudio();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.42 && joyId === null) {
        joyId = t.identifier;
        joyC = { x: t.clientX, y: t.clientY };
        base.style.left = `${t.clientX - 70}px`;
        base.style.top = `${t.clientY - 70}px`;
        base.classList.add('active');
        setJoy(t);
      } else if (camId === null) {
        camId = t.identifier;
        camLast = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) setJoy(t);
      else if (t.identifier === camId) {
        input.mdx += (t.clientX - camLast.x) * 1.6;
        input.mdy += (t.clientY - camLast.y) * 1.6;
        camLast = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        input.joy.x = input.joy.y = 0;
        knob.style.transform = '';
        base.classList.remove('active');
        base.style.left = ''; base.style.top = '';
      } else if (t.identifier === camId) camId = null;
    }
  };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);

  const hold = (id, down, up) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); up?.(); }, { passive: false });
    el.addEventListener('touchcancel', () => up?.());
  };
  hold('t-jump', () => { input.keys.Space = true; }, () => { input.keys.Space = false; });
  hold('t-interact', interact);
  hold('t-skills', () => toggleSkills());
  hold('t-zoom', () => { game.player.camDist = game.player.camDist > 11 ? 7 : 14; });
}

function bindAbilitySlots() {
  game.ui.slots.forEach((s, i) => {
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!game.running || game.ui.skillsOpen) return;
      if (i === 0) input.lmb = true;
      else game.player.useAbility(i);
    };
    const up = (e) => { e.preventDefault(); if (i === 0) input.lmb = false; };
    s.el.addEventListener('touchstart', down, { passive: false });
    s.el.addEventListener('touchend', up, { passive: false });
    s.el.addEventListener('touchcancel', up);
    if (!isTouch) s.el.addEventListener('click', (e) => { e.stopPropagation(); if (i > 0) game.player.useAbility(i); });
  });
}

// ---------- início do jogo ----------
function startGame(classId) {
  initAudio();
  game.player = new Player(game, classId);
  game.ui.setupHud(game.player);
  bindAbilitySlots();
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  game.running = true;
  game.ui.log('Bem-vindo a Aether! Fale com o Ancião Aldric (marcador !) para receber missões.', 'gold');
  game.ui.log(isTouch ? 'Joystick à esquerda, arraste à direita para girar a câmera.' : 'WASD para mover, mouse para mirar, clique para atacar, 1/2/3 para habilidades.');
  if (isTouch) {
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
  requestLock();
}

if (debug) window.game = game;
game.ui.showClassSelect(startGame);
if (params.get('class')) startGame(params.get('class'));

// ---------- loop principal ----------
const clock = new THREE.Clock();
let menuT = 0, elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const p = game.player;
  const locked = document.pointerLockElement === canvas || isTouch || debug;
  const paused = game.running && (game.ui.skillsOpen || (!locked && !p.dead));
  game.ui.setPaused(game.running && !locked && !p.dead && !game.ui.skillsOpen);

  if (game.running && !paused) {
    for (let i = game.timers.length - 1; i >= 0; i--) {
      const t = game.timers[i];
      t.t -= dt;
      if (t.t <= 0) { game.timers.splice(i, 1); t.fn(); }
    }
    if (input.lmb && !game.ui.dialog) p.useAbility(0);
    p.update(dt, input);
    game.enemies.update(dt);
    game.projectiles.update(dt);
    game.npcs.update(dt, elapsed);
    game.orbs.update(dt);
    game.world.update(dt, p.pos, camera, game.fx);
    p.updateCamera(dt, camera);

    const near = !p.dead && game.npcs.nearest(p.pos);
    const hint = game.ui.dialog ? 'Continuar' : near ? `Falar com ${near.name}` : null;
    game.ui.setInteract(hint);
    if (isTouch) document.getElementById('t-interact').classList.toggle('hidden', !hint);
  } else if (!game.running) {
    // câmera cinematográfica no menu
    menuT += dt * 0.05;
    camera.position.set(Math.cos(menuT) * 38, 16, Math.sin(menuT) * 38);
    camera.lookAt(0, 4, 0);
    game.world.update(dt, new THREE.Vector3(), camera, game.fx);
    game.npcs.update(dt, elapsed);
  } else if (p) {
    p.updateCamera(dt, camera);
  }

  game.fx.update(game.running && paused ? 0 : dt, camera, innerWidth, innerHeight);
  if (game.fx.shakeAmt > 0) {
    const s = game.fx.shakeAmt;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  if (game.running) game.ui.update();
  renderer.render(scene, camera);
  input.mdx = input.mdy = input.wheel = 0;
}
frame();
