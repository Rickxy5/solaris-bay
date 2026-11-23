// Multi-district coastal city generator and collision utilities for Solaris Bay.

import { WORLD, DISTRICTS } from './config.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEON_SIGNS = {
  palmfront: [
    { text: 'HOTEL SOLARIS', color: '#ff2e93' },
    { text: 'PALM TERRACE', color: '#00f0ff' },
    { text: 'CLUB VELVET', color: '#ffbe3b' },
    { text: 'OCEAN LOUNGE', color: '#ff6b4a' },
    { text: 'BAYVIEW SUITES', color: '#b84dff' },
  ],
  midtown: [
    { text: 'SOLARIS BANK', color: '#00f0ff' },
    { text: 'APEX TOWER', color: '#ff2e93' },
    { text: 'NEON ARCADE', color: '#ffbe3b' },
    { text: 'METRO PLAZA', color: '#4dffb8' },
    { text: 'VERTEX CORP', color: '#5ca9ff' },
  ],
  sunset: [
    { text: 'SUNSET LOUNGE', color: '#ff6b4a' },
    { text: 'VICE VINYL', color: '#ff2e93' },
    { text: 'BAYSIDE DINER', color: '#ffbe3b' },
    { text: 'PALM MOTEL', color: '#00f0ff' },
  ],
  harbor: [
    { text: 'CORAL FREIGHT', color: '#ff9234' },
    { text: 'PIER 4 CARGO', color: '#00f0ff' },
    { text: 'BAYLINE DOCKS', color: '#ff2e93' },
  ],
};

export function createCity(seed = 2026) {
  const rand = mulberry32(seed);
  const buildings = [];
  const palms = [];
  const parks = [];
  const containers = [];
  const umbrellas = [];
  const piers = [];
  const streetLights = [];

  const halfRoad = WORLD.roadWidth / 2 + WORLD.sidewalkWidth;
  const xBands = [
    [60, WORLD.vRoads[0] - halfRoad],
    [WORLD.vRoads[0] + halfRoad, WORLD.vRoads[1] - halfRoad],
    [WORLD.vRoads[1] + halfRoad, WORLD.vRoads[2] - halfRoad],
    [WORLD.vRoads[2] + halfRoad, WORLD.vRoads[3] - halfRoad],
  ];
  const yBands = [
    [60, WORLD.hRoads[0] - halfRoad],
    [WORLD.hRoads[0] + halfRoad, WORLD.hRoads[1] - halfRoad],
    [WORLD.hRoads[1] + halfRoad, WORLD.hRoads[2] - halfRoad],
    [WORLD.hRoads[2] + halfRoad, WORLD.hRoads[3] - halfRoad],
    [WORLD.hRoads[3] + halfRoad, WORLD.height - 60],
  ];

  // Central Midtown Park (block col 1, row 1)
  parks.push({
    x: xBands[1][0] + 10,
    y: yBands[1][0] + 10,
    w: xBands[1][1] - xBands[1][0] - 20,
    h: yBands[1][1] - yBands[1][0] - 20,
    hasFountain: true,
  });

  // Palmfront Beachfront Park strip along east of Palmfront Blvd
  parks.push({
    x: WORLD.vRoads[3] + halfRoad + 6,
    y: 120,
    w: WORLD.beachX - (WORLD.vRoads[3] + halfRoad) - 18,
    h: 1360,
    hasFountain: false,
    boardwalk: true,
  });

  // Ocean Piers
  piers.push({ x: WORLD.beachX + 120, y: 660, w: 340, h: 64 });
  piers.push({ x: WORLD.beachX + 110, y: 1260, w: 280, h: 52 });
  // Coral Harbor industrial piers
  piers.push({ x: 2220, y: 1740, w: 560, h: 110, industrial: true });
  piers.push({ x: 2220, y: 2020, w: 540, h: 110, industrial: true });

  const signIdx = { palmfront: 0, midtown: 0, sunset: 0, harbor: 0 };

  for (let col = 0; col < xBands.length; col++) {
    for (let row = 0; row < yBands.length; row++) {
      // Skip central Midtown park
      if (col === 1 && row === 1) continue;

      const [bx1, bx2] = xBands[col];
      const [by1, by2] = yBands[row];
      const bw = bx2 - bx1;
      const bh = by2 - by1;
      if (bw < 120 || bh < 120) continue;

      const cx = (bx1 + bx2) / 2;
      const cy = (by1 + by2) / 2;
      const district = getDistrictAt(cx, cy).id;

      // Coral Harbor cargo yard (col 3, rows 3 & 4)
      if (col === 3 && row >= 3) {
        // Warehouse on west half, containers on east half
        buildings.push(makeBuilding(bx1 + 14, by1 + 14, bw * 0.48, bh - 28, 'harbor', rand, signIdx));
        const contColors = ['#d94a38', '#2c82c9', '#e8a838', '#2e9e6b', '#c44569'];
        for (let ci = 0; ci < 5; ci++) {
          const cx0 = bx1 + bw * 0.56 + (ci % 2) * 84;
          const cy0 = by1 + 22 + Math.floor(ci / 2) * 96;
          if (cy0 + 64 < by2 - 10) {
            const cont = {
              x: cx0,
              y: cy0,
              w: 66,
              h: 32,
              color: contColors[(ci + row) % contColors.length],
              height: 22,
            };
            containers.push(cont);
            buildings.push({
              x: cont.x,
              y: cont.y,
              w: cont.w,
              h: cont.h,
              height: 22,
              roofColor: cont.color,
              wallLight: shadeColor(cont.color, -15),
              wallDark: shadeColor(cont.color, -35),
              district: 'harbor',
              style: 'container',
              windows: false,
              roofDetail: 'none',
            });
          }
        }
        continue;
      }

      // Subdivide block into 2-4 buildings with alleys
      const subCols = bw > 340 ? 2 : 1;
      const subRows = bh > 320 ? 2 : 1;
      const pad = 16;
      const gap = 22;
      const cellW = (bw - pad * 2 - gap * (subCols - 1)) / subCols;
      const cellH = (bh - pad * 2 - gap * (subRows - 1)) / subRows;

      for (let sc = 0; sc < subCols; sc++) {
        for (let sr = 0; sr < subRows; sr++) {
          const x = bx1 + pad + sc * (cellW + gap);
          const y = by1 + pad + sr * (cellH + gap);
          const insetW = rand() * 14;
          const insetH = rand() * 14;
          buildings.push(
            makeBuilding(x + insetW * 0.5, y + insetH * 0.5, cellW - insetW, cellH - insetH, district, rand, signIdx),
          );
        }
      }
    }
  }

  // Palm trees lining Palmfront Boulevard, boardwalk, Sunset Strip, and parks
  for (let y = 110; y < 1560; y += 92) {
    palms.push({ x: WORLD.vRoads[3] + halfRoad + 22, y, radius: 22 + rand() * 8, phase: rand() * 6.28 });
    palms.push({ x: WORLD.beachX - 16, y: y + 40, radius: 24 + rand() * 8, phase: rand() * 6.28 });
    if (y % 184 < 92) {
      palms.push({ x: WORLD.vRoads[3] - halfRoad - 14, y: y + 20, radius: 20 + rand() * 6, phase: rand() * 6.28 });
    }
  }
  for (let x = 140; x < 1520; x += 130) {
    if (!isOnRoad(x, WORLD.hRoads[2] - halfRoad - 12)) {
      palms.push({ x, y: WORLD.hRoads[2] - halfRoad - 12, radius: 21 + rand() * 7, phase: rand() * 6.28 });
    }
    if (!isOnRoad(x, WORLD.hRoads[3] + halfRoad + 14)) {
      palms.push({ x, y: WORLD.hRoads[3] + halfRoad + 14, radius: 22 + rand() * 7, phase: rand() * 6.28 });
    }
  }
  // Midtown park palms
  const mp = parks[0];
  for (let i = 0; i < 12; i++) {
    const px = mp.x + 36 + rand() * (mp.w - 72);
    const py = mp.y + 36 + rand() * (mp.h - 72);
    if (Math.hypot(px - (mp.x + mp.w / 2), py - (mp.y + mp.h / 2)) > 72) {
      palms.push({ x: px, y: py, radius: 22 + rand() * 8, phase: rand() * 6.28 });
    }
  }

  // Beach umbrellas along Palmfront Beach
  const umbColors = ['#ff2e93', '#00f0ff', '#ffbe3b', '#ff6b4a', '#ffffff'];
  for (let y = 160; y < 1480; y += 110) {
    umbrellas.push({
      x: WORLD.beachX + 55 + rand() * 90,
      y: y + rand() * 30,
      r: 16 + rand() * 5,
      color: umbColors[Math.floor(rand() * umbColors.length)],
    });
  }

  // Streetlights along main avenues
  for (const vx of WORLD.vRoads) {
    for (let y = 160; y < WORLD.height - 120; y += 220) {
      if (WORLD.hRoads.some((hy) => Math.abs(y - hy) < 95)) continue;
      streetLights.push({ x: vx - WORLD.roadWidth / 2 - 10, y });
      streetLights.push({ x: vx + WORLD.roadWidth / 2 + 10, y: y + 110 });
    }
  }

  return {
    buildings,
    palms,
    parks,
    containers,
    umbrellas,
    piers,
    streetLights,
  };
}

function makeBuilding(x, y, w, h, district, rand, signIdx) {
  let height, roofColor, wallLight, wallDark, accent, roofDetail;
  if (district === 'midtown') {
    height = 75 + rand() * 85;
    const palettes = [
      ['#263452', '#354970', '#1b263d', '#00f0ff'],
      ['#2d284d', '#433b6e', '#1f1b38', '#ff2e93'],
      ['#223c4a', '#31576b', '#172933', '#4dffb8'],
      ['#36344a', '#4d4a69', '#252336', '#ffbe3b'],
    ];
    const p = palettes[Math.floor(rand() * palettes.length)];
    [roofColor, wallLight, wallDark, accent] = p;
    roofDetail = rand() < 0.35 ? 'helipad' : rand() < 0.7 ? 'ac' : 'skylight';
  } else if (district === 'palmfront') {
    height = 55 + rand() * 60;
    const palettes = [
      ['#f2d0d9', '#f7b2c4', '#c97e96', '#ff2e93'],
      ['#d1f0ee', '#9ee0db', '#64a8a3', '#00f0ff'],
      ['#f7e2be', '#f0c686', '#bd8c52', '#ffbe3b'],
      ['#e2d4f5', '#c2a7eb', '#8469b0', '#b84dff'],
    ];
    const p = palettes[Math.floor(rand() * palettes.length)];
    [roofColor, wallLight, wallDark, accent] = p;
    roofDetail = rand() < 0.45 ? 'pool' : 'ac';
  } else if (district === 'sunset') {
    height = 42 + rand() * 48;
    const palettes = [
      ['#4a2c40', '#693c58', '#331d2b', '#ff6b4a'],
      ['#3b2b52', '#563f75', '#271c38', '#ff2e93'],
      ['#4f3b2e', '#735642', '#36271d', '#ffbe3b'],
    ];
    const p = palettes[Math.floor(rand() * palettes.length)];
    [roofColor, wallLight, wallDark, accent] = p;
    roofDetail = rand() < 0.4 ? 'pool' : 'ac';
  } else {
    height = 36 + rand() * 34;
    roofColor = '#3c4654';
    wallLight = '#546173';
    wallDark = '#2a323d';
    accent = '#ff9234';
    roofDetail = 'ac';
  }

  let sign = null;
  if (rand() < 0.42) {
    const pool = NEON_SIGNS[district] || NEON_SIGNS.midtown;
    sign = pool[signIdx[district] % pool.length];
    signIdx[district]++;
  }

  return {
    x,
    y,
    w,
    h,
    height,
    roofColor,
    wallLight,
    wallDark,
    accent,
    district,
    style: district,
    windows: true,
    roofDetail,
    sign,
  };
}

function shadeColor(hex, delta) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + delta));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + delta));
  const b = Math.max(0, Math.min(255, (num & 255) + delta));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function getDistrictAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2) return d;
  }
  return DISTRICTS[0];
}

export function isOnRoad(x, y, margin = 0) {
  const half = WORLD.roadWidth / 2 + margin;
  for (const vx of WORLD.vRoads) {
    if (Math.abs(x - vx) <= half) return true;
  }
  for (const hy of WORLD.hRoads) {
    if (Math.abs(y - hy) <= half) return true;
  }
  return false;
}

export function isInWater(x, y, city) {
  if (x < WORLD.oceanX) return false;
  if (city) {
    for (const p of city.piers) {
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
    }
  }
  return true;
}

export function resolveCircleBuildings(entity, radius, city) {
  let hit = false;
  // Keep inside world bounds and out of deep ocean
  const maxX = isInWater(entity.x, entity.y, city) ? WORLD.oceanX - radius : WORLD.width - radius;
  if (entity.x < radius) { entity.x = radius; hit = true; }
  if (entity.x > maxX && isInWater(entity.x + 2, entity.y, city)) { entity.x = WORLD.oceanX - radius; hit = true; }
  if (entity.y < radius) { entity.y = radius; hit = true; }
  if (entity.y > WORLD.height - radius) { entity.y = WORLD.height - radius; hit = true; }

  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(entity.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(entity.y, b.y + b.h));
    const dx = entity.x - cx;
    const dy = entity.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      const dist = Math.sqrt(d2) || 0.001;
      if (d2 > 0.0001) {
        const push = radius - dist;
        entity.x += (dx / dist) * push;
        entity.y += (dy / dist) * push;
      } else {
        // Inside AABB fallback: push out nearest edge
        const left = entity.x - b.x;
        const right = b.x + b.w - entity.x;
        const top = entity.y - b.y;
        const bottom = b.y + b.h - entity.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) entity.x = b.x - radius;
        else if (m === right) entity.x = b.x + b.w + radius;
        else if (m === top) entity.y = b.y - radius;
        else entity.y = b.y + b.h + radius;
      }
    }
  }
  return hit;
}

export function segmentHitsBuilding(x1, y1, x2, y2, city) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 14);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (const b of city.buildings) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
        return { x: px, y: py, building: b };
      }
    }
  }
  return null;
}
