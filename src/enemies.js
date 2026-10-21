// Inimigos, IA, acampamentos e o chefe Golem Ancião.
import * as THREE from 'three';
import { buildHumanoid, buildWolf, animateRig, setRigTint } from './character.js';
import { heightAt } from './terrain.js';
import { mulberry32, lerpAngle } from './noise.js';

export const ENEMY_TYPES = {
  goblin: {
    name: 'Goblin', hp: 60, dmg: 9, speed: 5.4, range: 1.9, atkCd: 1.2, windup: 0.35, xp: 22, radius: 0.6, height: 1.7, aggro: 17, color: 0x7cb342,
    build: () => buildHumanoid({ skin: 0x7cb342, body: 0x6b4a2a, legs: 0x4a3420, accent: 0x5a5a5a, eye: 0xffe040, eyeGlow: true, hat: 'ears', weapon: 'club', scale: 0.75 }),
  },
  wolf: {
    name: 'Lobo', hp: 48, dmg: 8, speed: 9, range: 2.0, atkCd: 0.9, windup: 0.25, xp: 20, radius: 0.7, height: 1.3, aggro: 20, color: 0x8a8580, quad: true,
    build: () => buildWolf({ color: 0x6e6a66 }),
  },
  skeleton: {
    name: 'Esqueleto Arqueiro', hp: 55, dmg: 12, speed: 4.2, range: 22, atkCd: 2.1, windup: 0.6, xp: 30, radius: 0.55, height: 2.2, aggro: 24, color: 0xe8e4d4, ranged: true,
    build: () => buildHumanoid({ skin: 0xe8e4d4, body: 0xcfc9b6, legs: 0xcfc9b6, accent: 0x5a4a3a, eye: 0xff3020, eyeGlow: true, hat: 'hood', weapon: 'bow', scale: 0.95 }),
  },
  orc: {
    name: 'Orc Brutamontes', hp: 150, dmg: 18, speed: 4.8, range: 2.4, atkCd: 1.6, windup: 0.5, xp: 50, radius: 0.85, height: 2.8, aggro: 18, color: 0x5f8a3a,
    build: () => buildHumanoid({ skin: 0x5f8a3a, body: 0x4a3a2a, legs: 0x3a2a1a, accent: 0x8a8a8a, eye: 0xff4020, eyeGlow: true, hat: 'horns', weapon: 'axe', scale: 1.25, pauldrons: true }),
  },
  golem: {
    name: 'Golem Ancião', hp: 1600, dmg: 34, speed: 3.6, range: 5.5, atkCd: 2.0, windup: 0.9, xp: 900, radius: 2.0, height: 5.8, aggro: 30, color: 0x8a7a68, boss: true,
    build: () => buildHumanoid({ skin: 0x7d7468, body: 0x6b6158, legs: 0x5a5249, accent: 0x3a3530, eye: 0xff8a20, eyeGlow: true, weapon: 'none', scale: 2.6, pauldrons: true }),
  },
};

const barBgGeo = new THREE.PlaneGeometry(1.2, 0.14);
const barFillGeo = new THREE.PlaneGeometry(1.16, 0.1); barFillGeo.translate(0.58, 0, 0);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
const barFillMat = new THREE.MeshBasicMaterial({ color: 0xe53935, depthWrite: false, fog: false });
const barFrozenMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, depthWrite: false, fog: false });

class Enemy {
  constructor(game, typeId, level, home) {
    this.g = game;
    this.typeId = typeId;
    this.type = ENEMY_TYPES[typeId];
    this.level = level;
    const scale = 1 + 0.35 * (level - 1);
    this.maxHp = Math.round(this.type.hp * scale);
    this.hp = this.maxHp;
    this.damage = this.type.dmg * (1 + 0.25 * (level - 1));
    this.xp = Math.round(this.type.xp * (1 + 0.3 * (level - 1)));
    this.rig = this.type.build();
    this.pos = this.rig.root.position;
    this.home = home.clone();
    this.pos.copy(home);
    this.pos.y = heightAt(home.x, home.z);
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.wanderT = Math.random() * 3;
    this.wanderTarget = home.clone();
    this.atkTimer = 0;
    this.attacking = false;
    this.attackT = 0;
    this.knock = new THREE.Vector3();
    this.frozen = 0;
    this.hitFlash = 0;
    this.phase = Math.random() * 10;
    this.time = 0;
    this.dead = false;
    this.remove = false;
    this.rockCd = 3;
    this.leash = this.type.boss ? 45 : 42;
    game.scene.add(this.rig.root);

    this.bar = new THREE.Group();
    const bg = new THREE.Mesh(barBgGeo, barBgMat);
    this.fill = new THREE.Mesh(barFillGeo, barFillMat);
    this.fill.position.set(-0.58, 0, 0.001);
    bg.renderOrder = 20; this.fill.renderOrder = 21;
    this.bar.add(bg, this.fill);
    this.bar.visible = false;
    this.bar.scale.setScalar(this.type.boss ? 3 : 1);
    game.scene.add(this.bar);
  }

  center() {
    const c = this.pos.clone();
    c.y += this.type.height * 0.5;
    return c;
  }

  takeDamage(amount, opts, crit) {
    if (this.dead) return;
    const g = this.g;
    this.hp -= amount;
    this.hitFlash = 0.1;
    if (opts.freeze) this.frozen = Math.max(this.frozen, this.type.boss ? opts.freeze * 0.4 : opts.freeze);
    if (opts.knock && opts.from) {
      const d = this.pos.clone().sub(opts.from).setY(0);
      if (d.lengthSq() > 0.001) this.knock.addScaledVector(d.normalize(), opts.knock / (this.type.boss ? 6 : this.typeId === 'orc' ? 2 : 1));
    }
    if (this.state !== 'chase') this.aggro();
    const c = this.center();
    c.y += this.type.height * 0.5;
    g.fx.text(c, crit ? `${amount}!` : `${amount}`, crit ? 'crit' : 'dmg');
    const ci = this.center();
    g.fx.impact(ci, opts.impact ?? 'hit');
    if (this.hp <= 0) this.die();
  }

  aggro() {
    if (this.state === 'chase' || this.dead) return;
    this.state = 'chase';
    const c = this.center(); c.y += this.type.height * 0.7;
    this.g.fx.text(c, '!', 'alert');
    if (this.type.quad || this.type.boss) this.g.sfx('growl', this.pos);
  }

  die() {
    this.dead = true;
    this.hp = 0;
    this.deathT = 0;
    this.bar.visible = false;
    this.attacking = false;
    this.g.fx.deathBurst(this.center(), this.type.color);
    this.g.sfx('enemyDie', this.pos);
    this.g.onEnemyKilled(this);
  }

  startAttack() {
    this.attacking = true;
    this.attackT = 0;
    this.attackDone = false;
    const g = this.g, d = this.pos.distanceTo(g.player.pos);
    this.attackKind = 'melee';
    if (this.type.ranged) this.attackKind = 'arrow';
    if (this.type.boss) {
      this.attackKind = d < this.type.range ? 'slam' : 'rock';
      if (this.attackKind === 'slam') g.fx.telegraph(this.pos, 6.5, this.type.windup, 0xff3a1a);
    }
    if (this.rig.kind === 'humanoid') {
      this.rig.attackStyle = this.attackKind === 'arrow' ? 'aim' : this.attackKind === 'slam' ? 'slam' : this.attackKind === 'rock' ? 'raise' : 'swing';
    }
  }

  executeAttack() {
    const g = this.g, p = g.player;
    const d = this.pos.distanceTo(p.pos);
    switch (this.attackKind) {
      case 'melee':
        if (d <= this.type.range + 0.9) p.takeDamage(this.damage, this.pos);
        g.sfx('slash', this.pos, 0.6);
        break;
      case 'arrow': {
        const from = this.center(); from.y += 0.3;
        const target = p.pos.clone(); target.y += 1.1;
        const dir = target.sub(from).normalize();
        g.projectiles.spawn({ origin: from, dir, speed: 34, damage: this.damage, owner: 'enemy', mesh: 'arrow', trail: 'arrow', impact: 'arrow', life: 2 });
        g.sfx('bow', this.pos);
        break;
      }
      case 'slam':
        g.fx.explosion(this.pos.clone().setY(this.pos.y + 0.3), 6, 'rock');
        g.sfx('explosion', this.pos);
        g.fx.shake(Math.max(0, 0.7 - d * 0.02));
        if (d < 6.8) p.takeDamage(this.damage, this.pos);
        break;
      case 'rock': {
        const from = this.center(); from.y += 2.5;
        const target = p.pos.clone();
        const flat = target.clone().sub(from).setY(0);
        const dist = flat.length();
        const theta = 0.5, grav = 22;
        const speed = Math.min(40, Math.sqrt((dist * grav) / Math.sin(2 * theta)));
        const dir = flat.normalize().multiplyScalar(Math.cos(theta)).add(new THREE.Vector3(0, Math.sin(theta), 0));
        g.projectiles.spawn({
          origin: from, dir, speed, gravity: grav, damage: this.damage * 0.8, owner: 'enemy', rock: true, size: 0.8, trail: 'rock', life: 4, hitRadius: 1.2,
          onHit: (pos) => {
            g.fx.explosion(pos, 3, 'rock');
            g.sfx('explosion', pos, 0.6);
            if (pos.distanceTo(p.pos) < 3.2) p.takeDamage(this.damage * 0.5, pos);
          },
        });
        g.sfx('whoosh', this.pos);
        break;
      }
    }
  }

  update(dt) {
    const g = this.g, p = g.player, t = this.type;
    this.time += dt;

    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.4);
      this.rig.root.rotation.z = k * Math.PI / 2;
      if (this.deathT > 1.5) this.pos.y -= dt * 1.2;
      if (this.deathT > 3) this.remove = true;
      return;
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.frozen = Math.max(0, this.frozen - dt);
    this.atkTimer -= dt;
    const slow = this.frozen > 0 ? 0.25 : 1;

    // empurrão
    if (this.knock.lengthSq() > 0.01) {
      this.pos.x += this.knock.x * dt;
      this.pos.z += this.knock.z * dt;
      this.knock.multiplyScalar(Math.exp(-8 * dt));
    }

    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const alive = !p.dead;
    let mx = 0, mz = 0, spd = 0, faceYaw = null;

    if (this.attacking) {
      this.attackT += dt * slow;
      faceYaw = Math.atan2(dx, dz);
      this.rig.attack = Math.min(1, this.attackT / (t.windup + 0.35));
      if (!this.attackDone && this.attackT >= t.windup) {
        this.attackDone = true;
        if (alive) this.executeAttack();
      }
      if (this.attackT >= t.windup + 0.35) {
        this.attacking = false;
        this.rig.attack = 0;
        this.atkTimer = t.atkCd * (0.8 + Math.random() * 0.4);
      }
    } else {
      switch (this.state) {
        case 'idle': {
          if (alive && d < t.aggro) { this.aggro(); break; }
          this.wanderT -= dt;
          if (this.wanderT <= 0) {
            this.wanderT = 3 + Math.random() * 4;
            const a = Math.random() * Math.PI * 2, r = Math.random() * 8;
            this.wanderTarget.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          }
          const wx = this.wanderTarget.x - this.pos.x, wz = this.wanderTarget.z - this.pos.z;
          const wd = Math.hypot(wx, wz);
          if (wd > 1) { mx = wx / wd; mz = wz / wd; spd = t.speed * 0.3; }
          break;
        }
        case 'chase': {
          const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
          if (!alive || fromHome > this.leash) { this.state = 'return'; break; }
          faceYaw = Math.atan2(dx, dz);
          const desired = t.ranged ? t.range * 0.7 : t.boss ? t.range * 0.7 : t.range * 0.8;
          if (d > desired) { mx = dx / d; mz = dz / d; spd = t.speed; }
          else if (t.ranged && d < t.range * 0.3) { mx = -dx / d; mz = -dz / d; spd = t.speed * 0.7; }
          if (this.atkTimer <= 0) {
            if (d <= t.range) this.startAttack();
            else if (t.boss && d < 30 && this.rockCd <= 0) { this.startAttack(); this.rockCd = 4; }
          }
          if (t.boss) this.rockCd -= dt;
          break;
        }
        case 'return': {
          const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z;
          const hd = Math.hypot(hx, hz);
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3 * dt);
          if (hd < 2) { this.state = 'idle'; this.hp = this.maxHp; }
          else { mx = hx / hd; mz = hz / hd; spd = t.speed * 1.3; }
          if (alive && d < t.aggro * 0.5 && hd < this.leash * 0.6) this.state = 'chase';
          break;
        }
      }
    }

    if (spd > 0) {
      spd *= slow;
      const nx = this.pos.x + mx * spd * dt, nz = this.pos.z + mz * spd * dt;
      if (heightAt(nx, nz) > -0.8) { this.pos.x = nx; this.pos.z = nz; }
      if (faceYaw === null) faceYaw = Math.atan2(mx, mz);
    }
    if (d < 60) g.world.resolveCollision(this.pos, t.radius * 0.7);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < -0.8) this.pos.y = -0.8;
    if (faceYaw !== null) this.yaw = lerpAngle(this.yaw, faceYaw, 1 - Math.exp(-10 * dt));
    this.rig.root.rotation.y = this.yaw;

    this.phase += dt * spd * (t.quad ? 1.0 : 1.6) / (this.rig.root.scale.x);
    animateRig(this.rig, this.phase, spd > 0 ? Math.min(1, spd / 5) : 0, this.time);
    setRigTint(this.rig, this.hitFlash, this.frozen);
    if (this.frozen > 0 && Math.random() < 0.15) g.fx.impact(this.center(), 'frost');

    // barra de vida
    const show = this.hp < this.maxHp || this.state === 'chase';
    this.bar.visible = show && !t.boss;
    if (this.bar.visible) {
      this.bar.position.copy(this.pos);
      this.bar.position.y += t.height + 0.5;
      this.bar.quaternion.copy(g.camera.quaternion);
      this.fill.scale.x = Math.max(0.001, this.hp / this.maxHp);
      this.fill.material = this.frozen > 0 ? barFrozenMat : barFillMat;
    }
  }

  dispose() {
    this.g.scene.remove(this.rig.root);
    this.g.scene.remove(this.bar);
    this.rig.root.traverse((o) => { if (o.isMesh) o.material.dispose(); });
  }
}

export class EnemyManager {
  constructor(game) {
    this.g = game;
    this.all = [];
    this.active = [];
    this.camps = [];
    this.boss = null;
    this.bossRespawn = 0;
    this.range = game.isTouch ? 95 : 120; // raio em que inimigos ficam ativos/visíveis
  }

  setup() {
    const g = this.g, r = mulberry32(7);
    const tentGeo = new THREE.ConeGeometry(2.2, 2.8, 6);
    const tentMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, flatShading: true, roughness: 0.9 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, side: THREE.DoubleSide });
    let tries = 0;
    while (this.camps.length < 28 && tries++ < 400) {
      const pos = g.world.findLandSpot(r, 55, 255, 1.5, 20);
      if (this.camps.some((c) => c.pos.distanceTo(pos) < 32)) continue;
      const d = Math.hypot(pos.x, pos.z);
      let types;
      if (d < 110) types = ['goblin', 'goblin', 'wolf'];
      else if (d < 180) types = ['goblin', 'skeleton', 'wolf', 'skeleton', 'orc'];
      else types = ['orc', 'skeleton', 'wolf', 'skeleton', 'orc'];
      const level = Math.max(1, 1 + Math.floor((d - 45) / 45));
      const camp = { pos, types, level, size: 3 + Math.floor(r() * 3), members: [], respawnT: 0 };
      // tenda e estandarte
      const tent = new THREE.Mesh(tentGeo, tentMat);
      tent.position.set(pos.x + 3, heightAt(pos.x + 3, pos.z) + 1.3, pos.z);
      tent.castShadow = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4), tentMat);
      pole.position.set(pos.x - 2, heightAt(pos.x - 2, pos.z - 1) + 2, pos.z - 1);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), bannerMat);
      banner.position.set(pos.x - 1.55, pole.position.y + 1.2, pos.z - 1);
      g.scene.add(tent, pole, banner);
      g.world.addCollider(pos.x + 3, pos.z, 1.8);
      this.camps.push(camp);
    }
    // chefe
    this.bossHome = g.world.findLandSpot(mulberry32(99), 185, 215, 2, 16);
    this.spawnBoss();
  }

  spawnBoss() {
    this.boss = new Enemy(this.g, 'golem', 6, this.bossHome);
    this.all.push(this.boss);
  }

  spawnCamp(camp) {
    camp.members = [];
    for (let i = 0; i < camp.size; i++) {
      const type = camp.types[(Math.random() * camp.types.length) | 0];
      const a = Math.random() * Math.PI * 2, rr = 2 + Math.random() * 5;
      const home = new THREE.Vector3(camp.pos.x + Math.cos(a) * rr, 0, camp.pos.z + Math.sin(a) * rr);
      const e = new Enemy(this.g, type, camp.level + (Math.random() < 0.2 ? 1 : 0), home);
      camp.members.push(e);
      this.all.push(e);
    }
  }

  resetAggro() {
    for (const e of this.all) if (!e.dead && e.state === 'chase') { e.state = 'return'; e.attacking = false; }
  }

  update(dt) {
    const p = this.g.player;
    for (const camp of this.camps) {
      const d = camp.pos.distanceTo(p.pos);
      const alive = camp.members.some((e) => !e.dead);
      if (!alive) {
        if (camp.members.length && !camp.waiting) { camp.waiting = true; camp.respawnT = 75; }
        camp.respawnT -= dt;
        if (camp.respawnT <= 0 && d < this.range + 15 && (d > 55 || camp.members.length === 0)) {
          this.spawnCamp(camp);
          camp.waiting = false;
        }
      }
    }
    if (this.boss && this.boss.remove) this.boss = null;
    if (!this.boss) {
      this.bossRespawn -= dt;
      if (this.bossRespawn <= 0 && this.bossHome.distanceTo(p.pos) > 60) this.spawnBoss();
    }

    this.active.length = 0;
    for (let i = this.all.length - 1; i >= 0; i--) {
      const e = this.all[i];
      if (e.remove) { e.dispose(); this.all.splice(i, 1); continue; }
      const d = e.pos.distanceTo(p.pos);
      const near = d < this.range;
      e.rig.root.visible = near;
      if (!near) { e.bar.visible = false; continue; }
      e.update(dt);
      if (!e.dead) this.active.push(e);
    }
    // separação entre inimigos
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        const a = A[i], b = A[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = (a.type.radius + b.type.radius) * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }
  }
}
