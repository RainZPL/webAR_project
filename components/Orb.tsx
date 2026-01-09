import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';
import { ORB_COLOR_BASE, ORB_COLOR_GLOW, EVAC_DURATION_MS } from '../constants';
import { NodeType, RewardTier } from '../types';
import '../types';

interface OrbProps {
  position: [number, number, number];
  isCompanion?: boolean;
  isCapturing?: boolean;
  pulseKey?: number;
  tier?: RewardTier;
  nodeType?: NodeType;
  evacActive?: boolean;
  evacStartTime?: number | null;
}

const getTierColors = (tier?: RewardTier) => {
  switch (tier) {
    case RewardTier.ADVANCED:
      return { base: '#fbbf24', glow: '#f59e0b' };
    case RewardTier.CORE:
      return { base: '#fde68a', glow: '#f59e0b' };
    case RewardTier.BASIC:
    default:
      return { base: ORB_COLOR_BASE, glow: ORB_COLOR_GLOW };
  }
};

export const Orb: React.FC<OrbProps> = ({
  position,
  isCompanion,
  isCapturing,
  pulseKey,
  tier,
  nodeType,
  evacActive,
  evacStartTime
}) => {
  const meshRef = useRef<Mesh>(null);
  const lightRef = useRef<any>(null);
  const pulseStartRef = useRef<number | null>(null);
  const tierColors = getTierColors(tier);

  useEffect(() => {
    if (pulseKey !== undefined) {
      pulseStartRef.current = performance.now();
    }
  }, [pulseKey]);

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle floating animation
      const t = state.clock.getElapsedTime();
      const floatY = Math.sin(t * 2) * 0.1;
      const baseHeight = isCompanion ? 1.4 : 0.4;
      
      // If it's a companion, it follows the camera smoothly (logic handled in parent usually, 
      // but here we just do local animations)
      
      meshRef.current.position.y = position[1] + floatY + baseHeight;
      
      // Pulse effect
      const tierBoost = tier === RewardTier.CORE ? 0.12 : tier === RewardTier.ADVANCED ? 0.06 : 0;
      const typeBoost =
        nodeType === NodeType.JUNCTION ? 0.06 : nodeType === NodeType.EDGE ? -0.03 : 0;
      const scaleBase = (isCompanion ? 0.3 : 0.5) + tierBoost + typeBoost;
      const pulseSpeed = isCapturing ? 15 : 2;
      const pulse = Math.sin(t * pulseSpeed) * 0.05;
      let pulseBoost = 0;

      if (pulseStartRef.current !== null) {
        const elapsed = (performance.now() - pulseStartRef.current) / 1000;
        if (elapsed < 0.35) {
          pulseBoost = (1 - elapsed / 0.35) * 0.12;
        } else {
          pulseStartRef.current = null;
        }
      }
      
      const currentScale = scaleBase + pulse + (isCapturing ? 0.1 : 0) + pulseBoost;
      meshRef.current.scale.set(currentScale, currentScale, currentScale);

      const material = meshRef.current.material as any;
      let evacFade = 1;
      if (evacActive && evacStartTime) {
        const evacProgress = Math.min((Date.now() - evacStartTime) / EVAC_DURATION_MS, 1);
        evacFade = Math.max(0, 1 - evacProgress);
      }

      if (material && typeof material.emissiveIntensity === 'number') {
        const baseEmissive = isCapturing ? 3 : 1.5;
        material.emissiveIntensity = baseEmissive + pulseBoost * 8 + (1 - evacFade) * 1.2;
        material.opacity = 0.9 * evacFade;
      }

      if (lightRef.current) {
        const typeLightBoost = nodeType === NodeType.JUNCTION ? 0.4 : nodeType === NodeType.EDGE ? -0.2 : 0;
        lightRef.current.intensity = (2 + pulseBoost * 6 + (isCapturing ? 1.5 : 0) + typeLightBoost) * evacFade;
      }
    }
  });

  return (
    <group position={[position[0], 0, position[2]]}>
      {/* Core Mesh */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color={tierColors.base}
          emissive={isCapturing ? '#ffffff' : tierColors.glow}
          emissiveIntensity={isCapturing ? 3 : 1.5}
          roughness={0.1}
          metalness={0.1}
          transparent
          opacity={0.9}
        />
      </mesh>
      
      {/* Outer Glow Halo (Fake Volumetric) */}
      <mesh position={[0, 1.5, 0]} scale={[1.2, 1.2, 1.2]}>
         <sphereGeometry args={[0.5, 16, 16]} />
         <meshBasicMaterial 
            color={tierColors.glow} 
            transparent 
            opacity={0.3} 
            wireframe={false}
          />
      </mesh>

      <pointLight 
        ref={lightRef} 
        color={tierColors.glow} 
        intensity={2} 
        distance={5} 
        decay={2} 
        position={[0, 1.5, 0]} 
      />
    </group>
  );
};
