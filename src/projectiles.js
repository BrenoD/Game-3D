// Projéteis: tiros, magias, flechas e rochas — do jogador e dos inimigos.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

const sphereGeo = new THREE.IcosahedronGeometry(1, 1);
const arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.9);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, flatShading: true });

export class Projectiles {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.tmp = new THREE.Vector3();
  }

  spawn(o) {
    let mesh;
    if (o.mesh === 'arrow') mesh = new THREE.Mesh(arrowGeo, arrowMat);
    else if (o.rock) {
      mesh = new THREE.Mesh(rockGeo, o.color ? new THREE.MeshStandardMaterial({ color: 0x3a2a20, emissive: o.color, emissiveIntensity: 1.2, flatShading: true }) : rockMat);
      mesh.castShadow = true;
    } else mesh = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: o.color ?? 0xffffff }));
    mesh.scale.setScalar(o.size ?? 0.3);
    mesh.position.copy(o.origin);
    this.g.scene.add(mesh);
    const p = {
      ...o,
      mesh,
      pos: mesh.position,
      prev: o.origin.clone(),
      vel: o.dir.clone().normalize().multiplyScalar(o.speed),
      life: o.life ?? 3,
      owner: o.owner ?? 'player',
      radius: o.hitRadius ?? Math.max(0.35, (o.size ?? 0.3) * 1.2),
      hit: new Set(),
      dead: false,
    };
    this.list.push(p);
    return p;
  }

  kill(p, pos, enemy) {
    if (p.dead) return;
    p.dead = true;
    if (p.impact) this.g.fx.impact(pos, p.impact);
    p.onHit?.(pos.clone(), enemy);
  }

  update(dt) {
    const g = this.g;
    for (const p of this.list) {
      if (p.dead) continue;
      p.life -= dt;
      p.prev.copy(p.pos);

      // teleguiado
      if (p.homing && !p.homing.dead) {
        const want = this.tmp.copy(p.homing.center()).sub(p.pos).normalize().multiplyScalar(p.speed);
        p.vel.lerp(want, Math.min(1, (p.turn ?? 3) * dt));
      }
      if (p.gravity) p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);

      if (p.mesh.geometry === arrowGeo) p.mesh.lookAt(this.tmp.copy(p.pos).add(p.vel));
      else if (p.rock) { p.mesh.rotation.x += dt * 5; p.mesh.rotation.z += dt * 3; }

      if (p.trail) g.fx.trail(p.trail, p.prev, p.pos);

      // colisão com personagens
      if (p.owner === 'player') {
        for (const e of g.enemies.active) {
          if (e.dead || p.hit.has(e)) continue;
          const c = e.center();
          const r = p.radius + e.type.radius;
          if (segmentPointDist2(p.prev, p.pos, c) < r * r) {
            p.hit.add(e);
            if (p.damage > 0) g.damageEnemy(e, p.damage, { knock: p.knock ?? 3, from: p.prev, impact: p.impact ? null : 'hit' });
            if (!p.pierce) { this.kill(p, p.pos, e); break; }
            else if (p.impact) g.fx.impact(c, p.impact);
          }
        }
      } else if (!g.player.dead) {
        const c = g.player.pos.clone(); c.y += 1.1;
        if (segmentPointDist2(p.prev, p.pos, c) < (p.radius + 0.6) ** 2) {
          g.player.takeDamage(p.damage, p.prev);
          this.kill(p, p.pos, null);
        }
      }
      if (p.dead) continue;

      // chão / água
      const h = heightAt(p.pos.x, p.pos.z);
      if (p.pos.y <= h) {
        p.pos.y = h + 0.1;
        this.kill(p, p.pos, null);
        continue;
      }
      if (p.life <= 0) {
        if (p.explodeOnExpire) this.kill(p, p.pos, null);
        else p.dead = true;
      }
    }

    // remover mortos
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.dead) continue;
      this.g.scene.remove(p.mesh);
      if (p.mesh.material !== arrowMat && p.mesh.material !== rockMat) p.mesh.material.dispose();
      this.list.splice(i, 1);
    }
  }
}

const ab = new THREE.Vector3(), ap = new THREE.Vector3();
function segmentPointDist2(a, b, p) {
  ab.subVectors(b, a);
  ap.subVectors(p, a);
  const len2 = ab.lengthSq();
  const t = len2 > 0 ? Math.max(0, Math.min(1, ap.dot(ab) / len2)) : 0;
  return ap.addScaledVector(ab, -t).lengthSq();
}
