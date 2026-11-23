// Citizens, fleeing pedestrians, rival Syndicate guards, and police officers.

import { WORLD } from './config.js';
import { resolveCircleBuildings, segmentHitsBuilding } from './city.js';

let nextPedId = 1;

const CIVIL_SHIRTS = ['#ff6b8b', '#00d9ff', '#ffbe3b', '#5ee6a0', '#f5f5f5', '#c580ff', '#ff8c42'];

export function createPed(x, y, role = 'citizen', opts = {}) {
  return {
    id: nextPedId++,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: opts.angle ?? Math.random() * Math.PI * 2,
    role, // 'citizen' | 'syndicate' | 'kingpin' | 'cop'
    hp: role === 'kingpin' ? 220 : role === 'syndicate' ? 75 : role === 'cop' ? 85 : 40,
    maxHp: role === 'kingpin' ? 220 : role === 'syndicate' ? 75 : role === 'cop' ? 85 : 40,
    alive: true,
    panicTimer: 0,
    shootCooldown: 0.4 + Math.random() * 0.5,
    walkPhase: Math.random() * 6.28,
    shirt: opts.shirt || (
      role === 'cop' ? '#1e4280' :
      role === 'kingpin' ? '#ff2e93' :
      role === 'syndicate' ? '#2c1938' :
      CIVIL_SHIRTS[Math.floor(Math.random() * CIVIL_SHIRTS.length)]
    ),
    skin: ['#f1c29b', '#d99b70', '#a66d46', '#f7d6bc'][Math.floor(Math.random() * 4)],
    missionTag: opts.missionTag || null,
  };
}

export function spawnAmbientPeds(state, targetCount = 34) {
  let attempts = 0;
  const halfSidewalk = WORLD.roadWidth / 2 + 12;
  while (state.peds.filter((p) => p.role === 'citizen' && p.alive).length < targetCount && attempts < 90) {
    attempts++;
    let x, y;
    if (Math.random() < 0.25) {
      // Palmfront beach boardwalk / sand
      x = WORLD.beachX - 15 + Math.random() * 140;
      y = 140 + Math.random() * 1360;
    } else if (Math.random() < 0.5) {
      const rx = WORLD.vRoads[Math.floor(Math.random() * WORLD.vRoads.length)];
      x = rx + (Math.random() < 0.5 ? -halfSidewalk : halfSidewalk);
      y = 120 + Math.random() * (WORLD.height - 240);
    } else {
      const ry = WORLD.hRoads[Math.floor(Math.random() * WORLD.hRoads.length)];
      x = 120 + Math.random() * (WORLD.beachX - 180);
      y = ry + (Math.random() < 0.5 ? -halfSidewalk : halfSidewalk);
    }
    if (Math.hypot(x - state.player.x, y - state.player.y) < 180) continue;
    state.peds.push(createPed(x, y, 'citizen'));
  }
}

export function updatePeds(state, dt, combat, fx, audio) {
  const { peds, player, vehicles, city } = state;

  for (const p of peds) {
    if (!p.alive) continue;
    if (p.hp <= 0) {
      killPed(p, state, fx);
      continue;
    }

    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    const dxP = player.x - p.x;
    const dyP = player.y - p.y;
    const distP = Math.hypot(dxP, dyP);

    if (p.role === 'citizen') {
      if (p.panicTimer > 0) {
        p.panicTimer -= dt;
        const fleeAngle = Math.atan2(p.y - player.y, p.x - player.x);
        p.angle = fleeAngle;
        p.vx = Math.cos(fleeAngle) * 145;
        p.vy = Math.sin(fleeAngle) * 145;
      } else {
        if (Math.random() < dt * 0.45) p.angle += (Math.random() - 0.5) * 1.4;
        p.vx = Math.cos(p.angle) * 44;
        p.vy = Math.sin(p.angle) * 44;
      }
    } else if (p.role === 'syndicate' || p.role === 'kingpin' || p.role === 'cop') {
      const hostile = p.role !== 'cop' || state.police.wanted >= 1;
      if (hostile && distP < 480) {
        p.angle = Math.atan2(dyP, dxP);
        const preferredDist = p.role === 'kingpin' ? 170 : 210;
        if (distP > preferredDist) {
          p.vx = Math.cos(p.angle) * 105;
          p.vy = Math.sin(p.angle) * 105;
        } else if (distP < 105) {
          p.vx = -Math.cos(p.angle) * 70;
          p.vy = -Math.sin(p.angle) * 70;
        } else {
          p.vx *= 0.85;
          p.vy *= 0.85;
        }

        if (p.shootCooldown <= 0 && distP < 390 && !segmentHitsBuilding(p.x, p.y, player.x, player.y, city)) {
          p.shootCooldown = p.role === 'kingpin' ? 0.32 : p.role === 'syndicate' ? 0.65 : 0.72;
          const spread = (Math.random() - 0.5) * 0.14;
          combat.fireNpcShot(p, p.angle + spread, p.role === 'kingpin' ? 14 : 9, state, fx, audio);
        }
      } else {
        p.vx *= 0.85;
        p.vy *= 0.85;
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.walkPhase += Math.hypot(p.vx, p.vy) * dt * 0.12;
    if (resolveCircleBuildings(p, 11, city)) {
      p.angle += Math.PI * 0.75;
    }

    // Check getting hit by fast vehicles
    for (const v of vehicles) {
      if (v.exploded || v.speed < 110) continue;
      const dv = Math.hypot(v.x - p.x, v.y - p.y);
      if (dv < v.spec.width * 0.72 + 9) {
        p.hp -= v.speed * 0.28;
        p.vx = v.vx * 0.45;
        p.vy = v.vy * 0.45;
        fx.spawnBlood(p.x, p.y);
        if (v.driver === 'player') {
          state.police.addHeat(p.role === 'cop' ? 36 : 16);
        }
        if (p.hp <= 0) killPed(p, state, fx);
        break;
      }
    }
  }
}

export function alertNearbyPeds(state, x, y, radius = 320) {
  for (const p of state.peds) {
    if (p.alive && p.role === 'citizen' && Math.hypot(p.x - x, p.y - y) < radius) {
      p.panicTimer = 4.5;
    }
  }
}

function killPed(p, state, fx) {
  if (!p.alive) return;
  p.alive = false;
  fx.spawnBlood(p.x, p.y, 8);
  const cashDrop = p.role === 'kingpin' ? 1500 : p.role === 'syndicate' ? 180 : p.role === 'cop' ? 120 : 45;
  state.pickups.push({
    x: p.x + (Math.random() - 0.5) * 14,
    y: p.y + (Math.random() - 0.5) * 14,
    type: 'cash',
    value: cashDrop,
    pulse: 0,
  });
  if (p.role === 'syndicate' || p.role === 'cop') {
    if (Math.random() < 0.45) {
      state.pickups.push({
        x: p.x + 12,
        y: p.y - 8,
        type: Math.random() < 0.5 ? 'ammo' : 'health',
        value: 35,
        pulse: 0,
      });
    }
  }
}
