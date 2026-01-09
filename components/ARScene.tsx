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
  pulseKey: number;
  evacStartTime: number | null;
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

const CompanionOrb = ({
  offset,
  gameState,
  pulseKey,
  tier,
  evacStartTime
}: {
  offset: [number, number, number];
  gameState: GameState;
  pulseKey: number;
  tier: Companion['tier'];
  evacStartTime: number | null;
}) => {
  const orbRef = useRef<Group>(null);
  const targetRef = useRef(new Vector3(offset[0], offset[1], offset[2]));
  const evacTargetRef = useRef(new Vector3(0, 0.2, -0.6));

  useEffect(() => {
    targetRef.current.set(offset[0], offset[1], offset[2]);
  }, [offset]);

  useFrame(() => {
    if (!orbRef.current) return;
    const target = gameState === GameState.EVAC_ANIM ? evacTargetRef.current : targetRef.current;
    const lerpFactor = gameState === GameState.EVAC_ANIM ? 0.12 : 0.04;
    orbRef.current.position.lerp(target, lerpFactor);
  });

  return (
    <group ref={orbRef}>
      <Orb
        position={[0, 0, 0]}
        isCompanion={true}
        pulseKey={pulseKey}
        tier={tier}
        evacActive={gameState === GameState.EVAC_ANIM}
        evacStartTime={evacStartTime}
      />
    </group>
  );
};

const CompanionGroup = ({
  companions,
  gameState,
  pulseKey,
  evacStartTime
}: {
  companions: Companion[];
  gameState: GameState;
  pulseKey: number;
  evacStartTime: number | null;
}) => {
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();
  
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.lerp(camera.position, 0.08);
    groupRef.current.quaternion.slerp(camera.quaternion, 0.1);
  });

  return (
    <group ref={groupRef}>
      {companions.map((c) => (
        <CompanionOrb
          key={c.id}
          offset={c.offset}
          gameState={gameState}
          pulseKey={pulseKey}
          tier={c.tier}
          evacStartTime={evacStartTime}
        />
      ))}
    </group>
  );
};

export const ARScene: React.FC<ARSceneProps> = ({ 
  nodes, 
  companions, 
  gameState, 
  capturingId,
  cameraRotation,
  pulseKey,
  evacStartTime
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
            tier={node.tier}
            nodeType={node.type}
          />
        );
      })}

      {/* Captured Companions */}
      <CompanionGroup
        companions={companions}
        gameState={gameState}
        pulseKey={pulseKey}
        evacStartTime={evacStartTime}
      />
      
      {/* Evac Visuals could go here */}
      {gameState === GameState.EVAC_ANIM && (
        <fog attach="fog" args={['#000', 0, 15]} />
      )}
    </Canvas>
  );
};
