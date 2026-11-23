// 2.5D perspective HTML5 Canvas renderer for Solaris Bay.

import { WORLD, WEAPONS } from './config.js';

export function renderGame(ctx, width, height, state, fx) {
  const { camera, city, vehicles, peds, player, pickups, missions, time, mood } = state;

  ctx.save();
  ctx.fillStyle = '#0a5e7d';
  ctx.fillRect(0, 0, width, height);

  // Camera transform with screen shake
  const shakeX = camera.shake > 0.1 ? (Math.random() - 0.5) * camera.shake * 2 : 0;
  const shakeY = camera.shake > 0.1 ? (Math.random() - 0.5) * camera.shake * 2 : 0;
  const camX = camera.x + shakeX;
  const camY = camera.y + shakeY;

  ctx.translate(width / 2 - camX, height / 2 - camY);

  const view = {
    x1: camX - width / 2 - 220,
    y1: camY - height / 2 - 220,
    x2: camX + width / 2 + 220,
    y2: camY + height / 2 + 220,
  };

  drawGroundAndOcean(ctx, view, city, time, mood);
  drawRoads(ctx, view);
  drawParksAndPiers(ctx, view, city, time);
  drawSkidmarks(ctx, fx.skidmarks);
  drawPickups(ctx, pickups, time);
  drawWaypoint(ctx, missions.waypoint, time);
  drawVehicles(ctx, vehicles, view, time);
  drawPeds(ctx, peds, player, view);
  drawTracersAndFlashes(ctx, fx);
  drawBuildings25D(ctx, city.buildings, camX, camY, view, mood, time);
  drawPalmsAndUmbrellas(ctx, city, view, time);
  drawStreetLights(ctx, city.streetLights, view, mood);
  drawParticlesAndExplosions(ctx, fx);
  drawPopups(ctx, fx.popups);

  ctx.restore();

  // Off-screen waypoint arrow & atmospheric sunset/twilight grade
  drawAtmosphericGrade(ctx, width, height, mood);
  if (missions.waypoint && state.mode === 'playing') {
    drawOffscreenArrow(ctx, width, height, camX, camY, missions.waypoint);
  }
}

function drawGroundAndOcean(ctx, view, city, time, mood) {
  // Base urban concrete / sand / ocean
  ctx.fillStyle = mood === 'twilight' ? '#252a38' : '#313746';
  ctx.fillRect(0, 0, WORLD.beachX, WORLD.height);

  // Sandy Palmfront Beach
  const sandGrad = ctx.createLinearGradient(WORLD.beachX, 0, WORLD.oceanX + 10, 0);
  sandGrad.addColorStop(0, mood === 'twilight' ? '#b89668' : '#e8c488');
  sandGrad.addColorStop(0.75, mood === 'twilight' ? '#a68356' : '#dbb274');
  sandGrad.addColorStop(1, '#c49b63');
  ctx.fillStyle = sandGrad;
  ctx.fillRect(WORLD.beachX, 0, WORLD.oceanX - WORLD.beachX + 10, WORLD.height);

  // Coral Harbor concrete apron on south-east
  ctx.fillStyle = '#3c4352';
  ctx.fillRect(WORLD.harborX, WORLD.harborY, WORLD.oceanX - WORLD.harborX, WORLD.height - WORLD.harborY);

  // Ocean gradient
  const oceanGrad = ctx.createLinearGradient(WORLD.oceanX, 0, WORLD.width, 0);
  oceanGrad.addColorStop(0, mood === 'twilight' ? '#0e6a85' : '#129bb8');
  oceanGrad.addColorStop(0.35, mood === 'twilight' ? '#0a4869' : '#0b6f94');
  oceanGrad.addColorStop(1, '#072c4a');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(WORLD.oceanX, 0, WORLD.width - WORLD.oceanX, WORLD.height);

  // Animated surf foam waves along shoreline
  ctx.save();
  for (let w = 0; w < 3; w++) {
    const waveX = WORLD.oceanX + 8 + w * 28 + Math.sin(time * 2.1 + w * 1.4) * 7;
    ctx.strokeStyle = `rgba(235, 252, 255, ${0.52 - w * 0.14})`;
    ctx.lineWidth = 4 - w;
    ctx.beginPath();
    const yStart = Math.max(0, Math.floor(view.y1 / 40) * 40);
    const yEnd = Math.min(WORLD.height, view.y2 + 40);
    for (let y = yStart; y <= yEnd; y += 30) {
      const ox = waveX + Math.sin(y * 0.025 + time * 2.4 + w) * 6;
      if (y === yStart) ctx.moveTo(ox, y);
      else ctx.lineTo(ox, y);
    }
    ctx.stroke();
  }

  // Sunlit water glints
  ctx.fillStyle = mood === 'twilight' ? 'rgba(0, 240, 255, 0.22)' : 'rgba(255, 224, 150, 0.34)';
  for (let i = 0; i < 24; i++) {
    const gx = WORLD.oceanX + 55 + ((i * 97) % 360);
    const gy = ((i * 173) % WORLD.height);
    if (gy < view.y1 || gy > view.y2) continue;
    const len = 18 + Math.sin(time * 3 + i) * 10;
    ctx.fillRect(gx, gy, len, 2.5);
  }
  ctx.restore();
}

function drawRoads(ctx, view) {
  const rw = WORLD.roadWidth;
  const sw = WORLD.sidewalkWidth;

  // Sidewalks
  ctx.fillStyle = '#5a6275';
  for (const vx of WORLD.vRoads) {
    ctx.fillRect(vx - rw / 2 - sw, 0, rw + sw * 2, WORLD.height);
  }
  for (const hy of WORLD.hRoads) {
    ctx.fillRect(0, hy - rw / 2 - sw, WORLD.beachX + 8, rw + sw * 2);
  }

  // Asphalt
  ctx.fillStyle = '#222735';
  for (const vx of WORLD.vRoads) {
    ctx.fillRect(vx - rw / 2, 0, rw, WORLD.height);
  }
  for (const hy of WORLD.hRoads) {
    ctx.fillRect(0, hy - rw / 2, WORLD.beachX + 8, rw);
  }

  // Dashed yellow centerlines & white lane edges
  ctx.save();
  ctx.strokeStyle = '#ffbe3b';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 18]);

  for (const vx of WORLD.vRoads) {
    ctx.beginPath();
    ctx.moveTo(vx, 0);
    ctx.lineTo(vx, WORLD.height);
    ctx.stroke();
  }
  for (const hy of WORLD.hRoads) {
    ctx.beginPath();
    ctx.moveTo(0, hy);
    ctx.lineTo(WORLD.beachX, hy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Intersections & zebra crosswalks
  for (const vx of WORLD.vRoads) {
    for (const hy of WORLD.hRoads) {
      if (vx < view.x1 - 120 || vx > view.x2 + 120 || hy < view.y1 - 120 || hy > view.y2 + 120) continue;
      ctx.fillStyle = '#242a38';
      ctx.fillRect(vx - rw / 2, hy - rw / 2, rw, rw);

      ctx.fillStyle = 'rgba(240, 245, 255, 0.72)';
      for (let s = -rw / 2 + 10; s < rw / 2 - 10; s += 16) {
        // North & South crosswalks
        ctx.fillRect(vx + s, hy - rw / 2 - 14, 9, 12);
        ctx.fillRect(vx + s, hy + rw / 2 + 2, 9, 12);
        // West & East crosswalks
        ctx.fillRect(vx - rw / 2 - 14, hy + s, 12, 9);
        ctx.fillRect(vx + rw / 2 + 2, hy + s, 12, 9);
      }
    }
  }
  ctx.restore();
}

function drawParksAndPiers(ctx, view, city, time) {
  for (const pk of city.parks) {
    ctx.fillStyle = pk.boardwalk ? '#247556' : '#1f6e52';
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.strokeStyle = '#309470';
    ctx.lineWidth = 3;
    ctx.strokeRect(pk.x + 4, pk.y + 4, pk.w - 8, pk.h - 8);

    if (pk.boardwalk) {
      // Wooden boardwalk strip on beach edge
      ctx.fillStyle = '#8f6440';
      ctx.fillRect(pk.x + pk.w - 22, pk.y, 22, pk.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      for (let y = pk.y; y < pk.y + pk.h; y += 12) {
        ctx.beginPath();
        ctx.moveTo(pk.x + pk.w - 22, y);
        ctx.lineTo(pk.x + pk.w, y);
        ctx.stroke();
      }
    }

    if (pk.hasFountain) {
      const cx = pk.x + pk.w / 2;
      const cy = pk.y + pk.h / 2;
      // Cross paths
      ctx.fillStyle = '#7e8699';
      ctx.fillRect(pk.x, cy - 16, pk.w, 32);
      ctx.fillRect(cx - 16, pk.y, 32, pk.h);
      // Fountain basin
      ctx.fillStyle = '#c5cedf';
      ctx.beginPath();
      ctx.arc(cx, cy, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#18b7d4';
      ctx.beginPath();
      ctx.arc(cx, cy, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 12 + (time * 16) % 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const p of city.piers) {
    ctx.fillStyle = p.industrial ? '#596375' : '#9c714c';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = p.industrial ? '#ffbe3b' : '#6e4d30';
    ctx.lineWidth = p.industrial ? 3 : 2;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    if (!p.industrial) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      for (let x = p.x; x < p.x + p.w; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, p.y);
        ctx.lineTo(x, p.y + p.h);
        ctx.stroke();
      }
    }
  }
}

function drawSkidmarks(ctx, skidmarks) {
  ctx.fillStyle = 'rgba(12, 14, 20, 0.42)';
  for (const s of skidmarks) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillRect(-5, -2.2, 10, 4.4);
    ctx.restore();
  }
}

function drawPickups(ctx, pickups, time) {
  for (const pk of pickups) {
    const bob = Math.sin(time * 4 + (pk.pulse || 0)) * 3;
    const color =
      pk.type === 'cash' ? '#2ee68a' :
      pk.type === 'health' ? '#ff4d6d' :
      pk.type === 'armor' ? '#00f0ff' : '#ffbe3b';
    const label =
      pk.type === 'cash' ? '$' :
      pk.type === 'health' ? '+' :
      pk.type === 'armor' ? 'A' : '•';

    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = color + '33';
    ctx.beginPath();
    ctx.arc(0, 0, 17 + Math.sin(time * 5) * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0e1526';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 13px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0.5);
    ctx.restore();
  }
}

function drawWaypoint(ctx, wp, time) {
  if (!wp) return;
  const r = 28 + Math.sin(time * 5) * 6;
  ctx.save();
  ctx.translate(wp.x, wp.y);

  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, r + 14);
  grad.addColorStop(0, wp.color + '88');
  grad.addColorStop(1, wp.color + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r + 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = wp.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  if (wp.label) {
    ctx.font = 'bold 11px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0a0f1d';
    const tw = ctx.measureText(wp.label).width + 12;
    ctx.fillRect(-tw / 2, -r - 22, tw, 17);
    ctx.fillStyle = wp.color;
    ctx.fillText(wp.label, 0, -r - 10);
  }
  ctx.restore();
}

function drawVehicles(ctx, vehicles, view, time) {
  for (const v of vehicles) {
    if (v.x < view.x1 || v.x > view.x2 || v.y < view.y1 || v.y > view.y2) continue;
    const L = v.spec.length;
    const W = v.spec.width;

    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);

    // Headlight cones (when not exploded)
    if (!v.exploded) {
      const hlGrad = ctx.createLinearGradient(L / 2, 0, L / 2 + 125, 0);
      hlGrad.addColorStop(0, 'rgba(255, 245, 200, 0.34)');
      hlGrad.addColorStop(1, 'rgba(255, 245, 200, 0)');
      ctx.fillStyle = hlGrad;
      ctx.beginPath();
      ctx.moveTo(L / 2, -W * 0.36);
      ctx.lineTo(L / 2 + 125, -W * 1.4);
      ctx.lineTo(L / 2 + 125, W * 1.4);
      ctx.lineTo(L / 2, W * 0.36);
      ctx.closePath();
      ctx.fill();
    }

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    roundRect(ctx, -L / 2 + 4, -W / 2 + 5, L, W, 6);
    ctx.fill();

    // Main chassis
    ctx.fillStyle = v.exploded ? '#25262b' : v.color;
    roundRect(ctx, -L / 2, -W / 2, L, W, v.spec.category === 'bike' ? 5 : 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (!v.exploded) {
      if (v.spec.category === 'bike') {
        // Motorcycle seat, handlebars & headlight
        ctx.fillStyle = '#151924';
        ctx.fillRect(-6, -4, 14, 8);
        ctx.fillStyle = '#cfd8ea';
        ctx.fillRect(L / 2 - 10, -W * 0.55, 3, W * 1.1);
      } else {
        // Police livery
        if (v.spec.category === 'police') {
          ctx.fillStyle = '#f2f6ff';
          ctx.fillRect(-L * 0.16, -W / 2 + 1, L * 0.36, W - 2);
        }
        // Sports racing stripe & spoiler
        if (v.spec.category === 'sports') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.fillRect(-L / 2 + 4, -2.5, L - 8, 5);
          ctx.fillStyle = '#151824';
          ctx.fillRect(-L / 2 + 2, -W / 2 + 2, 5, W - 4);
        }
        // Windshields & cabin roof
        ctx.fillStyle = '#131d33';
        roundRect(ctx, -L * 0.24, -W * 0.38, L * 0.52, W * 0.76, 3);
        ctx.fill();
        ctx.fillStyle = v.spec.category === 'police' ? '#f2f6ff' : v.color;
        roundRect(ctx, -L * 0.14, -W * 0.32, L * 0.28, W * 0.64, 2);
        ctx.fill();
      }

      // Headlights & glowing taillights
      ctx.fillStyle = '#fff5cc';
      ctx.fillRect(L / 2 - 3, -W * 0.38, 3, 5);
      ctx.fillRect(L / 2 - 3, W * 0.38 - 5, 3, 5);
      ctx.fillStyle = '#ff2e4c';
      ctx.fillRect(-L / 2, -W * 0.38, 3, 5);
      ctx.fillRect(-L / 2, W * 0.38 - 5, 3, 5);

      // Police flashing siren bar & sweeping light cones
      if (v.spec.police) {
        const redOn = Math.sin(v.sirenPhase) >= 0;
        ctx.fillStyle = redOn ? '#ff2442' : '#4a1520';
        ctx.fillRect(-3, -W * 0.34, 6, W * 0.32);
        ctx.fillStyle = !redOn ? '#26b0ff' : '#122947';
        ctx.fillRect(-3, W * 0.02, 6, W * 0.32);

        if (v.sirenOn) {
          const glowCol = redOn ? 'rgba(255, 36, 66, 0.36)' : 'rgba(38, 176, 255, 0.38)';
          const sg = ctx.createRadialGradient(0, 0, 6, 0, 0, 88);
          sg.addColorStop(0, glowCol);
          sg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(0, 0, 88, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }
}

function drawPeds(ctx, peds, player, view) {
  for (const p of peds) {
    if (!p.alive) continue;
    if (p.x < view.x1 || p.x > view.x2 || p.y < view.y1 || p.y > view.y2) continue;
    drawCharacter(ctx, p.x, p.y, p.angle, p.shirt, p.skin, p.role !== 'citizen', p.role === 'kingpin');
  }

  if (!player.vehicle) {
    const w = WEAPONS[player.weaponIndex];
    drawCharacter(ctx, player.x, player.y, player.angle, '#00e5ff', '#e8b68e', !w.melee, false, true);
  }
}

function drawCharacter(ctx, x, y, angle, shirt, skin, armed, isBoss = false, isPlayer = false) {
  ctx.save();
  ctx.translate(x, y);

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(2, 4, isBoss ? 12 : 9, isBoss ? 10 : 7, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isPlayer) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.rotate(angle);
  const scale = isBoss ? 1.25 : 1.0;
  ctx.scale(scale, scale);

  // Shoulders / torso
  ctx.fillStyle = shirt;
  roundRect(ctx, -6, -9, 12, 18, 5);
  ctx.fill();

  // Arms / held weapon
  if (armed) {
    ctx.fillStyle = '#1b202e';
    ctx.fillRect(4, 1, 14, 4);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(7, 3, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // Hair / helmet
  ctx.fillStyle = isBoss ? '#ffbe3b' : '#1b1d26';
  ctx.beginPath();
  ctx.arc(-0.5, 0, 5.2, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();

  ctx.restore();
}

function drawTracersAndFlashes(ctx, fx) {
  ctx.save();
  for (const t of fx.tracers) {
    const a = Math.max(0, t.life / t.maxLife);
    ctx.strokeStyle = t.color;
    ctx.globalAlpha = a;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const mf of fx.muzzleFlashes) {
    ctx.save();
    ctx.translate(mf.x, mf.y);
    ctx.rotate(mf.angle);
    const g = ctx.createRadialGradient(4, 0, 1, 4, 0, mf.size);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#ffbe3b');
    g.addColorStop(1, 'rgba(255, 80, 30, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(4, 0, mf.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawBuildings25D(ctx, buildings, camX, camY, view, mood, time) {
  // Collect visible buildings and sort back-to-front by distance from camera
  const visible = [];
  for (const b of buildings) {
    if (b.x + b.w < view.x1 || b.x > view.x2 || b.y + b.h < view.y1 || b.y > view.y2) continue;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    visible.push({ b, d2: (cx - camX) ** 2 + (cy - camY) ** 2 });
  }
  visible.sort((a, b) => b.d2 - a.d2);

  const shadowOffX = mood === 'twilight' ? 14 : 26;
  const shadowOffY = mood === 'twilight' ? 12 : 18;

  for (const { b } of visible) {
    // Golden-hour cast shadow
    const shScale = b.height / 75;
    ctx.fillStyle = 'rgba(7, 10, 22, 0.34)';
    ctx.fillRect(b.x + shadowOffX * shScale, b.y + shadowOffY * shScale, b.w, b.h);

    // 2.5D perspective roof projection
    const k = b.height * 0.0026;
    const rx1 = b.x + (b.x - camX) * k;
    const ry1 = b.y + (b.y - camY) * k;
    const rx2 = b.x + b.w + (b.x + b.w - camX) * k;
    const ry2 = b.y + b.h + (b.y + b.h - camY) * k;

    const x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;

    // Draw only outward-facing walls
    if (ry2 < y2) drawWallQuad(ctx, x1, y2, x2, y2, rx2, ry2, rx1, ry2, b.wallDark, b.windows, b.accent, mood);
    if (ry1 > y1) drawWallQuad(ctx, x1, y1, x2, y1, rx2, ry1, rx1, ry1, b.wallLight, b.windows, b.accent, mood);
    if (rx2 < x2) drawWallQuad(ctx, x2, y1, x2, y2, rx2, ry2, rx2, ry1, b.wallDark, b.windows, b.accent, mood);
    if (rx1 > x1) drawWallQuad(ctx, x1, y1, x1, y2, rx1, ry2, rx1, ry1, b.wallLight, b.windows, b.accent, mood);

    // Roof top
    const rw = rx2 - rx1;
    const rh = ry2 - ry1;
    ctx.fillStyle = b.roofColor;
    ctx.fillRect(rx1, ry1, rw, rh);

    // Subtle roof ledge & neon trim
    ctx.strokeStyle = b.accent ? b.accent + (mood === 'twilight' ? 'cc' : '77') : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = b.style === 'container' ? 1.5 : 2.2;
    ctx.strokeRect(rx1 + 1, ry1 + 1, rw - 2, rh - 2);

    if (b.style === 'container') {
      // Shipping container ribs
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;
      for (let cx = rx1 + 8; cx < rx2 - 6; cx += 9) {
        ctx.beginPath();
        ctx.moveTo(cx, ry1 + 2);
        ctx.lineTo(cx, ry2 - 2);
        ctx.stroke();
      }
      continue;
    }

    // Rooftop details
    if (b.roofDetail === 'helipad' && rw > 70 && rh > 70) {
      const hx = rx1 + rw / 2;
      const hy = ry1 + rh / 2;
      const hr = Math.min(rw, rh) * 0.28;
      ctx.strokeStyle = '#ffbe3b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffbe3b';
      ctx.font = `900 ${Math.round(hr * 1.1)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', hx, hy + 1);
    } else if (b.roofDetail === 'pool' && rw > 72 && rh > 64) {
      ctx.fillStyle = '#00d2e6';
      ctx.fillRect(rx1 + 14, ry1 + 14, rw * 0.42, rh * 0.36);
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx1 + 14, ry1 + 14, rw * 0.42, rh * 0.36);
    } else if (b.roofDetail === 'skylight' && rw > 60 && rh > 60) {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.28)';
      ctx.fillRect(rx1 + rw * 0.2, ry1 + rh * 0.2, rw * 0.6, rh * 0.6);
    } else if (b.roofDetail === 'ac' && rw > 50 && rh > 50) {
      ctx.fillStyle = 'rgba(15, 20, 32, 0.36)';
      ctx.fillRect(rx1 + 12, ry1 + 12, 18, 18);
      ctx.fillRect(rx1 + 36, ry1 + 12, 18, 18);
    }

    // Glowing neon rooftop sign
    if (b.sign && rw > 75) {
      const pulse = 0.85 + Math.sin(time * 3 + b.x) * 0.15;
      ctx.save();
      ctx.font = '900 11px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sx = rx1 + rw / 2;
      const sy = ry2 - 14;
      ctx.fillStyle = 'rgba(8, 10, 20, 0.82)';
      const tw = Math.min(rw - 12, ctx.measureText(b.sign.text).width + 12);
      ctx.fillRect(sx - tw / 2, sy - 9, tw, 18);
      ctx.shadowColor = b.sign.color;
      ctx.shadowBlur = 10 * pulse;
      ctx.fillStyle = b.sign.color;
      ctx.fillText(b.sign.text, sx, sy + 0.5, rw - 16);
      ctx.restore();
    }
  }
}

function drawWallQuad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, fill, hasWindows, accent, mood) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();

  if (hasWindows) {
    // Draw 2 lit window bands interpolated across the perspective quad
    const winCol = mood === 'twilight' ? (accent || '#ffe699') : 'rgba(255, 238, 180, 0.55)';
    ctx.strokeStyle = winCol;
    ctx.globalAlpha = mood === 'twilight' ? 0.65 : 0.45;
    ctx.lineWidth = 2.2;
    for (const t of [0.35, 0.7]) {
      const ax = x1 + (x4 - x1) * t;
      const ay = y1 + (y4 - y1) * t;
      const bx = x2 + (x3 - x2) * t;
      const by = y2 + (y3 - y2) * t;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawPalmsAndUmbrellas(ctx, city, view, time) {
  // Beach umbrellas
  for (const u of city.umbrellas) {
    if (u.x < view.x1 || u.x > view.x2 || u.y < view.y1 || u.y > view.y2) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(u.x + 8, u.y + 6, u.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = u.color;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.arc(u.x, u.y, u.r, i * Math.PI / 2, i * Math.PI / 2 + Math.PI / 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Swaying palm trees
  for (const p of city.palms) {
    if (p.x < view.x1 || p.x > view.x2 || p.y < view.y1 || p.y > view.y2) continue;
    const sway = Math.sin(time * 1.8 + p.phase) * 2.5;
    const cx = p.x + sway;
    const cy = p.y - 6;

    // Long sunset shadow
    ctx.fillStyle = 'rgba(8, 12, 24, 0.28)';
    ctx.beginPath();
    ctx.ellipse(p.x + 18, p.y + 12, p.radius * 0.9, p.radius * 0.55, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.strokeStyle = '#7d5638';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // 7 fronds
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + sway * 0.03;
      const fx = cx + Math.cos(a) * p.radius;
      const fy = cy + Math.sin(a) * p.radius;
      ctx.strokeStyle = i % 2 === 0 ? '#27a367' : '#35c47c';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }
    ctx.fillStyle = '#5c3c24';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStreetLights(ctx, lights, view, mood) {
  const glowAlpha = mood === 'twilight' ? 0.24 : 0.14;
  for (const l of lights) {
    if (l.x < view.x1 || l.x > view.x2 || l.y < view.y1 || l.y > view.y2) continue;
    const g = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 44);
    g.addColorStop(0, `rgba(255, 200, 120, ${glowAlpha})`);
    g.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticlesAndExplosions(ctx, fx) {
  for (const e of fx.explosions) {
    const a = Math.max(0, e.life / e.maxLife);
    const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, e.radius);
    g.addColorStop(0, `rgba(255, 250, 210, ${a})`);
    g.addColorStop(0.45, `rgba(255, 110, 45, ${a * 0.85})`);
    g.addColorStop(1, 'rgba(255, 30, 70, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPopups(ctx, popups) {
  ctx.save();
  ctx.font = '900 15px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  for (const pop of popups) {
    ctx.globalAlpha = Math.max(0, Math.min(1, pop.life / pop.maxLife));
    ctx.fillStyle = '#080c18';
    ctx.fillText(pop.text, pop.x + 1.5, pop.y + 1.5);
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, pop.x, pop.y);
  }
  ctx.restore();
}

function drawAtmosphericGrade(ctx, width, height, mood) {
  ctx.save();
  if (mood === 'sunset') {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, 'rgba(255, 110, 70, 0.14)');
    g.addColorStop(0.55, 'rgba(255, 46, 147, 0.08)');
    g.addColorStop(1, 'rgba(20, 12, 48, 0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, 'rgba(18, 22, 62, 0.24)');
    g.addColorStop(0.6, 'rgba(0, 180, 255, 0.07)');
    g.addColorStop(1, 'rgba(255, 46, 147, 0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  // Subtle vignette
  const vig = ctx.createRadialGradient(width / 2, height / 2, width * 0.34, width / 2, height / 2, width * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(4, 6, 16, 0.36)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawOffscreenArrow(ctx, width, height, camX, camY, wp) {
  const sx = wp.x - camX + width / 2;
  const sy = wp.y - camY + height / 2;
  if (sx > 40 && sx < width - 40 && sy > 40 && sy < height - 40) return;

  const angle = Math.atan2(sy - height / 2, sx - width / 2);
  const rx = width / 2 - 58;
  const ry = height / 2 - 58;
  const ax = width / 2 + Math.cos(angle) * Math.min(rx, Math.abs(rx / Math.cos(angle)));
  const ay = height / 2 + Math.sin(angle) * Math.min(ry, Math.abs(ry / Math.sin(angle)));
  const clampedX = Math.max(58, Math.min(width - 58, ax));
  const clampedY = Math.max(88, Math.min(height - 88, ay));

  ctx.save();
  ctx.translate(clampedX, clampedY);
  ctx.rotate(angle);
  ctx.fillStyle = wp.color;
  ctx.strokeStyle = '#080c18';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(-9, -8);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-9, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
