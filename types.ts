import React from 'react';

export enum GameState {
  IDLE = 'IDLE', // Initial state, waiting for permissions
  OUTDOOR_SEARCH = 'OUTDOOR_SEARCH', // Walking around looking for nodes
  CAPTURE_READY = 'CAPTURE_READY', // Node is visible and close enough
  CAPTURING = 'CAPTURING', // Holding button to capture
  CARRYING = 'CARRYING', // Just captured, transition state
  EVAC_READY = 'EVAC_READY', // Close to home
  EVAC_ANIM = 'EVAC_ANIM', // End sequence
  RESULT = 'RESULT', // Game over summary
}

export enum NodeType {
  JUNCTION = 'Junction',
  OPEN_SPACE = 'Open Space',
  EDGE = 'Edge',
}

export enum RewardTier {
  BASIC = 'Warm Light',
  ADVANCED = 'Radiant Core',
  CORE = 'Stellar Fragment',
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GameNode {
  id: string;
  type: NodeType;
  tier: RewardTier;
  geoPosition: Coordinates;
  position: [number, number, number]; // Local Vector3 relative to player
  captured: boolean;
  discovered: boolean;
}

export interface Companion {
  id: string;
  tier: RewardTier;
  offset: [number, number, number]; // Offset position relative to player
}

export interface GameStats {
  startTime: number;
  distanceWalked: number;
  rewardsCollected: number;
  outdoorTimeMs: number;
}

export interface RewardRecord {
  id: string;
  type: NodeType;
  tier: RewardTier;
}

// Global JSX augmentation for React Three Fiber
// This ensures standard Three.js elements are recognized by TypeScript in JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      sphereGeometry: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      pointLight: any;
      ambientLight: any;
      fog: any;
    }
  }
}
