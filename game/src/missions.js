// 5-mission "Bayline Syndicate" story arc with waypoints, dialogue, and rewards.

import { MISSIONS } from './config.js';
import { createVehicle } from './vehicles.js';
import { createPed } from './pedestrians.js';

export class MissionManager {
  constructor() {
    this.completedCount = 0;
    this.active = null; // current mission definition
    this.stage = 'idle'; // 'idle' | 'active'
    this.waypoint = null;
    this.targetVehicle = null;
    this.convoyVehicles = [];
    this.targetPeds = [];
    this.dialogue = { speaker: '', text: '', timer: 0 };
  }

  reset() {
    this.completedCount = 0;
    this.active = null;
    this.stage = 'idle';
    this.waypoint = null;
    this.targetVehicle = null;
    this.convoyVehicles = [];
    this.targetPeds = [];
    this.dialogue = { speaker: '', text: '', timer: 0 };
  }

  say(speaker, text, duration = 6.0) {
    this.dialogue = { speaker, text, timer: duration };
  }

  getNextMission() {
    return MISSIONS[this.completedCount] || null;
  }

  startNextMission(state, audio) {
    const m = this.getNextMission();
    if (!m || this.active) return false;

    this.active = m;
    this.stage = 'active';
    this.targetVehicle = null;
    this.convoyVehicles = [];
    this.targetPeds = [];
    this.say(m.speaker, m.intro, 7.5);
    audio.playPickup();

    if (m.type === 'deliver') {
      this.waypoint = { x: m.target.x, y: m.target.y, color: '#ffbe3b', label: 'DROP ZONE' };
    } else if (m.type === 'steal_deliver') {
      const car = createVehicle(m.vehicleType, m.vehiclePos.x, m.vehiclePos.y, 0, {
        color: m.vehicleColor,
        driver: null,
        missionTag: 'repo',
      });
      state.vehicles.push(car);
      this.targetVehicle = car;
      this.waypoint = { x: car.x, y: car.y, color: '#ff2e93', label: 'SOLANO GT' };
    } else if (m.type === 'eliminate') {
      for (let i = 0; i < m.enemyCount; i++) {
        const a = (i / m.enemyCount) * Math.PI * 2;
        const gx = m.area.x + Math.cos(a) * 75;
        const gy = m.area.y + Math.sin(a) * 65;
        const guard = createPed(gx, gy, 'syndicate', { missionTag: 'harbor' });
        state.peds.push(guard);
        this.targetPeds.push(guard);
      }
      this.waypoint = { x: m.area.x, y: m.area.y, color: '#ff3b5c', label: 'SYNDICATE DOCK' };
    } else if (m.type === 'convoy') {
      for (const tv of m.targetVehicles) {
        const suv = createVehicle('syndicate_suv', tv.x, tv.y, tv.angle, {
          driver: 'syndicate',
          color: '#2d1436',
          missionTag: 'convoy',
        });
        state.vehicles.push(suv);
        this.convoyVehicles.push(suv);
      }
      this.waypoint = { x: this.convoyVehicles[0].x, y: this.convoyVehicles[0].y, color: '#ff3b5c', label: 'CONVOY' };
    } else if (m.type === 'kingpin') {
      const boss = createPed(m.area.x, m.area.y, 'kingpin', { missionTag: 'kingpin' });
      state.peds.push(boss);
      this.targetPeds.push(boss);
      for (let i = 0; i < m.enemyCount - 1; i++) {
        const a = (i / (m.enemyCount - 1)) * Math.PI * 2;
        const gx = m.area.x + Math.cos(a) * 85;
        const gy = m.area.y + Math.sin(a) * 85;
        const guard = createPed(gx, gy, 'syndicate', { missionTag: 'kingpin' });
        state.peds.push(guard);
        this.targetPeds.push(guard);
      }
      this.waypoint = { x: m.area.x, y: m.area.y, color: '#ff2e93', label: 'MARCUS KADE' };
    }
    return true;
  }

  update(state, dt, fx, audio) {
    if (this.dialogue.timer > 0) {
      this.dialogue.timer = Math.max(0, this.dialogue.timer - dt);
    }

    const { player } = state;

    // Free roam: check mission trigger beacon
    if (!this.active) {
      const next = this.getNextMission();
      if (next) {
        this.waypoint = { x: next.start.x, y: next.start.y, color: '#00f0ff', label: `M${next.id}: ${next.title}` };
        if (Math.hypot(player.x - next.start.x, player.y - next.start.y) < 54) {
          this.startNextMission(state, audio);
        }
      } else {
        this.waypoint = null;
      }
      return;
    }

    const m = this.active;
    if (m.type === 'deliver') {
      if (Math.hypot(player.x - m.target.x, player.y - m.target.y) < 62) {
        this.completeMission(state, fx, audio);
      }
    } else if (m.type === 'steal_deliver') {
      if (this.targetVehicle && player.vehicle === this.targetVehicle) {
        if (!this.targetVehicle._triggeredHeat) {
          this.targetVehicle._triggeredHeat = true;
          state.police.setStars(m.wantedOnSteal || 2);
          this.say('Metro Dispatch', 'Stolen magenta Solano GT spotted! All units intercept!', 4.5);
        }
        this.waypoint = { x: m.target.x, y: m.target.y, color: '#ffbe3b', label: 'MIDTOWN GARAGE' };
        if (Math.hypot(player.x - m.target.x, player.y - m.target.y) < 68) {
          this.completeMission(state, fx, audio);
        }
      } else if (this.targetVehicle && !this.targetVehicle.exploded) {
        this.waypoint = { x: this.targetVehicle.x, y: this.targetVehicle.y, color: '#ff2e93', label: 'SOLANO GT' };
      }
    } else if (m.type === 'eliminate' || m.type === 'kingpin') {
      const alive = this.targetPeds.filter((p) => p.alive);
      if (alive.length === 0) {
        this.completeMission(state, fx, audio);
      } else {
        this.waypoint = { x: alive[0].x, y: alive[0].y, color: '#ff3b5c', label: `${alive.length} LEFT` };
      }
    } else if (m.type === 'convoy') {
      const alive = this.convoyVehicles.filter((v) => !v.exploded);
      if (alive.length === 0) {
        this.completeMission(state, fx, audio);
      } else {
        this.waypoint = { x: alive[0].x, y: alive[0].y, color: '#ff3b5c', label: `${alive.length} SUV LEFT` };
      }
    }
  }

  completeMission(state, fx, audio) {
    const m = this.active;
    state.player.cash += m.reward;
    fx.spawnPopup(state.player.x, state.player.y - 30, `MISSION COMPLETE +$${m.reward}`, '#ffbe3b');
    this.say(m.speaker, m.outro, 7.0);
    audio.playMissionComplete();
    this.completedCount++;
    this.active = null;
    this.stage = 'idle';
    this.targetVehicle = null;
    this.convoyVehicles = [];
    this.targetPeds = [];
    state.police.reset();
  }

  getHudSummary() {
    if (this.active) {
      let extra = '';
      if (this.active.type === 'eliminate' || this.active.type === 'kingpin') {
        const left = this.targetPeds.filter((p) => p.alive).length;
        extra = ` (${left} remaining)`;
      } else if (this.active.type === 'convoy') {
        const left = this.convoyVehicles.filter((v) => !v.exploded).length;
        extra = ` (${left} remaining)`;
      }
      return {
        tag: `MISSION ${this.active.id} / ${MISSIONS.length}`,
        title: this.active.title,
        objective: this.active.objective + extra,
      };
    }
    const next = this.getNextMission();
    if (next) {
      return {
        tag: 'FREE ROAM · BAYLINE SYNDICATE',
        title: `Next: ${next.title}`,
        objective: 'Reach the cyan beacon or press M to start the job.',
      };
    }
    return {
      tag: 'CITY LEGEND',
      title: 'Solaris Bay Conquered',
      objective: 'All 5 Bayline Syndicate missions complete. Own the streets!',
    };
  }
}
