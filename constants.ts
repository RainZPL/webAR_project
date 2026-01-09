export const WORLD_SCALE = 1.0; // 1 unit = 1 meter

// Gameplay Radii (in meters)
export const SPAWN_RADIUS_MIN = 20;
export const SPAWN_RADIUS_MAX = 80;
export const DISCOVER_RADIUS = 25; // Visible in AR
export const CAPTURE_RADIUS = 12; // Capturable distance
export const HOME_RADIUS = 20; // Radius to trigger Evac

// Timing
export const CAPTURE_TIME_MS = 2000;
export const EVAC_DURATION_MS = 4000;

// Colors
export const ORB_COLOR_BASE = '#fb923c'; // Orange-400
export const ORB_COLOR_GLOW = '#ea580c'; // Orange-600
export const COMPANION_COLOR = '#fdba74'; // Orange-300

// GPS Simulation for testing (optional, not used in prod)
export const USE_MOCK_GPS = false;