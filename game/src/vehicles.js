// Vehicle spawning, arcade drift physics, traffic AI, damage, and explosions.

import { WORLD, VEHICLE_TYPES } from './config.js';
import { resolveCircleBuildings } from './city.js';

let nextVehicleId = 1;

export function createVehicle(typeId, x, y, angle = 0, opts = {}) {
  const spec = VEHICLE_TYPES[typeId] || VEHICLE_TYPES.palm_cruiser;
  const color = opts.color || spec.colors[Math.floor(Math.random() * spec.colors.length)];
  return {
    id: nextVehicleId++,
    typeId: spec.id,
    spec,
    x,
    y,
    vx: opts.vx || 0,
    vy: opts.vy || 0,
    angle,
    speed: 0,
    steer: 0,
    drifting: false,
    color,
    hp: spec.hp,
    maxHp: spec.hp,
    driver: opts.driver || null, // 'player' | 'traffic' | 'police' | 'syndicate' | null
    sirenOn: !!opts.sirenOn,
    sirenPhase: Math.random() * 6.28,
    exploded: false,
    smokeTimer: 0,
    missionTag: opts.missionTag || null,
    targetSpeed: spec.maxSpeed * (0.36 + Math.random() * 0.16),
    turnCooldown: 0,
  };
}

export function spawnAmbientTraffic(state, targetCount = 22) {
  const civilTypes = ['palm_cruiser', 'palm_cruiser', 'solano_gt', 'harbor_van', 'syndicate_suv', 'volt_moto'];
  let attempts = 0;
  while (state.vehicles.length < targetCount && attempts < 80) {
    attempts++;
    const vertical = Math.random() < 0.5;
    let x, y, angle;
    if (vertical) {
      const rx = WORLD.vRoads[Math.floor(Math.random() * WORLD.vRoads.length)];
      const south = Math.random() < 0.5;
      x = rx + (south ? -24 : 24);
      y = 140 + Math.random() * (WORLD.height - 280);
      angle = south ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const ry = WORLD.hRoads[Math.floor(Math.random() * WORLD.hRoads.length)];
      const east = Math.random() < 0.5;
      x = 140 + Math.random() * (WORLD.beachX - 240);
      y = ry + (east ? 24 : -24);
      angle = east ? 0 : Math.PI;
    }
    if (Math.hypot(x - state.player.x, y - state.player.y) < 340) continue;
    if (state.vehicles.some((v) => Math.hypot(v.x - x, v.y - y) < 110)) continue;

    const type = civilTypes[Math.floor(Math.random() * civilTypes.length)];
    state.vehicles.push(createVehicle(type, x, y, angle, { driver: 'traffic' }));
  }

  // Also ensure a few parked exotic rides around Palmfront & Midtown
  const parkedSpots = [
    { type: 'solano_gt', x: 2295, y: 610, angle: Math.PI / 2, color: '#ff2e93' },
    { type: 'volt_moto', x: 2295, y: 840, angle: Math.PI / 2, color: '#00f0ff' },
    { type: 'solano_gt', x: 1015, y: 810, angle: -Math.PI / 2, color: '#ffbe3b' },
    { type: 'palm_cruiser', x: 1635, y: 1120, angle: Math.PI / 2, color: '#4fd2c2' },
    { type: 'harbor_van', x: 1960, y: 1710, angle: 0, color: '#d97736' },
  ];
  for (const p of parkedSpots) {
    if (!state.vehicles.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 90)) {
      state.vehicles.push(createVehicle(p.type, p.x, p.y, p.angle, { driver: null, color: p.color }));
    }
  }
}

export function updateVehicles(state, dt, input, audio, fx) {
  const { vehicles, player, city } = state;

  for (const v of vehicles) {
    if (v.exploded) continue;
    v.sirenPhase += dt * 11;

    if (v.driver === 'player') {
      updatePlayerVehicle(v, dt, input, state, audio, fx);
    } else if (v.driver === 'police') {
      updatePoliceVehicle(v, dt, state, fx);
    } else if (v.driver === 'syndicate') {
      updateSyndicateVehicle(v, dt, state);
    } else if (v.driver === 'traffic') {
      updateTrafficVehicle(v, dt, state);
    } else {
      // Parked coasting friction
      v.vx *= Math.pow(0.08, dt);
      v.vy *= Math.pow(0.08, dt);
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      v.speed = Math.hypot(v.vx, v.vy);
    }

    // Building collision
    const radius = v.spec.width * 0.62;
    const hitWall = resolveCircleBuildings(v, radius, city);
    if (hitWall) {
      const impact = Math.hypot(v.vx, v.vy);
      if (impact > 160) {
        damageVehicle(v, (impact - 140) * 0.08, state, fx, audio);
        if (v.driver === 'player') state.camera.shake = Math.max(state.camera.shake, Math.min(10, impact * 0.02));
      }
      v.vx *= -0.32;
      v.vy *= -0.32;
    }

    // Damage smoke / fire
    if (v.hp < v.maxHp * 0.45) {
      v.smokeTimer -= dt;
      if (v.smokeTimer <= 0) {
        v.smokeTimer = v.hp < v.maxHp * 0.2 ? 0.04 : 0.09;
        const hoodX = v.x + Math.cos(v.angle) * (v.spec.length * 0.36);
        const hoodY = v.y + Math.sin(v.angle) * (v.spec.length * 0.36);
        fx.spawnParticle(hoodX, hoodY, {
          vx: (Math.random() - 0.5) * 30,
          vy: -20 - Math.random() * 25,
          life: 0.55,
          size: v.hp < v.maxHp * 0.2 ? 9 : 7,
          color: v.hp < v.maxHp * 0.2 && Math.random() < 0.55 ? '#ff6b35' : 'rgba(55,60,72,0.75)',
        });
      }
    }
  }

  // Vehicle-to-vehicle collisions
  for (let i = 0; i < vehicles.length; i++) {
    const a = vehicles[i];
    if (a.exploded) continue;
    for (let j = i + 1; j < vehicles.length; j++) {
      const b = vehicles[j];
      if (b.exploded) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = (a.spec.width + b.spec.width) * 0.68;
      const d2 = dx * dx + dy * dy;
      if (d2 < minDist * minDist && d2 > 0.01) {
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (minDist - dist) * 0.52;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const rel = rvx * nx + rvy * ny;
        if (rel < 0) {
          const imp = -rel * 0.65;
          a.vx -= nx * imp;
          a.vy -= ny * imp;
          b.vx += nx * imp;
          b.vy += ny * imp;

          if (Math.abs(rel) > 170) {
            const dmg = (Math.abs(rel) - 150) * 0.07;
            damageVehicle(a, dmg, state, fx, audio);
            damageVehicle(b, dmg, state, fx, audio);
            fx.spawnSparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6);
            if (a.driver === 'player' || b.driver === 'player') {
              state.camera.shake = Math.max(state.camera.shake, 7);
              if (a.spec.police || b.spec.police) {
                state.police.addHeat(18);
              }
            }
          }
        }
      }
    }
  }

  // Keep player synced to their vehicle
  if (player.vehicle) {
    player.x = player.vehicle.x;
    player.y = player.vehicle.y;
    player.angle = player.vehicle.angle;
  }
}

function updatePlayerVehicle(v, dt, input, state, audio, fx) {
  const fwd = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) -
              (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
  const steer = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) -
                (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
  const handbrake = input.isDown('Space');

  applyVehiclePhysics(v, dt, fwd, steer, handbrake, state, fx);
  audio.updateEngine(v.speed / v.spec.maxSpeed, v.drifting);
}

function updatePoliceVehicle(v, dt, state, fx) {
  const target = state.player;
  const dx = target.x - v.x;
  const dy = target.y - v.y;
  const dist = Math.hypot(dx, dy);

  const desiredAngle = Math.atan2(dy, dx);
  let diff = normalizeAngle(desiredAngle - v.angle);
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  const throttle = dist > 75 ? 1 : 0.25;
  const drift = Math.abs(diff) > 0.7 && v.speed > 200;

  v.sirenOn = state.police.wanted >= 1;
  applyVehiclePhysics(v, dt, throttle, steer, drift, state, fx);
}

function updateSyndicateVehicle(v, dt, state) {
  // Patrols horizontally/vertically along roads at brisk speed
  v.turnCooldown -= dt;
  const speed = v.spec.maxSpeed * 0.52;
  v.vx = Math.cos(v.angle) * speed;
  v.vy = Math.sin(v.angle) * speed;
  v.x += v.vx * dt;
  v.y += v.vy * dt;
  v.speed = speed;

  if (v.x < 160 || v.x > WORLD.beachX - 180 || v.y < 160 || v.y > WORLD.height - 160) {
    v.angle = normalizeAngle(v.angle + Math.PI);
  } else if (v.turnCooldown <= 0) {
    const nearV = WORLD.vRoads.find((rx) => Math.abs(v.x - rx) < 34);
    const nearH = WORLD.hRoads.find((ry) => Math.abs(v.y - ry) < 34);
    if (nearV && nearH) {
      const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      v.angle = dirs[Math.floor(Math.random() * dirs.length)];
      v.turnCooldown = 2.4;
    }
  }
}

function updateTrafficVehicle(v, dt, state) {
  v.turnCooldown -= dt;
  // Check if another car or player is right in front
  const fx = Math.cos(v.angle);
  const fy = Math.sin(v.angle);
  let blocked = false;
  for (const o of state.vehicles) {
    if (o === v || o.exploded) continue;
    const dx = o.x - v.x;
    const dy = o.y - v.y;
    const forwardDist = dx * fx + dy * fy;
    const sideDist = Math.abs(-dx * fy + dy * fx);
    if (forwardDist > 10 && forwardDist < 105 && sideDist < 34) {
      blocked = true;
      break;
    }
  }

  const desiredSpeed = blocked ? 0 : v.targetSpeed;
  v.speed += (desiredSpeed - v.speed) * Math.min(1, dt * 3.5);
  v.vx = fx * v.speed;
  v.vy = fy * v.speed;
  v.x += v.vx * dt;
  v.y += v.vy * dt;

  // Turn at intersections or edges
  if (v.x < 120 || v.x > WORLD.beachX - 100 || v.y < 120 || v.y > WORLD.height - 120) {
    v.angle = normalizeAngle(v.angle + Math.PI);
    v.x = Math.max(130, Math.min(WORLD.beachX - 110, v.x));
    v.y = Math.max(130, Math.min(WORLD.height - 130, v.y));
  } else if (v.turnCooldown <= 0) {
    const nearV = WORLD.vRoads.find((rx) => Math.abs(v.x - rx) < 28);
    const nearH = WORLD.hRoads.find((ry) => Math.abs(v.y - ry) < 28);
    if (nearV && nearH && Math.random() < 0.45) {
      const turn = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      v.angle = normalizeAngle(v.angle + turn);
      v.turnCooldown = 2.0;
    }
  }
}

export function applyVehiclePhysics(v, dt, fwd, steer, handbrake, state, fx) {
  const fxDir = Math.cos(v.angle);
  const fyDir = Math.sin(v.angle);
  const rxDir = -fyDir;
  const ryDir = fxDir;

  let forwardVel = v.vx * fxDir + v.vy * fyDir;
  let lateralVel = v.vx * rxDir + v.vy * ryDir;

  if (fwd > 0) {
    forwardVel += v.spec.accel * fwd * dt;
  } else if (fwd < 0) {
    if (forwardVel > 20) forwardVel -= v.spec.brake * dt;
    else forwardVel += v.spec.accel * 0.55 * fwd * dt;
  } else {
    forwardVel *= Math.pow(0.28, dt);
  }

  if (handbrake) {
    forwardVel *= Math.pow(0.45, dt);
  }

  forwardVel = Math.max(-v.spec.maxSpeed * 0.36, Math.min(v.spec.maxSpeed, forwardVel));

  const speedFactor = Math.min(1, Math.abs(forwardVel) / 140);
  const dirSign = forwardVel >= -5 ? 1 : -1;
  const turnBoost = handbrake ? 1.32 : 1.0;
  v.angle = normalizeAngle(v.angle + steer * v.spec.turnRate * turnBoost * speedFactor * dirSign * dt);

  const grip = handbrake ? v.spec.driftGrip : v.spec.normalGrip;
  lateralVel *= Math.pow(1 - (1 - grip) * 8, dt * 10);

  const nfx = Math.cos(v.angle);
  const nfy = Math.sin(v.angle);
  const nrx = -nfy;
  const nry = nfx;

  v.vx = nfx * forwardVel + nrx * lateralVel;
  v.vy = nfy * forwardVel + nry * lateralVel;
  v.x += v.vx * dt;
  v.y += v.vy * dt;
  v.speed = Math.hypot(v.vx, v.vy);
  v.drifting = Math.abs(lateralVel) > 62 || (handbrake && v.speed > 120);

  if (v.drifting && state && fx) {
    const rearX = v.x - nfx * (v.spec.length * 0.36);
    const rearY = v.y - nfy * (v.spec.length * 0.36);
    const off = v.spec.width * 0.34;
    fx.addSkidmark(rearX + nrx * off, rearY + nry * off, v.angle);
    fx.addSkidmark(rearX - nrx * off, rearY - nry * off, v.angle);
    if (Math.random() < 0.55) {
      fx.spawnParticle(rearX + (Math.random() - 0.5) * 14, rearY + (Math.random() - 0.5) * 14, {
        vx: -v.vx * 0.12 + (Math.random() - 0.5) * 28,
        vy: -v.vy * 0.12 + (Math.random() - 0.5) * 28,
        life: 0.42,
        size: 10 + Math.random() * 6,
        color: 'rgba(225, 232, 245, 0.45)',
      });
    }
  }
}

export function damageVehicle(v, amount, state, fx, audio) {
  if (v.exploded) return;
  v.hp -= amount;
  if (v.hp <= 0) {
    explodeVehicle(v, state, fx, audio);
  }
}

export function explodeVehicle(v, state, fx, audio) {
  v.exploded = true;
  v.hp = 0;
  v.vx = 0;
  v.vy = 0;
  v.sirenOn = false;
  state.camera.shake = Math.max(state.camera.shake, 16);
  audio.playExplosion();
  fx.spawnExplosion(v.x, v.y);

  // Damage nearby entities
  const blastR = 145;
  if (state.player.vehicle === v) {
    state.player.vehicle = null;
    state.player.hp -= 65;
  } else {
    const dp = Math.hypot(state.player.x - v.x, state.player.y - v.y);
    if (dp < blastR) state.player.hp -= (1 - dp / blastR) * 60;
  }
  for (const ped of state.peds) {
    if (!ped.alive) continue;
    const d = Math.hypot(ped.x - v.x, ped.y - v.y);
    if (d < blastR) ped.hp = 0;
  }
  state.police.addHeat(v.spec.police ? 42 : 24);
}

export function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
