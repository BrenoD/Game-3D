// Herói controlado pelo jogador: movimento, câmera, atributos, XP e árvore de habilidades.
import * as THREE from 'three';
import { buildHumanoid, animateHumanoid, setRigTint } from './character.js';
import { CLASSES, MAX_RANK, cooldownFor } from './classes.js';
import { heightAt, BOUND } from './terrain.js';
import { clamp, lerpAngle } from './noise.js';

const SPAWN = new THREE.Vector3(3, 0, 8);

export class Player {
  constructor(game, classId) {
    this.g = game;
    this.classId = classId;
    this.cls = CLASSES[classId];
    this.rig = buildHumanoid(this.cls.look);
    this.rig.attackStyle = 'swing';
    game.scene.add(this.rig.root);
    this.pos = this.rig.root.position;
    this.vel = new THREE.Vector3(); // impulsos (recuo, empurrões)

    this.level = 1;
    this.xp = 0;
    this.skillPoints = 1;
    this.ranks = this.cls.abilities.map(() => 1);
    this.passives = { vit: 0, wis: 0, pow: 0, agi: 0 };
    this.cooldowns = this.cls.abilities.map(() => 0);
    this.kills = 0;

    this.recalcStats();
    this.vy = 0;
    this.onGround = true;
    this.yaw = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.35;
    this.camDist = 9;
    this.buffs = { dmg: 0 };
    this.dash = null;
    this.channel = null;
    this.spin = 0;
    this.attackFace = 0;
    this.animT = 0; this.animDur = 0;
    this.phase = 0;
    this.lastStep = 0;
    this.combatT = 0;
    this.hitFlash = 0;
    this.stamina = 100;
    this.time = 0;
    this.respawn();
  }

  get xpNext() { return Math.round(100 * Math.pow(this.level, 1.5)); }

  recalcStats() {
    const c = this.cls, l = this.level - 1, p = this.passives;
    const oldMax = this.maxHp;
    this.maxHp = Math.round(c.hp * (1 + 0.12 * l) * (1 + 0.08 * p.vit));
    this.maxMp = Math.round(c.mp * (1 + 0.08 * l) * (1 + 0.08 * p.wis));
    this.mpRegen = c.mpRegen * (1 + 0.12 * p.wis) * (1 + 0.04 * l);
    this.dmgMult = (1 + 0.12 * l) * (1 + 0.06 * p.pow);
    this.speed = c.speed * (1 + 0.04 * p.agi);
    this.crit = 0.12 + 0.03 * p.agi;
    if (oldMax && this.hp) this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oldMax));
  }

  dmg(base) { return base * this.dmgMult * (this.buffs.dmg > 0 ? 1.5 : 1); }

  respawn() {
    this.pos.copy(SPAWN);
    this.pos.y = heightAt(SPAWN.x, SPAWN.z);
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    this.dead = false;
    this.vy = 0;
    this.dash = null; this.channel = null; this.spin = 0;
    this.rig.root.visible = true;
    this.rig.root.rotation.set(0, 0, 0);
    this.invuln = 2;
  }

  // ---------- progressão ----------
  gainXp(n) {
    this.xp += n;
    let leveled = false;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.skillPoints += 2;
      leveled = true;
    }
    if (leveled) {
      this.recalcStats();
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      this.g.fx.levelUp(this.pos);
      this.g.sfx('levelUp');
      const head = this.pos.clone(); head.y += 3;
      this.g.fx.text(head, `NÍVEL ${this.level}!`, 'level big');
      this.g.ui.log(`Você subiu para o nível ${this.level}! +2 pontos de habilidade (tecla K)`, 'gold');
      this.g.ui.refreshSkills();
    }
  }

  canUpgrade(i) { return this.skillPoints > 0 && this.ranks[i] < MAX_RANK; }

  upgradeAbility(i) {
    if (!this.canUpgrade(i)) return false;
    this.skillPoints--;
    this.ranks[i]++;
    this.g.sfx('skill');
    this.g.fx.heal(this.pos, 0xffd76a);
    return true;
  }

  upgradePassive(id) {
    if (this.skillPoints <= 0 || this.passives[id] >= MAX_RANK) return false;
    this.skillPoints--;
    this.passives[id]++;
    this.recalcStats();
    this.g.sfx('skill');
    this.g.fx.heal(this.pos, 0x6ad0ff);
    return true;
  }

  cooldownMax(i) { return cooldownFor(this.cls.abilities[i], this.ranks[i]); }

  // ---------- combate ----------
  useAbility(i) {
    if (this.dead || this.channel) return;
    const a = this.cls.abilities[i];
    if (!a || this.cooldowns[i] > 0) return;
    if (this.mp < a.mp) {
      if (!this.manaWarnT || this.time - this.manaWarnT > 1) {
        this.g.ui.log('Mana insuficiente!', 'warn');
        this.manaWarnT = this.time;
      }
      return;
    }
    this.mp -= a.mp;
    this.cooldowns[i] = this.cooldownMax(i);
    this.combatT = 5;
    a.run(this.g, this, this.ranks[i]);
  }

  faceAim(dir) {
    this.yaw = Math.atan2(dir.x, dir.z);
    this.rig.root.rotation.y = this.yaw;
    this.attackFace = 0.5;
  }

  anim(style, dur) {
    this.rig.attackStyle = style;
    this.animT = 0;
    this.animDur = dur;
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    const healed = Math.round(this.hp - before);
    if (healed > 0) {
      const head = this.pos.clone(); head.y += 2.6;
      this.g.fx.text(head, `+${healed}`, 'heal');
      this.g.fx.heal(this.pos);
    }
  }

  takeDamage(amount, source) {
    if (this.dead || this.invuln > 0) return;
    this.hp -= amount;
    this.combatT = 5;
    this.hitFlash = 0.15;
    const head = this.pos.clone(); head.y += 2.4;
    this.g.fx.text(head, `-${Math.round(amount)}`, 'player-dmg');
    this.g.fx.impact(head.setY(head.y - 1), 'hit');
    this.g.fx.shake(0.25);
    this.g.sfx('hurt');
    this.g.ui.hurt();
    if (source) {
      const push = this.pos.clone().sub(source).setY(0);
      if (push.lengthSq() > 0.001) this.vel.addScaledVector(push.normalize(), 5);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.channel = null; this.dash = null;
      this.g.fx.deathBurst(this.pos.clone().setY(this.pos.y + 1), 0xff3030);
      this.g.onPlayerDeath();
    }
  }

  // ---------- atualização ----------
  update(dt, input) {
    const g = this.g;
    this.time += dt;
    for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    this.buffs.dmg = Math.max(0, this.buffs.dmg - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.combatT = Math.max(0, this.combatT - dt);
    this.attackFace = Math.max(0, this.attackFace - dt);

    // câmera
    this.camYaw -= input.mdx * 0.0026;
    this.camPitch = clamp(this.camPitch + input.mdy * 0.002, -0.15, 1.25);
    this.camDist = clamp(this.camDist + input.wheel * 0.008, 4, 18);

    if (this.dead) {
      this.rig.root.rotation.x = Math.min(Math.PI / 2, this.rig.root.rotation.x + dt * 4);
      return;
    }

    // regeneração
    this.mp = Math.min(this.maxMp, this.mp + this.mpRegen * dt);
    const regen = this.combatT > 0 ? 0.004 : 0.03;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * regen * dt);

    // movimento
    const k = input.keys;
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const joy = input.joy;
    const joyMag = joy ? Math.hypot(joy.x, joy.y) : 0;
    if (joyMag > 0.15) { f = -joy.y; s = joy.x; }
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const ml = Math.hypot(mx, mz);
    const moving = ml > 0.01;
    if (moving) { mx /= ml; mz /= ml; }

    const groundH = heightAt(this.pos.x, this.pos.z);
    const inWater = groundH < -0.2;
    const sprint = (k.ShiftLeft || k.ShiftRight || joyMag > 0.95) && moving && this.stamina > 1;
    this.stamina = clamp(this.stamina + (sprint ? -22 : 15) * dt, 0, 100);
    let speed = this.speed * (sprint ? 1.6 : 1) * (inWater ? 0.6 : 1);
    if (this.channel) speed *= 0.5;

    let vx = mx * speed, vz = mz * speed;
    if (this.dash) {
      const d = this.dash;
      vx = d.dir.x * d.speed; vz = d.dir.z * d.speed;
      d.t -= dt;
      g.fx.trail('fire', this.pos.clone().setY(this.pos.y + 1), this.pos.clone().setY(this.pos.y + 1.2).addScaledVector(d.dir, -1));
      g.fx.dust(this.pos, 2);
      for (const e of g.enemies.active) {
        if (e.dead || d.hit.has(e)) continue;
        if (e.pos.distanceTo(this.pos) < 2.2 + e.type.radius) {
          d.hit.add(e);
          g.damageEnemy(e, d.dmg, { knock: 14, from: this.pos });
          g.fx.shake(0.2);
          g.sfx('hit', e.pos);
        }
      }
      if (d.t <= 0) this.dash = null;
    }
    vx += this.vel.x; vz += this.vel.z;
    this.vel.multiplyScalar(Math.exp(-6 * dt));

    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    const nh = heightAt(nx, nz);
    // água funda bloqueia, a menos que esteja saindo dela
    if (nh > -1.6 || nh > groundH) {
      this.pos.x = clamp(nx, -BOUND, BOUND);
      this.pos.z = clamp(nz, -BOUND, BOUND);
    } else if (this.dash) this.dash = null;
    g.world.resolveCollision(this.pos, 0.5);

    // pulo e gravidade
    if ((k.Space) && this.onGround) {
      this.vy = 9.5;
      this.onGround = false;
      g.sfx('jump');
      g.fx.dust(this.pos, 6);
    }
    this.vy -= 26 * dt;
    this.pos.y += this.vy * dt;
    const ground = Math.max(heightAt(this.pos.x, this.pos.z), -1.2);
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vy < -8) {
        if (inWater) g.fx.splash(this.pos.clone().setY(0.1), 14); else g.fx.dust(this.pos, 10);
        g.sfx('step', null, 1.5);
      }
      this.pos.y = ground;
      this.vy = 0;
      this.onGround = true;
    }

    // rotação do personagem
    if (this.spin > 0) {
      this.spin -= dt;
      this.yaw += dt * 22;
    } else if (this.attackFace <= 0 && moving) {
      this.yaw = lerpAngle(this.yaw, Math.atan2(mx, mz), 1 - Math.exp(-14 * dt));
    }
    this.rig.root.rotation.y = this.yaw;

    // canalização (ex.: chuva de balas)
    if (this.channel) {
      const c = this.channel;
      c.t -= dt;
      if (c.t <= 0) { c.fn(); c.n--; c.t = c.interval; }
      if (c.n <= 0) this.channel = null;
    }

    // animação
    const actualSpeed = this.dash ? 0 : moving ? speed : 0;
    this.phase += dt * actualSpeed * 1.35;
    if (this.animDur > 0) {
      this.animT += dt;
      this.rig.attack = Math.min(1, this.animT / this.animDur);
      if (this.animT >= this.animDur) { this.rig.attack = 0; this.animDur = 0; }
    }
    animateHumanoid(this.rig, this.phase, moving && this.onGround ? Math.min(1, actualSpeed / 7) : 0, this.time);
    if (!this.onGround) { this.rig.legL.rotation.x = -0.5; this.rig.legR.rotation.x = 0.3; }

    // passos: poeira, respingos e som
    const stepIdx = Math.floor(this.phase / Math.PI);
    if (moving && this.onGround && stepIdx !== this.lastStep) {
      this.lastStep = stepIdx;
      const side = stepIdx % 2 ? 0.2 : -0.2;
      const foot = this.pos.clone();
      foot.x += Math.cos(this.yaw) * side; foot.z -= Math.sin(this.yaw) * side;
      if (inWater) { foot.y = 0.05; g.fx.splash(foot, 5); g.sfx('splash', null, 0.8); }
      else { g.fx.dust(foot, sprint ? 4 : 2); g.sfx('step', null, sprint ? 1.2 : 0.8); }
    }

    // aura do buff de dano
    if (this.buffs.dmg > 0 && Math.random() < 0.5) {
      g.fx.emit({ pos: this.pos.clone().setY(this.pos.y + 1), jitter: 0.5, dir: { x: 0, y: 1, z: 0 }, spread: 0.2, speed: [1, 2.5], life: [0.4, 0.7], size: 0.25, color: 0xffd76a, color1: 0xff3a00, count: 1 });
    }

    setRigTint(this.rig, this.hitFlash, 0);
    if (this.invuln > 0) this.rig.root.visible = Math.floor(this.invuln * 10) % 2 === 0;
    else this.rig.root.visible = true;
  }

  updateCamera(dt, camera) {
    const target = this.pos.clone();
    target.y += 2.0;
    const cp = Math.cos(this.camPitch);
    const desired = target.clone().add(new THREE.Vector3(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp).multiplyScalar(this.camDist));
    const h = heightAt(desired.x, desired.z) + 0.7;
    if (desired.y < h) desired.y = h;
    camera.position.copy(desired);
    camera.lookAt(target);
  }
}
