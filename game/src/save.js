// LocalStorage 3-slot save/load persistence for Solaris Bay.

const KEY_PREFIX = 'solaris_bay_slot_';

export function listSaves() {
  const slots = [];
  for (let i = 1; i <= 3; i++) {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + i);
      slots.push({ slot: i, data: raw ? JSON.parse(raw) : null });
    } catch {
      slots.push({ slot: i, data: null });
    }
  }
  return slots;
}

export function hasAnySave() {
  return listSaves().some((s) => s.data !== null);
}

export function getLatestSave() {
  let latest = null;
  for (const s of listSaves()) {
    if (s.data && (!latest || (s.data.savedAt || 0) > (latest.savedAt || 0))) {
      latest = s.data;
    }
  }
  return latest;
}

export function saveGame(slot, state) {
  const payload = {
    savedAt: Date.now(),
    cash: state.player.cash,
    hp: Math.round(state.player.hp),
    armor: Math.round(state.player.armor),
    x: Math.round(state.player.x),
    y: Math.round(state.player.y),
    weaponIndex: state.player.weaponIndex,
    ammo: [...state.player.ammo],
    completedMissions: state.missions.completedCount,
    wanted: Math.floor(state.police.wanted),
    district: state.currentDistrict,
  };
  try {
    localStorage.setItem(KEY_PREFIX + slot, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + slot);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
