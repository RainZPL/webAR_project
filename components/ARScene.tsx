import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls } from '@react-three/drei';
import { Vector3, Group, PCFSoftShadowMap } from 'three';
import { XR, useXR } from '@react-three/xr';
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
  xrStore: any;
  onXRActiveChange: (active: boolean) => void;
  onXRFrame: (x: number, z: number, heading: number) => void;
}

// Helper to manually update camera if DeviceOrientationControls is flaky or we want manual override
const CameraRig = ({ cameraRotation }: { cameraRotation: any }) => {
  const { isPresenting } = useXR();
  useFrame(() => {
    // DeviceOrientationControls handles rotation in non-XR fallback mode.
  });
  if (isPresenting) return null;
  return <DeviceOrientationControls />; 
};

const XRStatus = ({
  onXRActiveChange,
  onXRFrame
}: {
  onXRActiveChange: (active: boolean) => void;
  onXRFrame: (x: number, z: number, heading: number) => void;
}) => {
  const { isPresenting } = useXR();
  const { camera } = useThree();
  const forwardRef = useRef(new Vector3());
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    onXRActiveChange(isPresenting);
  }, [isPresenting, onXRActiveChange]);

  useFrame(() => {
    if (!isPresenting) return;
    const now = performance.now();
    if (now - lastUpdateRef.current < 120) return;
    lastUpdateRef.current = now;
    camera.getWorldDirection(forwardRef.current);
    const heading =
      ((Math.atan2(forwardRef.current.x, -forwardRef.current.z) * 180) / Math.PI + 360) % 360;
    onXRFrame(camera.position.x, camera.position.z, heading);
  });

  return null;
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
  evacStartTime,
  xrStore,
  onXRActiveChange,
  onXRFrame
}) => {

  return (
    <Canvas 
      camera={{ position: [0, 1.6, 0], fov: 75 }} 
      gl={{ alpha: true, antialias: true }}
      shadows
      onCreated={({ gl }) => {
        gl.xr.enabled = true;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = PCFSoftShadowMap;
        gl.setClearColor(0x000000, 0);
        (gl as any).physicallyCorrectLights = true;
      }}
      className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none"
    >
      <XR store={xrStore}>
        <XRStatus onXRActiveChange={onXRActiveChange} onXRFrame={onXRFrame} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[6, 10, 4]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={0.1}
          shadow-camera-far={25}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        
        <CameraRig cameraRotation={cameraRotation} />

        <GroundShadow />

        {/* Wild Nodes */}
        <NodeLayer
          nodes={nodes}
          capturingId={capturingId}
        />

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
      </XR>
    </Canvas>
  );
};

const GroundShadow = () => {
  const { isPresenting } = useXR();
  if (!isPresenting) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <shadowMaterial transparent opacity={0.25} />
    </mesh>
  );
};

const NodeLayer = ({
  nodes,
  capturingId
}: {
  nodes: GameNode[];
  capturingId: string | null;
}) => (
  <>
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
  </>
);
