import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3 } from 'three';
import { ORB_COLOR_BASE, ORB_COLOR_GLOW } from '../constants';
import '../types';

interface OrbProps {
  position: [number, number, number];
  isCompanion?: boolean;
  isCapturing?: boolean;
}

export const Orb: React.FC<OrbProps> = ({ position, isCompanion, isCapturing }) => {
  const meshRef = useRef<Mesh>(null);
  const lightRef = useRef<any>(null);

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle floating animation
      const t = state.clock.getElapsedTime();
      const floatY = Math.sin(t * 2) * 0.1;
      
      // If it's a companion, it follows the camera smoothly (logic handled in parent usually, 
      // but here we just do local animations)
      
      meshRef.current.position.y = position[1] + floatY + 1.5; // Hover 1.5m above ground
      
      // Pulse effect
      const scaleBase = isCompanion ? 0.3 : 0.5;
      const pulseSpeed = isCapturing ? 15 : 2;
      const pulse = Math.sin(t * pulseSpeed) * 0.05;
      
      const currentScale = scaleBase + pulse + (isCapturing ? 0.1 : 0);
      meshRef.current.scale.set(currentScale, currentScale, currentScale);
    }
  });

  return (
    <group position={[position[0], 0, position[2]]}>
      {/* Core Mesh */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color={ORB_COLOR_BASE}
          emissive={isCapturing ? '#ffffff' : ORB_COLOR_GLOW}
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
            color={ORB_COLOR_GLOW} 
            transparent 
            opacity={0.3} 
            wireframe={false}
          />
      </mesh>

      <pointLight 
        ref={lightRef} 
        color={ORB_COLOR_GLOW} 
        intensity={2} 
        distance={5} 
        decay={2} 
        position={[0, 1.5, 0]} 
      />
    </group>
  );
};