import { Coordinates } from '../types';

const EARTH_RADIUS_KM = 6371;

export const getDistanceFromLatLonInMeters = (pos1: Coordinates, pos2: Coordinates): number => {
  const dLat = deg2rad(pos2.latitude - pos1.latitude);
  const dLon = deg2rad(pos2.longitude - pos1.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(pos1.latitude)) *
      Math.cos(deg2rad(pos2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (EARTH_RADIUS_KM * c) * 1000; // Return meters
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

// Converts a geo coordinate to a local Cartesian vector (x, 0, -z) relative to an origin
// We treat the origin as (0,0,0). North is -Z, East is +X
export const gpsToLocalVector = (
  origin: Coordinates,
  target: Coordinates
): [number, number, number] => {
  const dist = getDistanceFromLatLonInMeters(origin, target);
  const bearing = getBearing(origin, target);
  
  // Convert bearing (degrees) to radians. 0 is North.
  // In 3D: North is -Z, East is +X. 
  // Standard math: 0 is +X (East), 90 is +Y (North). 
  // We need to adjust. 
  // Bearing 0 -> -Z. Bearing 90 -> +X.
  const angleRad = deg2rad(bearing);
  
  const x = Math.sin(angleRad) * dist;
  const z = -Math.cos(angleRad) * dist;
  
  return [x, 0, z];
};

export const getBearing = (start: Coordinates, dest: Coordinates): number => {
  const startLat = deg2rad(start.latitude);
  const startLng = deg2rad(start.longitude);
  const destLat = deg2rad(dest.latitude);
  const destLng = deg2rad(dest.longitude);

  const y = Math.sin(destLng - startLng) * Math.cos(destLat);
  const x =
    Math.cos(startLat) * Math.sin(destLat) -
    Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);
  let brng = Math.atan2(y, x);
  brng = (brng * 180) / Math.PI;
  return (brng + 360) % 360;
};

// Generate a random coordinate within a sector relative to heading
export const generateRandomNode = (
  center: Coordinates,
  heading: number,
  minDist: number,
  maxDist: number
): Coordinates => {
  // Random distance
  const dist = minDist + Math.random() * (maxDist - minDist);
  
  // Random angle bias towards heading (e.g., +/- 60 degrees)
  const angleBias = (Math.random() - 0.5) * 120; 
  const targetBearing = (heading + angleBias + 360) % 360;

  return movePoint(center, dist, targetBearing);
};

// Now exported for simulation
export const movePoint = (start: Coordinates, distanceMeters: number, bearing: number): Coordinates => {
  const distRatio = distanceMeters / 1000 / EARTH_RADIUS_KM;
  const distRatioSine = Math.sin(distRatio);
  const distRatioCosine = Math.cos(distRatio);

  const startLatRad = deg2rad(start.latitude);
  const startLonRad = deg2rad(start.longitude);
  const bearingRad = deg2rad(bearing);

  const startLatCos = Math.cos(startLatRad);
  const startLatSin = Math.sin(startLatRad);

  const endLatRad = Math.asin(
    startLatSin * distRatioCosine + startLatCos * distRatioSine * Math.cos(bearingRad)
  );

  const endLonRad =
    startLonRad +
    Math.atan2(
      Math.sin(bearingRad) * distRatioSine * startLatCos,
      distRatioCosine - startLatSin * Math.sin(endLatRad)
    );

  return {
    latitude: (endLatRad * 180) / Math.PI,
    longitude: (endLonRad * 180) / Math.PI,
  };
};
