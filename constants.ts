export const WORLD_SCALE = 1.0; // 1 unit = 1 meter

// Gameplay Radii (in meters)
export const SPAWN_RADIUS_MIN = 20;
export const SPAWN_RADIUS_MAX = 80;
export const DISCOVER_RADIUS = 18; // Visible in AR
export const CAPTURE_RADIUS = 10; // Capturable distance
export const HOME_RADIUS = 20; // Radius to trigger Evac

// Timing
export const CAPTURE_TIME_BASIC_MS = 1500;
export const CAPTURE_TIME_ADVANCED_MS = 2200;
export const CAPTURE_TIME_CORE_MS = 2600;
export const EVAC_DURATION_MS = 4000;

// Reticle / Sensor heuristics
export const RETICLE_ANGLE_DEG = 18;
export const OUTDOOR_ACCURACY_MAX = 30;
export const INDOOR_ACCURACY_MIN = 50;
export const INDOOR_HOLD_MS = 5000;

// Companion offsets (meters)
export const COMPANION_DISTANCE_MIN = 1.2;
export const COMPANION_DISTANCE_MAX = 2.2;

// Colors
export const ORB_COLOR_BASE = '#fb923c'; // Orange-400
export const ORB_COLOR_GLOW = '#ea580c'; // Orange-600
export const COMPANION_COLOR = '#fdba74'; // Orange-300

// GPS Simulation for testing (optional, not used in prod)
export const USE_MOCK_GPS = false;
