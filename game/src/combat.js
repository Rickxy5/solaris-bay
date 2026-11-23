// Weapons, aiming, tracers, muzzle flashes, explosions, particles, and pickups.

import { WEAPONS } from './config.js';
import { segmentHitsBuilding } from './city.js';
import { damageVehicle } from './vehicles.js';
import { alertNearbyPeds } from './pedestrians.js';

export class EffectsManager {
  constructor() {
    this.particles = [];
    this.tracers = [];
    this.muzzleFlashes = [];
    this.skidmarks = [];
    this.explosions = [];
    this.popups = [];
  }

  clear() {
    this.particles.length = 0;
    this.tracers.length = 0;
    this.muzzleFlashes.length = 0;
    this.skidmarks.length = 0;
    this.explosions.length = 0;
    this.popups.length = 0;
  }

  addSkidmark(x, y, angle) {
    this.skidmarks.push({ x, y, angle, alpha: 0.42 });
    if (this.skidmarks.length > 360) this.skidmarks.shift();
  }

  spawnParticle(x, y, opts = {}) {
    this.particles.push({
      x,
      y,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      life: opts.life || 0.4,
      maxLife: opts.life || 0.4,
      size: opts.size || 5,
      color: opts.color || '#ffffff',
    });
    if (this.particles.length > 420) this.particles.shift();
  }

  spawnSparks(x, y, count = 6) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 140;
      this.spawnParticle(x, y, {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.22 + Math.random() * 0.14,
        size: 3,
        color: Math.random() < 0.5 ? '#ffbe3b' : '#fff3b0',
      });
    }
  }

  spawnBlood(x, y, count = 5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 90;
      this.spawnParticle(x, y, {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.35 + Math.random() * 0.2,
        size: 3.5 + Math.random() * 2,
        color: '#d9264c',
      });
    }
  }

  spawnExplosion(x, y) {
    this.explosions.push({ x, y, radius: 14, maxRadius: 120, life: 0.55, maxLife: 0.55 });
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 220;
      this.spawnParticle(x, y, {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.45 + Math.random() * 0.35,
        size: 7 + Math.random() * 10,
        color: i % 3 === 0 ? '#fff2a6' : i % 3 === 1 ? '#ff6b35' : '#ff2e63',
      });
    }
  }

  spawnPopup(x, y, text, color = '#2ee68a') {
    this.popups.push({ x, y, text, color, life: 1.15, maxLife: 1.15 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      this.muzzleFlashes[i].life -= dt;
      if (this.muzzleFlashes[i].life <= 0) this.muzzleFlashes.splice(i, 1);
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      if (e.life <= 0) { this.explosions.splice(i, 1); continue; }
      const t = 1 - e.life / e.maxLife;
      e.radius = 14 + (e.maxRadius - 14) * Math.sqrt(t);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      pop.y -= 28 * dt;
      if (pop.life <= 0) this.popups.splice(i, 1);
    }
  }
}

export class CombatSystem {
  firePlayerWeapon(state, aimAngle, fx, audio) {
    const { player } = state;
    if (player.fireCooldown > 0) return;

    const weapon = WEAPONS[player.weaponIndex];
    // Drive-by requires a firearm (fallback to sidearm/smg)
    if (player.vehicle && weapon.melee) return;

    if (!weapon.melee) {
      if (player.ammo[player.weaponIndex] <= 0) {
        audio.playEmpty();
        player.fireCooldown = 0.25;
        return;
      }
      player.ammo[player.weaponIndex]--;
    }

    player.fireCooldown = weapon.cooldown;
    const muzzleDist = player.vehicle ? 20 : 18;
    const ox = player.x + Math.cos(aimAngle) * muzzleDist;
    const oy = player.y + Math.sin(aimAngle) * muzzleDist;

    if (weapon.melee) {
      audio.playPunch();
      this.resolveMelee(state, ox, oy, weapon.range, weapon.damage, fx);
      return;
    }

    audio.playGunshot(weapon.id);
    fx.muzzleFlashes.push({ x: ox, y: oy, angle: aimAngle, life: 0.065, size: weapon.id === 'shotgun' ? 18 : 13 });
    state.camera.shake = Math.max(state.camera.shake, weapon.id === 'shotgun' ? 6 : 2.5);
    alertNearbyPeds(state, ox, oy, 360);

    for (let p = 0; p < weapon.pellets; p++) {
      const spread = (Math.random() - 0.5) * weapon.spread;
      const a = aimAngle + spread;
      this.castBullet(state, ox, oy, a, weapon.range, weapon.damage, weapon.tracerColor, true, fx, audio);
    }
  }

  fireNpcShot(shooter, angle, damage, state, fx, audio) {
    const ox = shooter.x + Math.cos(angle) * 16;
    const oy = shooter.y + Math.sin(angle) * 16;
    fx.muzzleFlashes.push({ x: ox, y: oy, angle, life: 0.06, size: 11 });
    audio.playGunshot('sidearm', 0.45);
    this.castBullet(state, ox, oy, angle, 390, damage, '#ff5978', false, fx, audio);
  }

  resolveMelee(state, ox, oy, range, damage, fx) {
    for (const ped of state.peds) {
      if (!ped.alive) continue;
      if (Math.hypot(ped.x - ox, ped.y - oy) < range) {
        ped.hp -= damage;
        fx.spawnBlood(ped.x, ped.y, 4);
        state.police.addHeat(ped.role === 'cop' ? 24 : 10);
      }
    }
  }

  castBullet(state, ox, oy, angle, range, damage, color, fromPlayer, fx, audio) {
    let endX = ox + Math.cos(angle) * range;
    let endY = oy + Math.sin(angle) * range;
    let bestT = 1;
    let hitType = null;
    let hitTarget = null;

    // Wall hit
    const wallHit = segmentHitsBuilding(ox, oy, endX, endY, state.city);
    if (wallHit) {
      bestT = Math.hypot(wallHit.x - ox, wallHit.y - oy) / range;
      endX = wallHit.x;
      endY = wallHit.y;
      hitType = 'wall';
    }

    const dx = endX - ox;
    const dy = endY - oy;
    const segLen = Math.hypot(dx, dy) || 1;
    const ux = dx / segLen;
    const uy = dy / segLen;

    // Check peds
    if (fromPlayer) {
      for (const ped of state.peds) {
        if (!ped.alive) continue;
        const proj = (ped.x - ox) * ux + (ped.y - oy) * uy;
        if (proj < 0 || proj > segLen) continue;
        const perp = Math.abs((ped.x - ox) * -uy + (ped.y - oy) * ux);
        if (perp < 14 && proj / range < bestT) {
          bestT = proj / range;
          endX = ox + ux * proj;
          endY = oy + uy * proj;
          hitType = 'ped';
          hitTarget = ped;
        }
      }
    } else {
      // NPC shot vs player
      const pl = state.player;
      const proj = (pl.x - ox) * ux + (pl.y - oy) * uy;
      if (proj > 0 && proj < segLen) {
        const perp = Math.abs((pl.x - ox) * -uy + (pl.y - oy) * ux);
        const hitR = pl.vehicle ? 22 : 14;
        if (perp < hitR && proj / range < bestT) {
          bestT = proj / range;
          endX = ox + ux * proj;
          endY = oy + uy * proj;
          hitType = 'player';
        }
      }
    }

    // Check vehicles
    for (const v of state.vehicles) {
      if (v.exploded) continue;
      if (fromPlayer && v === state.player.vehicle) continue;
      const proj = (v.x - ox) * ux + (v.y - oy) * uy;
      if (proj < 0 || proj > segLen) continue;
      const perp = Math.abs((v.x - ox) * -uy + (v.y - oy) * ux);
      if (perp < v.spec.width * 0.65 && proj / range < bestT) {
        bestT = proj / range;
        endX = ox + ux * proj;
        endY = oy + uy * proj;
        hitType = 'vehicle';
        hitTarget = v;
      }
    }

    fx.tracers.push({ x1: ox, y1: oy, x2: endX, y2: endY, color, life: 0.085, maxLife: 0.085 });

    if (hitType === 'wall') {
      fx.spawnSparks(endX, endY, 4);
    } else if (hitType === 'ped' && hitTarget) {
      hitTarget.hp -= damage;
      fx.spawnBlood(endX, endY, 5);
      if (fromPlayer) {
        if (hitTarget.role === 'cop') state.police.addHeat(26);
        else if (hitTarget.role === 'citizen') state.police.addHeat(14);
        else state.police.addHeat(5);
      }
    } else if (hitType === 'vehicle' && hitTarget) {
      damageVehicle(hitTarget, damage * 0.9, state, fx, audio);
      fx.spawnSparks(endX, endY, 5);
      if (fromPlayer && hitTarget.spec.police) state.police.addHeat(16);
    } else if (hitType === 'player') {
      const pl = state.player;
      if (pl.vehicle) {
        damageVehicle(pl.vehicle, damage * 0.6, state, fx, audio);
        fx.spawnSparks(endX, endY, 3);
      } else {
        if (pl.armor > 0) {
          const absorbed = Math.min(pl.armor, damage * 0.7);
          pl.armor -= absorbed;
          pl.hp -= (damage - absorbed);
        } else {
          pl.hp -= damage;
        }
        fx.spawnBlood(endX, endY, 3);
      }
    }
  }

  updatePickups(state, dt, fx, audio) {
    const { pickups, player } = state;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.pulse = (pk.pulse || 0) + dt * 4;
      if (Math.hypot(pk.x - player.x, pk.y - player.y) < 34) {
        if (pk.type === 'cash') {
          player.cash += pk.value;
          fx.spawnPopup(pk.x, pk.y - 12, `+$${pk.value}`, '#2ee68a');
        } else if (pk.type === 'health') {
          player.hp = Math.min(100, player.hp + pk.value);
          fx.spawnPopup(pk.x, pk.y - 12, `+${pk.value} HP`, '#ff6b6b');
        } else if (pk.type === 'armor') {
          player.armor = Math.min(100, player.armor + pk.value);
          fx.spawnPopup(pk.x, pk.y - 12, `+${pk.value} ARMOR`, '#00f0ff');
        } else if (pk.type === 'ammo') {
          player.ammo[1] = Math.min(WEAPONS[1].ammoMax, player.ammo[1] + 24);
          player.ammo[2] = Math.min(WEAPONS[2].ammoMax, player.ammo[2] + 45);
          player.ammo[3] = Math.min(WEAPONS[3].ammoMax, player.ammo[3] + 10);
          fx.spawnPopup(pk.x, pk.y - 12, '+AMMO', '#ffbe3b');
        }
        audio.playPickup();
        pickups.splice(i, 1);
      }
    }
  }
}

export function spawnWorldPickups(state) {
  const spots = [
    { x: 2150, y: 1790, type: 'health', value: 45 },
    { x: 2070, y: 1850, type: 'armor', value: 50 },
    { x: 1990, y: 1760, type: 'ammo', value: 40 },
    { x: 960, y: 920, type: 'armor', value: 50 },
    { x: 2295, y: 520, type: 'health', value: 50 },
    { x: 1580, y: 1520, type: 'ammo', value: 40 },
    { x: 640, y: 1520, type: 'cash', value: 250 },
  ];
  for (const s of spots) {
    state.pickups.push({ ...s, pulse: Math.random() * 6 });
  }
}
