// Interface: seleção de classe, HUD, minimapa, diálogos, registro e árvore de habilidades.
import { CLASSES, PASSIVES, MAX_RANK, cooldownFor } from './classes.js';
import { heightAt, WORLD_HALF } from './terrain.js';
import { smoothstep } from './noise.js';

const $ = (id) => document.getElementById(id);
const KEYS = ['🖱️', '1', '2', '3'];

export class UI {
  constructor(game) {
    this.g = game;
    this.dialog = null;
    this.skillsOpen = false;
    this.mm = $('minimap').getContext('2d');
    this.buildMapBase();
  }

  // ---------- seleção de classe ----------
  showClassSelect(onPick) {
    const wrap = $('class-cards');
    wrap.innerHTML = '';
    for (const [id, c] of Object.entries(CLASSES)) {
      const card = document.createElement('button');
      card.className = 'class-card';
      const stats = Object.entries(c.stats).map(([k, v]) => `<div class="stat"><span>${k}</span><i style="--v:${v * 20}%"></i></div>`).join('');
      const abil = c.abilities.map((a, i) => `<li><span class="kbd">${KEYS[i]}</span>${a.icon} ${a.name}</li>`).join('');
      card.innerHTML = `<div class="emoji">${c.emoji}</div><h2>${c.name}</h2><div class="role">${c.role}</div><p>${c.desc}</p>${stats}<ul>${abil}</ul><div class="pick">Escolher</div>`;
      card.onclick = () => onPick(id);
      wrap.appendChild(card);
    }
  }

  // ---------- HUD ----------
  setupHud(player) {
    $('pf-class').textContent = `${player.cls.emoji} ${player.cls.name}`;
    const bar = $('abilities');
    bar.innerHTML = '';
    this.slots = player.cls.abilities.map((a, i) => {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<div class="icon">${a.icon}</div><div class="cd"></div><div class="cdtext"></div><span class="key">${KEYS[i]}</span><span class="rank"></span>${a.mp ? `<span class="mana">${a.mp}</span>` : ''}`;
      el.title = `${a.name}\n${a.desc}`;
      bar.appendChild(el);
      return { el, cd: el.querySelector('.cd'), cdtext: el.querySelector('.cdtext'), rank: el.querySelector('.rank') };
    });
    this.buildSkillPanel(player);
    this.refreshSkills();
  }

  update() {
    const g = this.g, p = g.player;
    if (!p) return;
    $('hp-fill').style.width = `${(p.hp / p.maxHp) * 100}%`;
    $('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('mp-fill').style.width = `${(p.mp / p.maxMp) * 100}%`;
    $('mp-text').textContent = `${Math.floor(p.mp)} / ${p.maxMp}`;
    $('st-fill').style.width = `${p.stamina}%`;
    $('pf-level').textContent = `Nível ${p.level}`;
    $('xp-fill').style.width = `${(p.xp / p.xpNext) * 100}%`;
    $('xp-text').textContent = `XP ${p.xp} / ${p.xpNext}`;
    $('buff').classList.toggle('hidden', !(p.buffs.dmg > 0));
    $('sp-badge').classList.toggle('hidden', p.skillPoints <= 0);
    $('sp-badge').textContent = `${p.skillPoints} ponto${p.skillPoints > 1 ? 's' : ''} de habilidade — ${this.g.isTouch ? 'toque aqui ⭐' : 'K'}`;

    p.cls.abilities.forEach((a, i) => {
      const s = this.slots[i];
      const cd = p.cooldowns[i], max = p.cooldownMax(i);
      s.cd.style.height = cd > 0 ? `${(cd / max) * 100}%` : '0%';
      s.cdtext.textContent = cd > 0.95 ? Math.ceil(cd) : '';
      s.el.classList.toggle('nomana', p.mp < a.mp);
    });

    $('quest-text').innerHTML = g.quests.text();
    $('clock').textContent = g.world.clockText();

    const boss = g.enemies.boss;
    const showBoss = boss && !boss.dead && boss.state === 'chase';
    $('boss-bar').classList.toggle('hidden', !showBoss);
    if (showBoss) $('boss-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;

    this.drawMinimap();
  }

  // ---------- minimapa ----------
  buildMapBase() {
    const N = 300;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i / N) * WORLD_HALF * 2 - WORLD_HALF, z = (j / N) * WORLD_HALF * 2 - WORLD_HALF;
        const h = heightAt(x, z);
        let r, gg, b;
        if (h < -1.4) { r = 30; gg = 80; b = 140; }
        else if (h < 0) { r = 50; gg = 120; b = 170; }
        else if (h < 1.3) { r = 200; gg = 185; b = 130; }
        else if (h < 18) { const k = smoothstep(1.3, 18, h); r = 70 + k * 30; gg = 130 - k * 20; b = 55; }
        else if (h < 34) { r = 120; gg = 112; b = 100; }
        else { r = 235; gg = 238; b = 245; }
        const o = (j * N + i) * 4;
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mapBase = c;
    this.mapK = N / (WORLD_HALF * 2);
  }

  drawMinimap() {
    const g = this.g, p = g.player, ctx = this.mm;
    const S = 180, view = 150, sc = S / view, k = this.mapK;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(p.camYaw);
    const sx = (p.pos.x + WORLD_HALF) * k, sz = (p.pos.z + WORLD_HALF) * k;
    ctx.drawImage(this.mapBase, sx - (view * k) / 2, sz - (view * k) / 2, view * k, view * k, -S / 2, -S / 2, S, S);
    const dot = (x, z, color, r) => {
      const px = (x - p.pos.x) * sc, pz = (z - p.pos.z) * sc;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, pz, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const clampDot = (x, z, draw) => {
      let px = (x - p.pos.x) * sc, pz = (z - p.pos.z) * sc;
      const d = Math.hypot(px, pz), max = S / 2 - 10;
      if (d > max) { px *= max / d; pz *= max / d; }
      draw(px, pz);
    };
    // vila
    dot(0, 0, '#ffb040', 5);
    for (const camp of g.enemies.camps) dot(camp.pos.x, camp.pos.z, 'rgba(120,20,20,0.6)', 4);
    for (const e of g.enemies.active) if (!e.type.boss) dot(e.pos.x, e.pos.z, e.state === 'chase' ? '#ff3030' : '#d05050', 2.5);
    // chefe
    const bh = g.enemies.boss ? g.enemies.boss.pos : null;
    if (bh) clampDot(bh.x, bh.z, (x, z) => { ctx.save(); ctx.translate(x, z); ctx.rotate(-p.camYaw); ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💀', 0, 0); ctx.restore(); });
    // ancião
    const el = g.npcs.elder.pos;
    const mark = g.quests.marker();
    clampDot(el.x, el.z, (x, z) => {
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath(); ctx.arc(x, z, mark ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
      if (mark) { ctx.save(); ctx.translate(x, z); ctx.rotate(-p.camYaw); ctx.fillStyle = '#000'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(mark, 0, 0.5); ctx.restore(); }
    });
    for (const o of g.orbs.list) dot(o.pos.x, o.pos.z, '#6aff8a', 2);
    // jogador
    ctx.rotate(-p.yaw + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(212,175,55,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------- registro de mensagens ----------
  log(msg, cls = '') {
    const el = document.createElement('div');
    el.className = 'log-line ' + cls;
    el.textContent = msg;
    $('log').appendChild(el);
    setTimeout(() => el.classList.add('fade'), 5000);
    setTimeout(() => el.remove(), 6000);
    while ($('log').children.length > 6) $('log').firstChild.remove();
  }

  hurt() {
    const v = $('vignette');
    v.classList.remove('flash');
    void v.offsetWidth;
    v.classList.add('flash');
  }

  setInteract(text) {
    const el = $('interact-hint');
    el.classList.toggle('hidden', !text);
    if (text) el.innerHTML = `<span class="key">E</span> ${text}`;
  }

  // ---------- diálogos ----------
  showDialog(name, lines, onDone) {
    this.dialog = { name, lines, i: 0, onDone };
    $('dialog').classList.remove('hidden');
    $('dialog-name').textContent = name;
    $('dialog-text').textContent = lines[0];
    this.g.sfx('click');
  }

  advanceDialog() {
    const d = this.dialog;
    if (!d) return false;
    d.i++;
    this.g.sfx('click');
    if (d.i >= d.lines.length) {
      this.dialog = null;
      $('dialog').classList.add('hidden');
      d.onDone?.();
    } else $('dialog-text').textContent = d.lines[d.i];
    return true;
  }

  // ---------- árvore de habilidades ----------
  buildSkillPanel(player) {
    const list = $('skill-list');
    list.innerHTML = '';
    this.skillRows = player.cls.abilities.map((a, i) => {
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.innerHTML = `
        <div class="skill-icon">${a.icon}<span class="kbd">${KEYS[i]}</span></div>
        <div class="skill-info">
          <div class="skill-name">${a.name} <span class="skill-rank"></span></div>
          <div class="skill-desc">${a.desc}</div>
          <div class="skill-upg">⬆ ${a.upg}</div>
          <div class="pips"></div>
          <div class="skill-stats"></div>
        </div>
        <button class="up">+</button>`;
      row.querySelector('.up').onclick = (e) => {
        e.stopPropagation();
        if (this.g.player.upgradeAbility(i)) this.refreshSkills();
      };
      list.appendChild(row);
      return row;
    });
    const plist = $('passive-list');
    plist.innerHTML = '';
    this.passiveRows = PASSIVES.map((ps) => {
      const row = document.createElement('div');
      row.className = 'skill-row passive';
      row.innerHTML = `
        <div class="skill-icon">${ps.icon}</div>
        <div class="skill-info">
          <div class="skill-name">${ps.name} <span class="skill-rank"></span></div>
          <div class="skill-desc">${ps.desc}</div>
          <div class="pips"></div>
        </div>
        <button class="up">+</button>`;
      row.querySelector('.up').onclick = (e) => {
        e.stopPropagation();
        if (this.g.player.upgradePassive(ps.id)) this.refreshSkills();
      };
      plist.appendChild(row);
      return { row, id: ps.id };
    });
  }

  refreshSkills() {
    const p = this.g.player;
    if (!p || !this.skillRows) return;
    $('skill-points').textContent = p.skillPoints;
    const pips = (n) => Array.from({ length: MAX_RANK }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
    p.cls.abilities.forEach((a, i) => {
      const row = this.skillRows[i], r = p.ranks[i];
      row.querySelector('.skill-rank').textContent = `Nv ${r}/${MAX_RANK}`;
      row.querySelector('.pips').innerHTML = pips(r);
      const pow = Math.round((0.22 * (r - 1)) * 100);
      row.querySelector('.skill-stats').textContent = `Poder +${pow}% · Recarga ${cooldownFor(a, r).toFixed(1)}s${a.mp ? ` · Mana ${a.mp}` : ''}`;
      row.querySelector('.up').disabled = !p.canUpgrade(i);
      if (this.slots) this.slots[i].rank.textContent = '★'.repeat(r - 1);
    });
    for (const pr of this.passiveRows) {
      const v = p.passives[pr.id];
      pr.row.querySelector('.skill-rank').textContent = `${v}/${MAX_RANK}`;
      pr.row.querySelector('.pips').innerHTML = pips(v);
      pr.row.querySelector('.up').disabled = p.skillPoints <= 0 || v >= MAX_RANK;
    }
    $('char-stats').innerHTML = `
      <div><span>Vida</span><b>${p.maxHp}</b></div>
      <div><span>Mana</span><b>${p.maxMp}</b></div>
      <div><span>Dano</span><b>${Math.round(p.dmgMult * 100)}%</b></div>
      <div><span>Crítico</span><b>${Math.round(p.crit * 100)}%</b></div>
      <div><span>Velocidade</span><b>${p.speed.toFixed(1)}</b></div>
      <div><span>Abates</span><b>${p.kills}</b></div>`;
  }

  toggleSkills(open = !this.skillsOpen) {
    this.skillsOpen = open;
    $('skills-panel').classList.toggle('hidden', !open);
    if (open) this.refreshSkills();
  }

  showDeath(show) { $('death-screen').classList.toggle('hidden', !show); }
  setPaused(show) { $('pause').classList.toggle('hidden', !show); }
}
