// Procedural Web Audio API synthesizer for SFX and toggleable synthwave coastal radio.

import { RADIO_STATIONS } from './config.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.stationIndex = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.radioStep = 0;
    this.radioTimer = 0;
    this.sirenPhase = 0;
  }

  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.unlocked = true;

      // Engine continuous hum
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();

      // Siren continuous oscillator
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 660;
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch {
      this.unlocked = false;
    }
  }

  cycleRadio() {
    this.stationIndex = (this.stationIndex + 1) % RADIO_STATIONS.length;
    return RADIO_STATIONS[this.stationIndex];
  }

  getStation() {
    return RADIO_STATIONS[this.stationIndex];
  }

  update(dt, inVehicle) {
    if (!this.unlocked || !this.ctx || this.ctx.state !== 'running') return;
    if (!inVehicle && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
    const station = RADIO_STATIONS[this.stationIndex];
    if (station.tempo > 0) {
      const beatSec = 60 / station.tempo / 2;
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) {
        this.radioTimer = beatSec;
        this.playSynthStep(station, this.radioStep++);
      }
    }
  }

  updateEngine(speedNorm, drifting) {
    if (!this.unlocked || !this.engineOsc || !this.engineGain) return;
    const freq = 52 + Math.min(1.2, speedNorm) * 125 + (drifting ? 22 : 0);
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    this.engineGain.gain.setTargetAtTime(0.035 + speedNorm * 0.035, this.ctx.currentTime, 0.06);
  }

  updateSiren(active) {
    if (!this.unlocked || !this.sirenOsc || !this.sirenGain) return;
    if (!active) {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }
    this.sirenPhase += 0.14;
    const freq = 660 + Math.sin(this.sirenPhase) * 210;
    this.sirenOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.04);
    this.sirenGain.gain.setTargetAtTime(0.032, this.ctx.currentTime, 0.08);
  }

  playSynthStep(station, step) {
    const now = this.ctx.currentTime;
    const scale = station.scale;
    const note = scale[(step * 2 + (step % 4)) % scale.length];

    // Warm synthwave bass/arp
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = step % 4 === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(step % 2 === 0 ? note * 0.5 : note, now);
    gain.gain.setValueAtTime(0.022, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  playGunshot(weaponId = 'sidearm', volume = 1) {
    if (!this.unlocked || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = weaponId === 'shotgun' ? 'sawtooth' : 'square';
    const base = weaponId === 'shotgun' ? 140 : weaponId === 'smg' ? 320 : 240;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (weaponId === 'shotgun' ? 0.18 : 0.09));
    gain.gain.setValueAtTime(0.11 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (weaponId === 'shotgun' ? 0.2 : 0.1));
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  playExplosion() {
    if (!this.unlocked || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.55);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  playPunch() {
    this.playGunshot('sidearm', 0.35);
  }

  playEmpty() {
    if (!this.unlocked || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(520, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playPickup() {
    if (!this.unlocked || !this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.06, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.14);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.16);
    });
  }

  playMissionComplete() {
    if (!this.unlocked || !this.ctx) return;
    const now = this.ctx.currentTime;
    [392, 523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.09, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.32);
    });
  }
}
