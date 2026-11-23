// Main game loop, state machine, player controls, and deterministic showcase scenes (?shot=1..4).

import { WEAPONS } from './config.js';
import { createCity, getDistrictAt, resolveCircleBuildings } from './city.js';
import { createVehicle, spawnAmbientTraffic, updateVehicles } from './vehicles.js';
import { createPed, spawnAmbientPeds, updatePeds } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { CombatSystem, EffectsManager, spawnWorldPickups } from './combat.js';
import { MissionManager } from './missions.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { HudController } from './hud.js';
import { renderGame } from './render.js';
import { saveGame, loadGame, getLatestSave } from './save.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const input = new InputManager(canvas);
const audio = new AudioEngine();
const fx = new EffectsManager();
const combat = new CombatSystem();
const police = new PoliceSystem();
const missions = new MissionManager();
const city = createCity(2026);

function makeFreshPlayer() {
  return {
    x: 2240,
    y: 860,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: 100,
    armor: 50,
    cash: 500,
    weaponIndex: 1,
    ammo: WEAPONS.map((w) => (w.melee ? Infinity : w.startAmmo || 0)),
    fireCooldown: 0,
    vehicle: null,
  };
}

const state = {
  mode: 'menu', // 'menu' | 'playing' | 'paused' | 'wasted' | 'busted'
  mood: 'sunset', // 'sunset' | 'twilight'
  time: 0,
  city,
  player: makeFreshPlayer(),
  vehicles: [],
  peds: [],
  pickups: [],
  police,
  missions,
  camera: { x: 2240, y: 840, shake: 0 },
  currentDistrict: 'Palmfront Beach',
  contextPrompt: '',
  triggerBusted: () => {
    state.mode = 'busted';
    state.player.cash = Math.max(0, state.player.cash - 300);
    hud.setMode('busted', { sub: 'Released from Metro PD Precinct · -$300' });
  },
};

const hud = new HudController({
  onNewGame: () => {
    audio.unlock();
    resetWorld();
    state.mode = 'playing';
    hud.setMode('playing');
    missions.say('Sloane Vega', 'Welcome to Solaris Bay. Grab a ride and hit the cyan beacon—or press M to start Mission 1.', 7.0);
  },
  onContinue: () => {
    audio.unlock();
    const save = getLatestSave();
    if (save) {
      applySave(save);
      state.mode = 'playing';
      hud.setMode('playing');
    } else {
      resetWorld();
      state.mode = 'playing';
      hud.setMode('playing');
    }
  },
  onResume: () => {
    state.mode = 'playing';
    hud.setMode('playing');
  },
  onToMenu: () => {
    state.mode = 'menu';
    hud.setMode('menu');
  },
  onSaveSlot: (slot) => {
    saveGame(slot, state);
  },
  onLoadSlot: (slot) => {
    const data = loadGame(slot);
    if (data) {
      applySave(data);
      state.mode = 'playing';
      hud.setMode('playing');
    }
  },
  onRespawn: () => {
    respawnPlayer();
    state.mode = 'playing';
    hud.setMode('playing');
  },
});

function resetWorld() {
  fx.clear();
  police.reset();
  missions.reset();
  state.player = makeFreshPlayer();
  state.vehicles = [];
  state.peds = [];
  state.pickups = [];
  state.mood = 'sunset';
  spawnAmbientTraffic(state, 22);
  spawnAmbientPeds(state, 34);
  spawnWorldPickups(state);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
}

function applySave(data) {
  resetWorld();
  state.player.cash = data.cash ?? 500;
  state.player.hp = Math.max(25, data.hp ?? 100);
  state.player.armor = data.armor ?? 50;
  state.player.x = data.x ?? 2240;
  state.player.y = data.y ?? 860;
  state.player.weaponIndex = data.weaponIndex ?? 1;
  if (Array.isArray(data.ammo)) state.player.ammo = data.ammo.map((a, i) => (i === 0 ? Infinity : a));
  missions.completedCount = data.completedMissions ?? 0;
  police.setStars(data.wanted ?? 0);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
}

function respawnPlayer() {
  state.player.vehicle = null;
  state.player.hp = 100;
  state.player.armor = 25;
  state.player.x = 2240;
  state.player.y = 860;
  state.player.vx = 0;
  state.player.vy = 0;
  police.reset();
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
}

let activeShot = null;

function handleResize() {
  canvas.width = window.innerWidth || 1280;
  canvas.height = window.innerHeight || 720;
  if (activeShot) {
    renderGame(ctx, canvas.width, canvas.height, state, fx);
  }
}
window.addEventListener('resize', handleResize);
handleResize();

function tryToggleVehicle() {
  const { player, vehicles } = state;
  if (player.vehicle) {
    const v = player.vehicle;
    v.driver = null;
    player.vehicle = null;
    player.x = v.x + Math.cos(v.angle - Math.PI / 2) * (v.spec.width * 0.95);
    player.y = v.y + Math.sin(v.angle - Math.PI / 2) * (v.spec.width * 0.95);
    return;
  }

  let best = null;
  let bestDist = 72;
  for (const v of vehicles) {
    if (v.exploded) continue;
    const d = Math.hypot(v.x - player.x, v.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  if (best) {
    const stolen = best.driver === 'traffic' || best.driver === 'police' || best.driver === 'syndicate';
    best.driver = 'player';
    player.vehicle = best;
    if (stolen) {
      police.addHeat(best.spec.police ? 28 : 12);
      fx.spawnPopup(best.x, best.y - 24, `JACKED ${best.spec.name.toUpperCase()}`, '#ffbe3b');
    }
    audio.playPickup();
  }
}

function updatePlayer(dt) {
  const { player } = state;
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);

  // Weapon switching
  for (let i = 0; i < WEAPONS.length; i++) {
    if (input.wasPressed(`Digit${i + 1}`)) player.weaponIndex = i;
  }
  if (input.mouse.wheelDelta !== 0) {
    player.weaponIndex = (player.weaponIndex + Math.sign(input.mouse.wheelDelta) + WEAPONS.length) % WEAPONS.length;
  }

  if (input.wasPressed('KeyE') || input.wasPressed('KeyF')) {
    tryToggleVehicle();
  }
  if (input.wasPressed('KeyR')) {
    const st = audio.cycleRadio();
    fx.spawnPopup(player.x, player.y - 28, st.name, '#ff8cc6');
  }
  if (input.wasPressed('KeyM')) {
    missions.startNextMission(state, audio);
  }
  if (input.wasPressed('KeyT')) {
    state.mood = state.mood === 'sunset' ? 'twilight' : 'sunset';
  }

  // Aim toward mouse in world coordinates
  const worldMouseX = state.camera.x - canvas.width / 2 + input.mouse.x;
  const worldMouseY = state.camera.y - canvas.height / 2 + input.mouse.y;
  const aimAngle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);

  if (!player.vehicle) {
    player.angle = aimAngle;
    const mx = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) -
               (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    const my = (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0) -
               (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0);
    const len = Math.hypot(mx, my);
    const speed = input.isDown('Space') || input.isDown('ShiftLeft') ? 215 : 152;
    if (len > 0) {
      player.vx = (mx / len) * speed;
      player.vy = (my / len) * speed;
    } else {
      player.vx *= 0.72;
      player.vy *= 0.72;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    resolveCircleBuildings(player, 12, city);

    // Nearby vehicle prompt
    const nearCar = state.vehicles.find((v) => !v.exploded && Math.hypot(v.x - player.x, v.y - player.y) < 70);
    state.contextPrompt = nearCar ? `Press E to ${nearCar.driver ? 'steal' : 'drive'} ${nearCar.spec.name}` : '';
  } else {
    state.contextPrompt = '';
  }

  if (input.mouse.down) {
    audio.unlock();
    combat.firePlayerWeapon(state, aimAngle, fx, audio);
  }

  if (player.hp <= 0) {
    player.hp = 0;
    state.mode = 'wasted';
    player.cash = Math.max(0, player.cash - 200);
    hud.setMode('wasted', { sub: 'Discharged from Solaris General · -$200' });
  }
}

function updateCamera(dt) {
  const { player, camera } = state;
  let targetX = player.x;
  let targetY = player.y;
  if (player.vehicle) {
    targetX += player.vehicle.vx * 0.24;
    targetY += player.vehicle.vy * 0.24;
  }
  const lerp = 1 - Math.exp(-dt * 6.5);
  camera.x += (targetX - camera.x) * lerp;
  camera.y += (targetY - camera.y) * lerp;
  camera.shake = Math.max(0, camera.shake - dt * 26);
}

// Deterministic showcase scenes for ?shot=1|2|3|4 using the real engine.
function setupShowcaseShot(shot) {
  resetWorld();
  state.vehicles = [];
  state.peds = [];
  state.pickups = [];
  fx.clear();

  if (shot === '1') {
    // COVER: Sunset high-speed police chase on Palmfront Boulevard!
    state.mode = 'playing';
    state.mood = 'sunset';
    state.time = 12.4;
    hud.setMode('playing');

    const solano = createVehicle('solano_gt', 2255, 745, -Math.PI * 0.62, {
      color: '#ff2e93',
      driver: 'player',
      vx: -175,
      vy: -365,
    });
    solano.speed = 468;
    solano.drifting = true;
    state.vehicles.push(solano);
    state.player.vehicle = solano;
    state.player.x = solano.x;
    state.player.y = solano.y;
    state.player.angle = solano.angle;
    state.player.cash = 4850;
    state.player.hp = 88;
    state.player.armor = 72;
    state.player.weaponIndex = 2;
    state.police.setStars(3);

    // 2 flashing Metro Interceptors chasing close behind (fully visible above dialogue)
    const cop1 = createVehicle('metro_interceptor', 2212, 875, -Math.PI * 0.46, {
      driver: 'police',
      sirenOn: true,
      vx: 35,
      vy: -390,
    });
    cop1.sirenPhase = 0.6;
    const cop2 = createVehicle('metro_interceptor', 2292, 918, -Math.PI * 0.56, {
      driver: 'police',
      sirenOn: true,
      vx: -60,
      vy: -360,
    });
    cop2.sirenPhase = 3.8;
    state.vehicles.push(cop1, cop2);

    // Nearby Palmfront traffic & parked rides
    state.vehicles.push(
      createVehicle('palm_cruiser', 2205, 625, Math.PI / 2, { driver: 'traffic', color: '#4fd2c2' }),
      createVehicle('volt_moto', 2310, 675, -Math.PI / 2, { driver: 'traffic', color: '#00f0ff' }),
      createVehicle('solano_gt', 2328, 890, Math.PI / 2, { driver: null, color: '#ffbe3b' }),
      createVehicle('harbor_van', 2020, 940, 0, { driver: 'traffic', color: '#f7b267' }),
    );

    // Curved drift skidmarks & tire smoke trail behind the Solano GT
    for (let i = 0; i < 24; i++) {
      const t = i / 24;
      const sx = solano.x + t * 90 + Math.sin(t * 2.5) * 14;
      const sy = solano.y + 18 + t * 140;
      fx.addSkidmark(sx - 9, sy, -Math.PI * 0.55);
      fx.addSkidmark(sx + 9, sy, -Math.PI * 0.55);
      if (i % 2 === 0) {
        fx.spawnParticle(sx + (i % 3 - 1) * 7, sy, {
          life: 0.35 + (1 - t) * 0.25,
          size: 11 + (1 - t) * 10,
          color: 'rgba(235, 240, 255, 0.52)',
        });
      }
    }

    // Fleeing pedestrians & beachgoers
    for (const [px, py] of [[2350, 760], [2395, 845], [2165, 790], [2485, 720], [2540, 880], [2155, 920]]) {
      const p = createPed(px, py, 'citizen');
      p.panicTimer = 3;
      state.peds.push(p);
    }

    missions.completedCount = 1;
    missions.active = {
      id: 2,
      title: 'Neon Repo',
      objective: 'Evade Metro PD and deliver the Solano GT to Neon Midtown',
      type: 'steal_deliver',
    };
    missions.waypoint = { x: 2240, y: 540, color: '#ffbe3b', label: 'ESCAPE ROUTE' };
    missions.say('Metro Dispatch', 'All units! Magenta Solano GT drifting northbound on Palmfront Blvd — 3-star pursuit!', 99);

    state.camera.x = 2320;
    state.camera.y = 810;
    state.currentDistrict = 'Palmfront Beach';
  } else if (shot === '2') {
    // On-foot firefight at Coral Harbor docks
    state.mode = 'playing';
    state.mood = 'sunset';
    state.time = 8.2;
    hud.setMode('playing');

    state.player.x = 2036;
    state.player.y = 1830;
    state.player.angle = -0.18;
    state.player.cash = 6400;
    state.player.hp = 78;
    state.player.armor = 46;
    state.player.weaponIndex = 2; // Palm SMG
    state.police.setStars(1);

    // Syndicate guards returning fire around containers & pier
    const guards = [
      [2195, 1775, Math.PI - 0.12],
      [2235, 1855, Math.PI + 0.15],
      [2160, 1925, -Math.PI * 0.72],
      [2290, 1810, Math.PI],
    ];
    for (const [gx, gy, ga] of guards) {
      state.peds.push(createPed(gx, gy, 'syndicate', { angle: ga }));
    }

    // Parked getaway car & syndicate SUV
    state.vehicles.push(
      createVehicle('solano_gt', 1975, 1925, -0.35, { driver: null, color: '#00e5ff' }),
      createVehicle('syndicate_suv', 2265, 1940, Math.PI * 0.85, { driver: null, color: '#2b1636' }),
      createVehicle('harbor_van', 1940, 1690, 0.08, { driver: null, color: '#d97736' }),
    );

    // Active SMG muzzle flashes, cyan/red tracers, sparks & explosion glow
    fx.muzzleFlashes.push(
      { x: 2054, y: 1827, angle: -0.18, life: 0.06, size: 17 },
      { x: 2180, y: 1778, angle: Math.PI - 0.1, life: 0.06, size: 13 },
      { x: 2220, y: 1858, angle: Math.PI + 0.14, life: 0.06, size: 13 },
    );
    fx.tracers.push(
      { x1: 2054, y1: 1827, x2: 2188, y2: 1782, color: '#00f0ff', life: 0.08, maxLife: 0.085 },
      { x1: 2054, y1: 1827, x2: 2210, y2: 1802, color: '#00f0ff', life: 0.07, maxLife: 0.085 },
      { x1: 2180, y1: 1778, x2: 2070, y2: 1812, color: '#ff4d6d', life: 0.08, maxLife: 0.085 },
      { x1: 2220, y1: 1858, x2: 2075, y2: 1848, color: '#ff4d6d', life: 0.08, maxLife: 0.085 },
    );
    fx.spawnSparks(2192, 1780, 10);

    // Pickups on dock
    state.pickups.push(
      { x: 2085, y: 1895, type: 'health', value: 45, pulse: 0 },
      { x: 2125, y: 1755, type: 'cash', value: 350, pulse: 1.5 },
      { x: 1965, y: 1790, type: 'armor', value: 50, pulse: 2.8 },
    );

    missions.completedCount = 2;
    missions.active = {
      id: 3,
      title: 'Harbor Ambush',
      objective: 'Eliminate the Bayline Syndicate guards at Coral Harbor',
      type: 'eliminate',
    };
    missions.targetPeds = state.peds;
    missions.waypoint = { x: 2205, y: 1825, color: '#ff3b5c', label: '4 LEFT' };
    missions.say('Rico Vance', 'Pin them down behind the containers—do not let Bayline move that cargo!', 99);

    state.camera.x = 2105;
    state.camera.y = 1835;
    state.currentDistrict = 'Coral Harbor';
  } else if (shot === '3') {
    // Neon Midtown twilight intersection & free-roam exploration
    state.mode = 'playing';
    state.mood = 'twilight';
    state.time = 19.5;
    hud.setMode('playing');

    state.player.x = 925;
    state.player.y = 955;
    state.player.angle = -0.65;
    state.player.cash = 9250;
    state.player.hp = 100;
    state.player.armor = 85;
    state.player.weaponIndex = 1;
    state.police.reset();

    // Dense Midtown traffic & parked sports cars
    state.vehicles.push(
      createVehicle('solano_gt', 1020, 865, -Math.PI / 2, { driver: null, color: '#ffbe3b' }),
      createVehicle('volt_moto', 895, 985, 0, { driver: null, color: '#00f0ff' }),
      createVehicle('palm_cruiser', 935, 790, Math.PI / 2, { driver: 'traffic', color: '#ff6b8b' }),
      createVehicle('syndicate_suv', 1120, 945, 0, { driver: 'traffic', color: '#2b1b3d' }),
      createVehicle('palm_cruiser', 785, 895, Math.PI, { driver: 'traffic', color: '#4fd2c2' }),
      createVehicle('metro_interceptor', 985, 1085, -Math.PI / 2, { driver: 'traffic', sirenOn: false }),
      createVehicle('solano_gt', 1065, 895, Math.PI, { driver: 'traffic', color: '#ff2e93' }),
    );

    for (const [px, py] of [[885, 855], [1035, 985], [1045, 825], [840, 985], [1150, 850]]) {
      state.peds.push(createPed(px, py, 'citizen'));
    }

    state.pickups.push({ x: 1095, y: 760, type: 'armor', value: 50, pulse: 0.4 });
    missions.completedCount = 3;
    missions.waypoint = { x: 1035, y: 920, color: '#00f0ff', label: 'M4: CONVOY HEIST' };
    state.contextPrompt = 'Press E to drive Volt Moto';

    state.camera.x = 985;
    state.camera.y = 890;
    state.currentDistrict = 'Neon Midtown';
  } else if (shot === '4') {
    // Sleek Start Screen overlaid on live animated Palmfront Beach at sunset
    state.mode = 'menu';
    state.mood = 'sunset';
    state.time = 6.0;
    hud.setMode('menu');
    spawnAmbientTraffic(state, 20);
    spawnAmbientPeds(state, 28);
    state.camera.x = 2290;
    state.camera.y = 760;
  }

  hud.update(state, audio);
  renderGame(ctx, canvas.width, canvas.height, state, fx);
}

const urlParams = new URLSearchParams(window.location.search);
const shotParam = urlParams.get('shot');

if (shotParam && ['1', '2', '3', '4'].includes(shotParam)) {
  activeShot = shotParam;
  setupShowcaseShot(shotParam);
  let frames = 0;
  function renderShotOnce() {
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth || 1280;
      canvas.height = window.innerHeight || 720;
    }
    hud.update(state, audio);
    renderGame(ctx, canvas.width, canvas.height, state, fx);
    if (++frames < 4) requestAnimationFrame(renderShotOnce);
  }
  requestAnimationFrame(renderShotOnce);
} else {
  resetWorld();
  hud.setMode('menu');

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    state.time += dt;

    if (state.mode === 'menu') {
      // Gentle scenic camera drift along Palmfront Beach & Midtown
      state.camera.x = 2260 + Math.sin(state.time * 0.18) * 140;
      state.camera.y = 760 + Math.cos(state.time * 0.14) * 180;
      updateVehicles(state, dt, input, audio, fx);
      updatePeds(state, dt, combat, fx, audio);
      fx.update(dt);
    } else if (state.mode === 'playing') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        state.mode = 'paused';
        hud.setMode('paused');
      } else {
        updatePlayer(dt);
        updateVehicles(state, dt, input, audio, fx);
        updatePeds(state, dt, combat, fx, audio);
        police.update(state, dt, audio);
        combat.updatePickups(state, dt, fx, audio);
        missions.update(state, dt, fx, audio);
        fx.update(dt);
        audio.update(dt, !!state.player.vehicle);
        updateCamera(dt);
        state.currentDistrict = getDistrictAt(state.player.x, state.player.y).name;
        spawnAmbientTraffic(state, 20);
        spawnAmbientPeds(state, 30);
        hud.update(state, audio);
      }
    } else if (state.mode === 'paused') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        state.mode = 'playing';
        hud.setMode('playing');
      }
    }

    renderGame(ctx, canvas.width, canvas.height, state, fx);
    input.endFrame();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
