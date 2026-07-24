const PREFS_KEY = 'ghost-continuum-ui-prefs';

const DEFAULTS = {
  loreMode: false,
  explainMode: true,
  noviceMode: false,
  animationLevel: 'normal',
  themeIntensity: 'standard',
  visiblePlanes: null,
  mapAutoFocus: false,
  mapRefreshMs: 2000,
  statusRefreshMs: 10000,
  mapViewMode: 'timeline',
  mapOnboardingDone: false,
  mapPins: {},
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...prefs }));
}

export function isPlaneVisible(planeId, prefs = loadPrefs()) {
  if (!prefs.visiblePlanes) return true;
  return prefs.visiblePlanes[planeId] !== false;
}

const ALL_PLANES = ['ghost-lan', 'lan', 'edge', 'audit', 'narrative-weave', 'phantom-mesh', 'deep-veil', 'mirage-core'];

function visibilityMap(prefs = loadPrefs()) {
  const map = { ...(prefs.visiblePlanes || {}) };
  if (!prefs.visiblePlanes) ALL_PLANES.forEach((p) => { map[p] = true; });
  return map;
}

export function setPlaneVisibility(planeId, visible) {
  const map = visibilityMap();
  map[planeId] = visible;
  savePrefs({ visiblePlanes: map });
  return map;
}

export function togglePlaneVisibility(planeId) {
  const map = visibilityMap();
  map[planeId] = map[planeId] === false;
  savePrefs({ visiblePlanes: map });
  return map;
}