// Moradores da vila: o Ancião (que dá missões) e aldeões com dicas.
import * as THREE from 'three';
import { buildHumanoid, animateHumanoid } from './character.js';
import { heightAt } from './terrain.js';
import { lerpAngle } from './noise.js';

function markerTexture(ch, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 54px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 6;
  x.strokeStyle = '#000';
  x.strokeText(ch, 32, 34);
  x.fillStyle = color;
  x.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VILLAGERS = [
  {
    name: 'Ferreira Brida', look: { body: 0x5a4a3a, legs: 0x3a3028, skin: 0xc68e62, accent: 0x777777, weapon: 'club' }, home: [-10, 12],
    lines: [
      'Cada nível te dá 2 pontos de habilidade. Aperte K para abrir a árvore de habilidades!',
      'Melhorar uma habilidade aumenta o dano, reduz a recarga e libera efeitos novos no nível máximo.',
    ],
  },
  {
    name: 'Caçador Ravi', look: { body: 0x3a5a2a, legs: 0x3a3028, skin: 0xe0b48a, accent: 0x6b4a2f, hat: 'hood', weapon: 'bow' }, home: [12, 10],
    lines: [
      'Os acampamentos mais longe da vila têm inimigos mais fortes. Fique de olho no nível deles.',
      'Segure SHIFT para correr e ESPAÇO para pular. Orbes verdes recuperam vida e mana.',
    ],
  },
  {
    name: 'Viajante Nara', look: { body: 0x7a3a6a, legs: 0x4a2a4a, skin: 0xf0c8a0, accent: 0xd4af37, robe: true, weapon: 'none' }, home: [-4, -14],
    lines: [
      'Dizem que um Golem Ancião desperta nas terras distantes... Veja a caveira no seu minimapa.',
      'À noite as janelas da vila se acendem. Uma visão linda depois de uma longa caçada.',
    ],
  },
];

export class NPCs {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.tex = { '!': markerTexture('!', '#ffd84a'), '?': markerTexture('?', '#ffd84a') };

    const elder = this.make('Ancião Aldric', { body: 0x5a3f7a, legs: 0x3a2a55, skin: 0xe8c39e, accent: 0xd4af37, hat: 'beard', weapon: 'staff', robe: true, orbColor: 0x6ad0ff }, [5, -6]);
    elder.isElder = true;
    elder.wander = false;
    this.elder = elder;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex['!'], depthWrite: false, fog: false }));
    this.marker.scale.set(1.2, 1.2, 1);
    game.scene.add(this.marker);

    for (const v of VILLAGERS) {
      const n = this.make(v.name, v.look, v.home);
      n.lines = v.lines;
      n.lineIdx = 0;
    }
  }

  make(name, look, home) {
    const rig = buildHumanoid(look);
    const pos = rig.root.position;
    pos.set(home[0], heightAt(home[0], home[1]), home[1]);
    this.g.scene.add(rig.root);
    const n = { name, rig, pos, home: pos.clone(), yaw: Math.random() * 6, target: pos.clone(), t: Math.random() * 4, phase: 0, wander: true };
    this.list.push(n);
    return n;
  }

  nearest(p) {
    let best = null, bd = 3.6;
    for (const n of this.list) {
      const d = n.pos.distanceTo(p);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  talk(n) {
    const g = this.g;
    if (n.isElder) { g.quests.talk(); return; }
    g.ui.showDialog(n.name, [n.lines[n.lineIdx % n.lines.length]]);
    n.lineIdx++;
  }

  update(dt, time) {
    const p = this.g.player;
    for (const n of this.list) {
      let moving = false;
      const near = p && n.pos.distanceTo(p.pos) < 6;
      if (near) {
        n.yaw = lerpAngle(n.yaw, Math.atan2(p.pos.x - n.pos.x, p.pos.z - n.pos.z), 1 - Math.exp(-6 * dt));
      } else if (n.wander) {
        n.t -= dt;
        if (n.t <= 0) {
          n.t = 3 + Math.random() * 5;
          const a = Math.random() * Math.PI * 2, r = Math.random() * 5;
          n.target.set(n.home.x + Math.cos(a) * r, 0, n.home.z + Math.sin(a) * r);
        }
        const dx = n.target.x - n.pos.x, dz = n.target.z - n.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.5) {
          moving = true;
          n.pos.x += (dx / d) * 1.8 * dt;
          n.pos.z += (dz / d) * 1.8 * dt;
          n.yaw = lerpAngle(n.yaw, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
          this.g.world.resolveCollision(n.pos, 0.5);
        }
      }
      n.pos.y = heightAt(n.pos.x, n.pos.z);
      n.rig.root.rotation.y = n.yaw;
      n.phase += moving ? dt * 1.8 * 1.35 : 0;
      animateHumanoid(n.rig, n.phase, moving ? 0.3 : 0, time);
    }

    const m = this.g.quests.marker();
    this.marker.visible = !!m;
    if (m) {
      this.marker.material.map = this.tex[m];
      this.marker.position.copy(this.elder.pos);
      this.marker.position.y += 3.3 + Math.sin(time * 3) * 0.15;
    }
  }
}
