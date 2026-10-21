// Classes jogáveis, habilidades (com níveis de skill) e talentos passivos.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

export const MAX_RANK = 5;
const pw = (r) => 1 + 0.22 * (r - 1); // multiplicador de poder por nível da habilidade
const UP = new THREE.Vector3(0, 1, 0);

function rotY(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new THREE.Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

// ======================= GUERREIRO =======================
const warrior = {
  name: 'Guerreiro', emoji: '⚔️', role: 'Corpo a corpo · Resistente',
  desc: 'Mestre da espada. Muita vida, investidas devastadoras e golpes em área.',
  hp: 240, mp: 90, mpRegen: 5, speed: 7.4,
  stats: { Vida: 5, Dano: 4, Alcance: 1, Mana: 2 },
  look: { body: 0x8e2b2b, legs: 0x3b2f2f, accent: 0xc9a227, skin: 0xe0b48a, hat: 'helmet', weapon: 'sword', pauldrons: true, cape: 0x6a1a1a },
  abilities: [
    {
      id: 'slash', name: 'Golpe de Espada', icon: '🗡️', cd: 0.55, mp: 0,
      desc: 'Corte em arco à frente.',
      upg: 'Mais dano e alcance. Nível 5: dispara uma onda de luz.',
      run(g, p, r) {
        const a = g.aim(8);
        p.faceAim(a.flat);
        p.anim('swing', 0.38);
        g.later(0.1, () => {
          const c = p.pos.clone(); c.y += 1.3;
          g.fx.slash(c, p.yaw, r >= 4 ? 0xffd76a : 0xfff2c8, 1.0 + r * 0.08, (Math.random() - 0.5) * 0.5);
          g.sfx('slash', p.pos);
          const n = g.hitArc(p.pos, a.flat, 3.8 + r * 0.25, 1.1, p.dmg(30 * pw(r)), { knock: 6 });
          if (n) g.fx.shake(0.15);
          if (r >= 5) {
            g.spawnProjectile({ origin: c.addScaledVector(a.flat, 1), dir: a.flat, speed: 26, damage: p.dmg(26), color: 0xffd76a, size: 0.5, trail: 'fire', impact: 'sparks', pierce: true, life: 0.7 });
          }
        });
      },
    },
    {
      id: 'charge', name: 'Investida', icon: '💨', cd: 6, mp: 20,
      desc: 'Avança rapidamente atropelando inimigos.',
      upg: 'Mais dano, distância e menor recarga.',
      run(g, p, r) {
        const a = g.aim(16);
        p.faceAim(a.flat);
        p.anim('spin', 0.35);
        p.dash = { dir: a.flat.clone(), t: 0.3 + r * 0.03, speed: 32, hit: new Set(), dmg: p.dmg(40 * pw(r)) };
        g.sfx('whoosh', p.pos);
        g.fx.ring(p.pos, 0xffd76a, 3, 0.35);
        g.fx.dust(p.pos, 10);
      },
    },
    {
      id: 'whirl', name: 'Redemoinho', icon: '🌀', cd: 8, mp: 30,
      desc: 'Gira a espada, atingindo todos ao redor.',
      upg: 'Mais raio e dano. Nível 4+: gira duas vezes.',
      run(g, p, r) {
        const spins = r >= 4 ? 2 : 1;
        const radius = 5 + 0.4 * (r - 1);
        p.spin = 0.55 * spins;
        p.anim('spin', 0.55 * spins);
        for (let i = 0; i < spins; i++) {
          g.later(i * 0.5, () => {
            g.sfx('slash', p.pos); g.later(0.12, () => g.sfx('slash', p.pos, 0.7));
            const c = p.pos.clone(); c.y += 1.1;
            for (let k = 0; k < 4; k++) g.fx.slash(c, p.yaw + k * (Math.PI / 2), 0xffe7a0, radius * 0.6, 0);
            g.fx.ring(p.pos, 0xffd76a, radius, 0.4);
            g.fx.dust(p.pos, 14);
            const n = g.hitRadius(p.pos, radius, p.dmg(42 * pw(r)), { knock: 11 });
            if (n) g.fx.shake(0.25);
          });
        }
      },
    },
    {
      id: 'warcry', name: 'Grito de Guerra', icon: '📯', cd: 20, mp: 35,
      desc: 'Cura parte da vida e aumenta seu dano em 50%.',
      upg: 'Cura maior e buff mais longo.',
      run(g, p, r) {
        p.anim('raise', 0.7);
        p.buffs.dmg = 7 + r;
        p.heal(p.maxHp * (0.18 + 0.05 * r));
        g.sfx('warcry', p.pos);
        g.fx.levelUp(p.pos);
        g.fx.ring(p.pos, 0xff5a3a, 10, 0.6);
        g.fx.shake(0.2);
        g.hitRadius(p.pos, 6, p.dmg(15 * pw(r)), { knock: 14 });
      },
    },
  ],
};

// ======================= MAGO =======================
const mage = {
  name: 'Mago', emoji: '🔮', role: 'Magia à distância · Área',
  desc: 'Controla o fogo, o gelo e o arcano. Frágil, mas com o maior dano em área.',
  hp: 130, mp: 220, mpRegen: 12, speed: 7.0,
  stats: { Vida: 2, Dano: 5, Alcance: 5, Mana: 5 },
  look: { body: 0x3b2a7a, legs: 0x2a1f55, accent: 0xd4af37, skin: 0xe8c39e, hat: 'wizard', weapon: 'staff', robe: true, orbColor: 0xb070ff },
  abilities: [
    {
      id: 'bolt', name: 'Míssil Arcano', icon: '✨', cd: 0.45, mp: 4,
      desc: 'Projétil arcano teleguiado.',
      upg: 'Mais dano. Nível 3: 2 mísseis. Nível 5: 3 mísseis.',
      run(g, p, r) {
        const a = g.aim(45);
        p.faceAim(a.flat);
        p.anim('cast', 0.3);
        const n = r >= 5 ? 3 : r >= 3 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 0.18;
          g.spawnProjectile({ origin: g.castOrigin(p, a.flat), dir: rotY(a.dir, off), speed: 32, damage: p.dmg(22 * pw(r)), color: 0xc890ff, size: 0.28, trail: 'arcane', impact: 'arcane', homing: a.target, turn: 5 });
        }
        g.sfx('magic', p.pos);
        g.fx.flash(g.castOrigin(p, a.flat), 0xb070ff, 15, 0.12, 8);
      },
    },
    {
      id: 'fireball', name: 'Bola de Fogo', icon: '🔥', cd: 4, mp: 25,
      desc: 'Explode ao atingir, causando dano em área.',
      upg: 'Explosão maior. Nível 5: se divide em 3 explosões.',
      run(g, p, r) {
        const a = g.aim(45);
        p.faceAim(a.flat);
        p.anim('cast', 0.45);
        const radius = 4.2 + 0.4 * r;
        g.spawnProjectile({
          origin: g.castOrigin(p, a.flat), dir: a.dir, speed: 24, damage: p.dmg(30 * pw(r)), color: 0xff8a2a, size: 0.55, trail: 'fire', life: 2.5, explodeOnExpire: true,
          onHit(pos) {
            g.explode(pos, radius, p.dmg(40 * pw(r)), 'fire');
            if (r >= 5) {
              for (let i = 0; i < 3; i++) {
                const ang = (i / 3) * Math.PI * 2;
                const q = pos.clone().add(new THREE.Vector3(Math.cos(ang) * 4, 0, Math.sin(ang) * 4));
                q.y = heightAt(q.x, q.z) + 0.5;
                g.later(0.25 + i * 0.1, () => g.explode(q, 3, p.dmg(20), 'fire'));
              }
            }
          },
        });
        g.sfx('fire', p.pos);
      },
    },
    {
      id: 'frost', name: 'Nova de Gelo', icon: '❄️', cd: 9, mp: 35,
      desc: 'Explosão de gelo ao seu redor que congela inimigos.',
      upg: 'Mais raio, dano e tempo de congelamento.',
      run(g, p, r) {
        p.anim('raise', 0.5);
        const radius = 7 + 0.5 * (r - 1);
        g.fx.frostNova(p.pos, radius, heightAt);
        g.sfx('ice', p.pos);
        g.fx.shake(0.15);
        g.hitRadius(p.pos, radius, p.dmg(26 * pw(r)), { freeze: 3 + 0.4 * r, knock: 4, impact: 'frost' });
      },
    },
    {
      id: 'meteor', name: 'Meteoro', icon: '☄️', cd: 16, mp: 60,
      desc: 'Invoca um meteoro do céu no alvo.',
      upg: 'Mais dano. Nível 3: 2 meteoros. Nível 5: 3 meteoros.',
      run(g, p, r) {
        const a = g.aim(40);
        p.faceAim(a.flat);
        p.anim('raise', 0.8);
        const center = a.target ? a.target.pos.clone() : p.pos.clone().addScaledVector(a.flat, 16);
        const count = r >= 5 ? 3 : r >= 3 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const t = center.clone();
          if (i > 0) { const ang = Math.random() * Math.PI * 2; t.x += Math.cos(ang) * 6; t.z += Math.sin(ang) * 6; }
          t.y = heightAt(t.x, t.z);
          const delay = i * 0.45;
          g.later(delay, () => {
            g.fx.telegraph(t, 6.5, 1.0, 0xff5a1a);
            const start = t.clone().add(new THREE.Vector3(-10, 42, -10));
            const dir = t.clone().sub(start).normalize();
            g.spawnProjectile({
              origin: start, dir, speed: 44, damage: 0, color: 0xff6a20, size: 1.4, trail: 'meteor', life: 3, rock: true,
              onHit(pos) {
                g.explode(pos, 7, p.dmg(85 * pw(r)), 'meteor', { knock: 16 });
                g.fx.shake(0.6);
              },
            });
          });
        }
        g.sfx('fire', p.pos);
      },
    },
  ],
};

// ======================= PISTOLEIRO =======================
function gunShot(g, p, r, spread = 0) {
  const a = g.aim(70);
  p.faceAim(a.flat);
  p.anim('aim', 0.6);
  const origin = g.castOrigin(p, a.flat);
  const dir = spread ? rotY(a.dir, (Math.random() - 0.5) * spread) : a.dir;
  dir.y += spread ? (Math.random() - 0.5) * spread * 0.3 : 0;
  dir.normalize();
  g.spawnProjectile({ origin, dir, speed: 95, damage: p.dmg(19 * pw(r)), color: 0xffe066, size: 0.12, trail: 'bullet', impact: 'sparks', pierce: r >= 3, life: 1 });
  g.fx.muzzle(origin, dir);
  g.sfx('shot', p.pos);
  g.fx.shake(0.04);
  return { a, origin };
}

const gunner = {
  name: 'Pistoleiro Arcano', emoji: '🔫', role: 'Tiros à distância · Ágil',
  desc: 'Atirador com armas encantadas. Rápido, letal e cheio de explosivos.',
  hp: 165, mp: 130, mpRegen: 8, speed: 8.0,
  stats: { Vida: 3, Dano: 4, Alcance: 5, Mana: 3 },
  look: { body: 0x2f5a46, legs: 0x3a2f28, accent: 0x9a7a4a, skin: 0xd9a77a, hat: 'cap', weapon: 'gun', cape: 0x5a3a20 },
  abilities: [
    {
      id: 'shot', name: 'Tiro Rápido', icon: '🔫', cd: 0.2, mp: 0,
      desc: 'Disparo rápido e preciso.',
      upg: 'Mais dano. Nível 3: atravessa inimigos. Nível 5: tiro duplo.',
      run(g, p, r) {
        gunShot(g, p, r);
        if (r >= 5) g.later(0.07, () => gunShot(g, p, r, 0.05));
      },
    },
    {
      id: 'spread', name: 'Rajada', icon: '💥', cd: 5, mp: 18,
      desc: 'Disparo em leque com vários projéteis.',
      upg: 'Mais projéteis e dano.',
      run(g, p, r) {
        const a = g.aim(30);
        p.faceAim(a.flat);
        p.anim('aim', 0.7);
        const origin = g.castOrigin(p, a.flat);
        const n = 6 + r;
        for (let i = 0; i < n; i++) {
          const off = (i / (n - 1) - 0.5) * 0.6;
          const d = rotY(a.dir, off); d.y += (Math.random() - 0.5) * 0.06; d.normalize();
          g.spawnProjectile({ origin, dir: d, speed: 70, damage: p.dmg(13 * pw(r)), color: 0xffb040, size: 0.14, trail: 'bullet', impact: 'sparks', life: 0.45, knock: 5 });
        }
        g.fx.muzzle(origin, a.dir, 0xff9a30, true);
        g.sfx('shotgun', p.pos);
        g.fx.shake(0.18);
        p.vel.addScaledVector(a.flat, -6);
      },
    },
    {
      id: 'grenade', name: 'Granada Arcana', icon: '💣', cd: 7, mp: 28,
      desc: 'Arremessa uma granada que explode em área.',
      upg: 'Explosão maior. Nível 4+: solta 3 granadas extras.',
      run(g, p, r) {
        const a = g.aim(30);
        p.faceAim(a.flat);
        p.anim('cast', 0.4);
        const dist = a.target ? a.target.pos.distanceTo(p.pos) : 14;
        const theta = 0.6, grav = 22;
        const speed = Math.min(28, Math.max(8, Math.sqrt((dist * grav) / Math.sin(2 * theta))));
        const dir = a.flat.clone().multiplyScalar(Math.cos(theta)).addScaledVector(UP, Math.sin(theta));
        const radius = 4.5 + 0.4 * r;
        g.spawnProjectile({
          origin: g.castOrigin(p, a.flat), dir, speed, gravity: grav, damage: 0, color: 0x6affd0, size: 0.32, trail: 'green', life: 2.5, explodeOnExpire: true,
          onHit(pos) {
            g.explode(pos, radius, p.dmg(48 * pw(r)), 'green');
            if (r >= 4) {
              for (let i = 0; i < 3; i++) {
                const ang = Math.random() * Math.PI * 2;
                const d = new THREE.Vector3(Math.cos(ang) * 0.5, 1, Math.sin(ang) * 0.5).normalize();
                g.spawnProjectile({
                  origin: pos.clone().add(new THREE.Vector3(0, 0.6, 0)), dir: d, speed: 9, gravity: 22, damage: 0, color: 0x6affd0, size: 0.2, trail: 'green', life: 2, explodeOnExpire: true,
                  onHit(q) { g.explode(q, 3, p.dmg(20 * pw(r)), 'green'); },
                });
              }
            }
          },
        });
        g.sfx('whoosh', p.pos);
      },
    },
    {
      id: 'barrage', name: 'Chuva de Balas', icon: '🌪️', cd: 14, mp: 40,
      desc: 'Dispara uma sequência rápida de tiros.',
      upg: 'Mais tiros por rajada.',
      run(g, p, r) {
        p.channel = { n: 12 + 3 * r, interval: 0.075, t: 0, fn: () => gunShot(g, p, Math.max(1, r), 0.12) };
      },
    },
  ],
};

export const CLASSES = { warrior, mage, gunner };

// ======================= TALENTOS PASSIVOS =======================
export const PASSIVES = [
  { id: 'vit', name: 'Vitalidade', icon: '❤️', desc: '+8% de vida máxima por ponto.' },
  { id: 'wis', name: 'Sabedoria', icon: '💧', desc: '+8% de mana máxima e +12% de regeneração por ponto.' },
  { id: 'pow', name: 'Poder', icon: '💪', desc: '+6% de dano em todas as habilidades por ponto.' },
  { id: 'agi', name: 'Agilidade', icon: '🦶', desc: '+4% de velocidade e +3% de chance de crítico por ponto.' },
];

export function cooldownFor(ability, rank) {
  return ability.cd * (1 - 0.07 * (rank - 1));
}
