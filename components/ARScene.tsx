import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls } from '@react-three/drei';
import { Vector3, Group } from 'three';
import { GameNode, Companion, GameState } from '../types';
import { Orb } from './Orb';

interface ARSceneProps {
  nodes: GameNode[];
  companions: Companion[];
  gameState: GameState;
  capturingId: string | null;
  cameraRotation: { alpha: number; beta: number; gamma: number } | null;
}

// Helper to manually update camera if DeviceOrientationControls is flaky or we want manual override
const CameraRig = ({ cameraRotation }: { cameraRotation: any }) => {
  const { camera } = useThree();
  
  useFrame(() => {
    // If using the official DeviceOrientationControls from drei, it handles this.
    // However, sometimes we need to calibrate "North".
    // For this prototype, we'll rely on Drei's controls but ideally we'd offset by compass heading.
  });
  
  return <DeviceOrientationControls />; 
};

const CompanionGroup = ({ companions }: { companions: Companion[] }) => {
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();
  
  useFrame(() => {
    if (groupRef.current) {
      // Lerp group to camera position
      const targetPos = camera.position.clone();
      // Keep them slightly in front/around
      groupRef.current.position.lerp(targetPos, 0.05);
      
      // Rotate the group to match camera Y rotation so they stay relative to view?
      // Or just let them trail. Let's make them trail.
    }
  });

  return (
    <group ref={groupRef}>
      {companions.map((c, i) => {
        // Calculate a formation offset
        const angle = (i / (companions.length || 1)) * Math.PI * 2;
        const radius = 1.2;
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        
        return (
          <Orb 
            key={c.id} 
            position={[x, 0, z]} 
            isCompanion={true} 
          />
        );
      })}
    </group>
  );
};

export const ARScene: React.FC<ARSceneProps> = ({ 
  nodes, 
  companions, 
  gameState, 
  capturingId,
  cameraRotation
}) => {

  return (
    <Canvas 
      camera={{ position: [0, 1.7, 0], fov: 75 }} 
      gl={{ alpha: true, antialias: true }}
      className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none"
    >
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />
      
      <CameraRig cameraRotation={cameraRotation} />

      {/* Wild Nodes */}
      {nodes.map((node) => {
        if (!node.discovered || node.captured) return null;
        return (
          <Orb 
            key={node.id} 
            position={node.position} 
            isCapturing={capturingId === node.id}
          />
        );
      })}

      {/* Captured Companions */}
      <CompanionGroup companions={companions} />
      
      {/* Evac Visuals could go here */}
      {gameState === GameState.EVAC_ANIM && (
        <fog attach="fog" args={['#000', 0, 15]} />
      )}
    </Canvas>
  );
};