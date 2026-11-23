// HUD controller, live minimap renderer, pause/save UI, and screen transitions.

import { WORLD, WEAPONS } from './config.js';
import { listSaves, hasAnySave } from './save.js';

export class HudController {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.hudEl = document.getElementById('hud');
    this.startScreen = document.getElementById('start-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.statusBanner = document.getElementById('status-banner');
    this.bannerTitle = document.getElementById('banner-title');
    this.bannerSub = document.getElementById('banner-sub');

    this.missionTag = document.getElementById('mission-tag');
    this.missionTitle = document.getElementById('mission-title');
    this.missionObj = document.getElementById('mission-obj');
    this.stars = Array.from(document.querySelectorAll('#wanted-row .star'));
    this.cashDisplay = document.getElementById('cash-display');
    this.hpBar = document.getElementById('hp-bar');
    this.armBar = document.getElementById('arm-bar');
    this.weaponName = document.getElementById('weapon-name');
    this.weaponAmmo = document.getElementById('weapon-ammo');
    this.dialogueBox = document.getElementById('dialogue-box');
    this.dialogueSpeaker = document.getElementById('dialogue-speaker');
    this.dialogueText = document.getElementById('dialogue-text');
    this.promptPill = document.getElementById('prompt-pill');
    this.districtPill = document.getElementById('district-pill');
    this.radioPill = document.getElementById('radio-pill');
    this.speedoCard = document.getElementById('speedo-card');
    this.speedoNum = document.getElementById('speedo-num');
    this.speedoVeh = document.getElementById('speedo-veh');
    this.saveSlotsEl = document.getElementById('save-slots');

    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.mctx = this.minimapCanvas.getContext('2d');

    document.getElementById('btn-new-game').addEventListener('click', () => callbacks.onNewGame());
    document.getElementById('btn-continue').addEventListener('click', () => callbacks.onContinue());
    document.getElementById('btn-resume').addEventListener('click', () => callbacks.onResume());
    document.getElementById('btn-to-menu').addEventListener('click', () => callbacks.onToMenu());
    document.getElementById('btn-respawn').addEventListener('click', () => callbacks.onRespawn());

    this.refreshContinueButton();
  }

  refreshContinueButton() {
    const btn = document.getElementById('btn-continue');
    btn.style.opacity = hasAnySave() ? '1' : '0.48';
  }

  setMode(mode, extra = {}) {
    this.startScreen.classList.toggle('hidden', mode !== 'menu');
    this.pauseScreen.classList.toggle('hidden', mode !== 'paused');
    this.statusBanner.classList.toggle('hidden', mode !== 'wasted' && mode !== 'busted');
    this.hudEl.classList.toggle('hidden', mode === 'menu');

    if (mode === 'paused') this.renderSaveSlots();
    if (mode === 'wasted') {
      this.bannerTitle.textContent = 'WASTED';
      this.bannerTitle.className = 'banner-title banner-wasted';
      this.bannerSub.textContent = extra.sub || 'Discharged from Solaris General · -$200';
    } else if (mode === 'busted') {
      this.bannerTitle.textContent = 'BUSTED';
      this.bannerTitle.className = 'banner-title banner-busted';
      this.bannerSub.textContent = extra.sub || 'Released from Metro PD Precinct · -$300';
    }
  }

  renderSaveSlots() {
    const slots = listSaves();
    this.saveSlotsEl.innerHTML = '';
    for (const s of slots) {
      const row = document.createElement('div');
      row.className = 'slot-row';
      const info = document.createElement('div');
      if (s.data) {
        info.innerHTML = `<b>Slot ${s.slot}</b> · $${s.data.cash} · M${s.data.completedMissions}/5 · ${s.data.district}`;
      } else {
        info.innerHTML = `<b>Slot ${s.slot}</b> · <span style="color:#8b97b8">Empty</span>`;
      }
      const actions = document.createElement('div');
      actions.className = 'slot-actions';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-secondary btn-sm';
      saveBtn.textContent = 'Save';
      saveBtn.onclick = () => {
        this.callbacks.onSaveSlot(s.slot);
        this.renderSaveSlots();
        this.refreshContinueButton();
      };
      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-ghost btn-sm';
      loadBtn.textContent = 'Load';
      loadBtn.disabled = !s.data;
      loadBtn.style.opacity = s.data ? '1' : '0.4';
      loadBtn.onclick = () => this.callbacks.onLoadSlot(s.slot);
      actions.append(saveBtn, loadBtn);
      row.append(info, actions);
      this.saveSlotsEl.appendChild(row);
    }
  }

  update(state, audio) {
    const { player, police, missions, time } = state;

    // Mission box
    const ms = missions.getHudSummary();
    this.missionTag.textContent = ms.tag;
    this.missionTitle.textContent = ms.title;
    this.missionObj.textContent = ms.objective;

    // Wanted stars
    const flashBlue = Math.floor(time * 6) % 2 === 0;
    for (let i = 0; i < 5; i++) {
      const el = this.stars[i];
      el.className = 'star';
      if (i < police.wanted) {
        el.classList.add('active');
        if (police.wanted >= 1) {
          el.classList.add(flashBlue ? 'flash-blue' : 'flash-red');
        }
      }
    }

    // Vitals & weapon
    this.cashDisplay.textContent = `$${player.cash.toLocaleString()}`;
    this.hpBar.style.width = `${Math.max(0, Math.min(100, player.hp))}%`;
    this.armBar.style.width = `${Math.max(0, Math.min(100, player.armor))}%`;

    const w = WEAPONS[player.weaponIndex];
    this.weaponName.textContent = w.name;
    this.weaponAmmo.textContent = w.melee ? '∞' : `${player.ammo[player.weaponIndex]}`;

    // Dialogue
    if (missions.dialogue.timer > 0) {
      this.dialogueBox.classList.add('visible');
      this.dialogueSpeaker.textContent = `${missions.dialogue.speaker}:`;
      this.dialogueText.textContent = missions.dialogue.text;
    } else {
      this.dialogueBox.classList.remove('visible');
    }

    // Context prompt
    if (state.contextPrompt) {
      this.promptPill.textContent = state.contextPrompt;
      this.promptPill.classList.add('visible');
    } else {
      this.promptPill.classList.remove('visible');
    }

    // District & radio
    this.districtPill.textContent = state.currentDistrict;
    this.radioPill.textContent = `RADIO: ${audio.getStation().name}`;

    // Speedometer
    if (player.vehicle) {
      this.speedoCard.classList.remove('hidden');
      const mph = Math.round(player.vehicle.speed * 0.24);
      this.speedoNum.textContent = `${mph}`;
      this.speedoVeh.textContent = player.vehicle.spec.name;
    } else {
      this.speedoCard.classList.add('hidden');
    }

    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const ctx = this.mctx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const { player, city, vehicles, peds, missions, time } = state;

    ctx.fillStyle = '#0c1628';
    ctx.fillRect(0, 0, W, H);

    const scale = 0.088;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-player.x, -player.y);

    // Land & Ocean
    ctx.fillStyle = '#182236';
    ctx.fillRect(0, 0, WORLD.beachX, WORLD.height);
    ctx.fillStyle = '#d4b47c';
    ctx.fillRect(WORLD.beachX, 0, WORLD.oceanX - WORLD.beachX, WORLD.height);
    ctx.fillStyle = '#0c5c7d';
    ctx.fillRect(WORLD.oceanX, 0, WORLD.width - WORLD.oceanX, WORLD.height);

    // Parks
    ctx.fillStyle = '#1f5e4b';
    for (const pk of city.parks) ctx.fillRect(pk.x, pk.y, pk.w, pk.h);

    // Roads
    ctx.fillStyle = '#33405c';
    for (const vx of WORLD.vRoads) ctx.fillRect(vx - WORLD.roadWidth / 2, 0, WORLD.roadWidth, WORLD.height);
    for (const hy of WORLD.hRoads) ctx.fillRect(0, hy - WORLD.roadWidth / 2, WORLD.beachX + 20, WORLD.roadWidth);

    // Buildings
    ctx.fillStyle = '#536487';
    for (const b of city.buildings) ctx.fillRect(b.x, b.y, b.w, b.h);

    // Mission waypoint
    if (missions.waypoint) {
      const wp = missions.waypoint;
      const pulse = 36 + Math.sin(time * 6) * 14;
      ctx.strokeStyle = wp.color;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = wp.color;
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police & syndicate blips
    const flash = Math.floor(time * 8) % 2 === 0;
    for (const v of vehicles) {
      if (v.exploded) continue;
      if (v.driver === 'police') {
        ctx.fillStyle = flash ? '#ff3b5c' : '#36b5ff';
        ctx.beginPath();
        ctx.arc(v.x, v.y, 24, 0, Math.PI * 2);
        ctx.fill();
      } else if (v.driver === 'syndicate') {
        ctx.fillStyle = '#ff2e93';
        ctx.beginPath();
        ctx.arc(v.x, v.y, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const p of peds) {
      if (!p.alive) continue;
      if (p.role === 'syndicate' || p.role === 'kingpin') {
        ctx.fillStyle = '#ff3b5c';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // Player heading arrow in center
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#00f0ff';
    ctx.strokeStyle = '#08101f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
