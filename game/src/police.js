// 5-star wanted system, Metro PD dispatch waves, roadblocks, and busted/wasted handling.

import { WORLD } from './config.js';
import { createVehicle } from './vehicles.js';
import { createPed } from './pedestrians.js';

export class PoliceSystem {
  constructor() {
    this.heat = 0; // 0..100+ maps to 0..5 stars
    this.wanted = 0;
    this.dispatchTimer = 2.0;
    this.evadeTimer = 0;
    this.bustedTimer = 0;
    this.lastCrimeTime = 0;
  }

  reset() {
    this.heat = 0;
    this.wanted = 0;
    this.dispatchTimer = 2.0;
    this.evadeTimer = 0;
    this.bustedTimer = 0;
  }

  setStars(stars) {
    const thresholds = [0, 20, 42, 66, 88, 112];
    this.heat = thresholds[Math.max(0, Math.min(5, stars))];
    this.wanted = Math.max(0, Math.min(5, stars));
    this.evadeTimer = 0;
  }

  addHeat(amount) {
    this.heat = Math.min(130, this.heat + amount);
    this.evadeTimer = 0;
    this.lastCrimeTime = performance.now();
    this.syncStars();
  }

  syncStars() {
    if (this.heat >= 105) this.wanted = 5;
    else if (this.heat >= 82) this.wanted = 4;
    else if (this.heat >= 60) this.wanted = 3;
    else if (this.heat >= 36) this.wanted = 2;
    else if (this.heat >= 16) this.wanted = 1;
    else this.wanted = 0;
  }

  update(state, dt, audio) {
    const { player, vehicles, peds } = state;

    // Count active police near player
    let nearestCopDist = Infinity;
    let activePoliceCars = 0;
    for (const v of vehicles) {
      if (!v.exploded && v.driver === 'police') {
        activePoliceCars++;
        const d = Math.hypot(v.x - player.x, v.y - player.y);
        if (d < nearestCopDist) nearestCopDist = d;
      }
    }
    for (const p of peds) {
      if (p.alive && p.role === 'cop') {
        const d = Math.hypot(p.x - player.x, p.y - player.y);
        if (d < nearestCopDist) nearestCopDist = d;
      }
    }

    audio.updateSiren(this.wanted > 0 && nearestCopDist < 720);

    // Heat decay when out of sight
    if (this.wanted > 0) {
      if (nearestCopDist > 560) {
        this.evadeTimer += dt;
        if (this.evadeTimer > 4.5) {
          this.heat = Math.max(0, this.heat - dt * 5.8);
          this.syncStars();
        }
      } else {
        this.evadeTimer = 0;
      }

      // Check busted condition (slow/stopped right next to police)
      const playerSpeed = player.vehicle ? player.vehicle.speed : Math.hypot(player.vx, player.vy);
      if (nearestCopDist < 78 && playerSpeed < 55) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 2.4) {
          this.bustedTimer = 0;
          state.triggerBusted();
          return;
        }
      } else {
        this.bustedTimer = Math.max(0, this.bustedTimer - dt * 1.5);
      }

      // Dispatch police units according to wanted stars
      const desiredCars = Math.min(6, this.wanted + 1);
      this.dispatchTimer -= dt;
      if (activePoliceCars < desiredCars && this.dispatchTimer <= 0) {
        this.dispatchTimer = Math.max(1.8, 5.0 - this.wanted * 0.65);
        this.spawnPoliceUnit(state);
      }
    } else {
      // Calm down any stray police cars
      for (const v of vehicles) {
        if (v.driver === 'police') {
          v.sirenOn = false;
          v.driver = 'traffic';
        }
      }
    }
  }

  spawnPoliceUnit(state) {
    const { player, vehicles, peds } = state;
    const angle = Math.random() * Math.PI * 2;
    const dist = 560 + Math.random() * 220;
    let x = Math.max(140, Math.min(WORLD.beachX - 140, player.x + Math.cos(angle) * dist));
    let y = Math.max(140, Math.min(WORLD.height - 140, player.y + Math.sin(angle) * dist));

    // Snap to nearest road for clean entry
    const nearV = WORLD.vRoads.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const nearH = WORLD.hRoads.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
    if (Math.abs(nearV - x) < Math.abs(nearH - y)) x = nearV;
    else y = nearH;

    const heavy = this.wanted >= 4 && Math.random() < 0.45;
    const carAngle = Math.atan2(player.y - y, player.x - x);
    const car = createVehicle(heavy ? 'armored_enforcer' : 'metro_interceptor', x, y, carAngle, {
      driver: 'police',
      sirenOn: true,
    });
    vehicles.push(car);

    if (this.wanted >= 2 && peds.filter((p) => p.alive && p.role === 'cop').length < this.wanted * 2) {
      peds.push(createPed(x + 28, y + 18, 'cop'));
    }
  }
}
