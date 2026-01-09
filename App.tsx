import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, GameNode, Companion, GameStats, Coordinates, RewardTier, NodeType } from './types';
import { ARScene } from './components/ARScene';
import { GameUI } from './components/GameUI';
import { 
  SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX, DISCOVER_RADIUS, CAPTURE_RADIUS, 
  HOME_RADIUS, CAPTURE_TIME_MS, EVAC_DURATION_MS 
} from './constants';
import { getDistanceFromLatLonInMeters, gpsToLocalVector, generateRandomNode, movePoint } from './utils/geo';

const App: React.FC = () => {
  // --- STATE ---
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [currentPos, setCurrentPos] = useState<Coordinates | null>(null);
  const [startPos, setStartPos] = useState<Coordinates | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [nodes, setNodes] = useState<GameNode[]>([]);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [message, setMessage] = useState<string>('System Offline');
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [cameraRot, setCameraRot] = useState<{alpha: number, beta: number, gamma: number} | null>(null);
  
  // Debug State
  const [isDebugMode, setIsDebugMode] = useState(false);

  const [stats, setStats] = useState<GameStats>({
    startTime: 0,
    distanceWalked: 0,
    rewardsCollected: 0
  });

  // Refs for loop logic to avoid stale closures in effects
  const nodesRef = useRef<GameNode[]>([]);
  const gameStateRef = useRef<GameState>(GameState.IDLE);
  const captureTimerRef = useRef<number | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const lastPosRef = useRef<Coordinates | null>(null);
  const isDebugModeRef = useRef(false);
  
  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { isDebugModeRef.current = isDebugMode; }, [isDebugMode]);

  // --- INITIALIZATION ---
  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    const videoEl = document.getElementById('camera-feed') as HTMLVideoElement | null;
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }, []);

  const handleStart = async () => {
    try {
      // 1. Request Camera
      if (!window.isSecureContext) {
        alert('Camera access requires HTTPS.');
      } else if (!navigator.mediaDevices?.getUserMedia) {
        alert('Camera not supported in this browser.');
      } else {
        try {
          stopCameraStream();
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
          });
          cameraStreamRef.current = stream;

          const videoEl = document.getElementById('camera-feed') as HTMLVideoElement | null;
          if (!videoEl) {
            throw new Error('Camera video element not found');
          }
          videoEl.setAttribute('playsinline', 'true');
          videoEl.setAttribute('webkit-playsinline', 'true');
          videoEl.muted = true;
          videoEl.autoplay = true;
          videoEl.srcObject = stream;

          if (videoEl.readyState < 2) {
            await new Promise<void>((resolve) => {
              videoEl.onloadedmetadata = () => resolve();
            });
          }
          await videoEl.play().catch((err) => {
            console.warn('Video play failed', err);
          });
        } catch (err) {
          console.warn('Camera access failed', err);
          alert('Camera permission blocked or unavailable.');
        }
      }

      // 2. Request DeviceOrientation (iOS 13+)
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const response = await (DeviceOrientationEvent as any).requestPermission();
          if (response !== 'granted') {
             console.warn('Orientation permission denied');
          }
        } catch (e) {
          console.warn('Orientation request error', e);
        }
      }

      // 3. Start Geolocation Watch
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setStartPos(coords);
            setCurrentPos(coords);
            lastPosRef.current = coords;
            
            setStats(s => ({ ...s, startTime: Date.now() }));
            setGameState(GameState.OUTDOOR_SEARCH);
            setMessage("Scanning Sector...");
            
            // Initial Spawn
            spawnNodes(coords, 0); // Heading 0 initially
          },
          (err) => {
            alert('Location required. Enabling Debug Mode.');
            // Fallback for no GPS: Fake a start pos
            const fakeStart = { latitude: 0, longitude: 0 };
            setStartPos(fakeStart);
            setCurrentPos(fakeStart);
            setGameState(GameState.OUTDOOR_SEARCH);
            setIsDebugMode(true);
            spawnNodes(fakeStart, 0);
          },
          { enableHighAccuracy: true }
        );

        navigator.geolocation.watchPosition(
          (pos) => {
            // Ignore real GPS updates if in Debug/Sim mode to prevent jumping
            if (isDebugModeRef.current) return;

            const newCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            handleLocationUpdate(newCoords, pos.coords.heading || 0);
          },
          undefined,
          { enableHighAccuracy: true, maximumAge: 1000 }
        );
      } else {
        alert("Geolocation not supported");
      }

      // 4. Start Orientation Watch
      window.addEventListener('deviceorientation', handleOrientation);

    } catch (e) {
      console.error(e);
      alert('Initialization failed');
    }
  };

  const handleOrientation = (e: DeviceOrientationEvent) => {
    // If in Debug Mode, we rely on manual turning, so ignore sensor rotation for game heading logic
    // But we still might want camera rotation for the background if possible.
    // For this prototype, if debug mode is on, we'll let the user manually rotate the "Player Heading"
    // but the Camera background orientation is what it is.
    
    if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
      setCameraRot({ alpha: e.alpha, beta: e.beta, gamma: e.gamma });
      
      if (!isDebugModeRef.current) {
        // e.alpha is 0-360 deg.
        const compass = (e as any).webkitCompassHeading || (360 - e.alpha);
        setHeading(compass);
      }
    }
  };

  // --- GAME LOGIC ---

  const spawnNodes = (center: Coordinates, currentHeading: number) => {
    const newNodes: GameNode[] = [];
    // Spawn 3-5 nodes
    const count = 3 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < count; i++) {
      const geoPos = generateRandomNode(center, currentHeading, SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);
      const localPos = startPos ? gpsToLocalVector(startPos, geoPos) : [0,0,0] as [number, number, number];
      
      newNodes.push({
        id: `node_${Date.now()}_${i}`,
        type: i % 3 === 0 ? NodeType.JUNCTION : (i % 2 === 0 ? NodeType.EDGE : NodeType.OPEN_SPACE),
        tier: RewardTier.BASIC,
        geoPosition: geoPos,
        position: localPos,
        captured: false,
        discovered: false
      });
    }
    setNodes(prev => [...prev, ...newNodes]);
  };

  const handleLocationUpdate = (newPos: Coordinates, newHeading: number) => {
    if (!startPos) return;
    
    // Update Stats
    if (lastPosRef.current) {
      const delta = getDistanceFromLatLonInMeters(lastPosRef.current, newPos);
      if (delta > 0.5) { // Threshold for jitter
        setStats(s => ({ ...s, distanceWalked: s.distanceWalked + delta }));
        lastPosRef.current = newPos;
      }
    }
    setCurrentPos(newPos);
    
    // Logic: Discover Nodes & Evac Check
    const distToHome = getDistanceFromLatLonInMeters(newPos, startPos);
    
    // Check Evac
    if (distToHome < HOME_RADIUS && companions.length > 0 && gameStateRef.current !== GameState.EVAC_ANIM) {
       setGameState(GameState.EVAC_READY);
       setMessage("Base Proximity Detected");
    } else if (distToHome >= HOME_RADIUS && gameStateRef.current === GameState.EVAC_READY) {
       setGameState(GameState.OUTDOOR_SEARCH);
       setMessage("Exploration Active");
    }

    // Check Nodes
    setNodes(prevNodes => prevNodes.map(node => {
      if (node.captured) return node;
      
      const dist = getDistanceFromLatLonInMeters(newPos, node.geoPosition);
      
      // Discovery
      if (!node.discovered && dist < DISCOVER_RADIUS) {
         if (navigator.vibrate) navigator.vibrate(200);
         return { ...node, discovered: true };
      }
      
      return node;
    }));

    // If running low on nodes, spawn more
    const activeNodes = nodesRef.current.filter(n => !n.captured);
    if (activeNodes.length < 2) {
      spawnNodes(newPos, newHeading || heading);
    }
  };

  // --- SIMULATION LOGIC ---
  const handleSimulateMove = (meters: number) => {
    if (!currentPos) return;
    setIsDebugMode(true);
    // Move in direction of current heading
    const newPos = movePoint(currentPos, meters, heading);
    handleLocationUpdate(newPos, heading);
  };

  const handleSimulateTurn = (degrees: number) => {
    setIsDebugMode(true);
    setHeading(prev => (prev + degrees + 360) % 360);
  };

  // --- INTERACTION ---

  // Check if a node is in front and close enough
  useEffect(() => {
    if (!currentPos || gameState === GameState.CAPTURING || gameState === GameState.EVAC_ANIM) return;

    let closest: GameNode | null = null;
    let minDist = Infinity;

    nodes.forEach(node => {
      if (!node.discovered || node.captured) return;
      const dist = getDistanceFromLatLonInMeters(currentPos, node.geoPosition);
      if (dist < CAPTURE_RADIUS && dist < minDist) {
        minDist = dist;
        closest = node;
      }
    });

    if (closest) {
      if (gameState !== GameState.CAPTURE_READY) {
        setGameState(GameState.CAPTURE_READY);
        if (navigator.vibrate) navigator.vibrate(50);
      }
    } else {
      if (gameState === GameState.CAPTURE_READY) {
        setGameState(GameState.OUTDOOR_SEARCH);
      }
    }
  }, [currentPos, nodes, gameState]);


  const startCapture = () => {
    if (gameState !== GameState.CAPTURE_READY) return;
    
    // Find target
    const target = nodes.find(n => n.discovered && !n.captured && getDistanceFromLatLonInMeters(currentPos!, n.geoPosition) < CAPTURE_RADIUS);
    if (!target) return;

    setCapturingId(target.id);
    setGameState(GameState.CAPTURING);
    
    let startTime = Date.now();
    captureTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / CAPTURE_TIME_MS, 1);
      setCaptureProgress(progress);
      
      if (progress >= 1) {
        completeCapture(target);
      }
    }, 16);
  };

  const cancelCapture = () => {
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    setCapturingId(null);
    setCaptureProgress(0);
    setGameState(GameState.CAPTURE_READY);
  };

  const completeCapture = (node: GameNode) => {
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    
    // Update Node
    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, captured: true } : n));
    
    // Add Companion
    setCompanions(prev => [
      ...prev, 
      { id: `comp_${Date.now()}`, tier: node.tier, offset: [0,0,0] }
    ]);
    
    setStats(s => ({ ...s, rewardsCollected: s.rewardsCollected + 1 }));
    setCapturingId(null);
    setCaptureProgress(0);
    setGameState(GameState.OUTDOOR_SEARCH);
    setMessage("Entity Stabilized");
  };

  const handleEvacuate = () => {
    setGameState(GameState.EVAC_ANIM);
    setMessage("Evacuation Sequence Initiated");
    
    // Animation delay
    setTimeout(() => {
      setGameState(GameState.RESULT);
    }, EVAC_DURATION_MS);
  };

  const handleReset = () => {
    // Reset Logic
    setGameState(GameState.IDLE);
    setNodes([]);
    setCompanions([]);
    setStats({ startTime: 0, distanceWalked: 0, rewardsCollected: 0 });
    setStartPos(null);
    setCurrentPos(null);
    setIsDebugMode(false);
    stopCameraStream();
  };

  // Find nearby node for UI
  const activeNode = nodes.find(n => n.discovered && !n.captured && currentPos && getDistanceFromLatLonInMeters(currentPos, n.geoPosition) < CAPTURE_RADIUS) || null;
  const distToHome = (startPos && currentPos) ? getDistanceFromLatLonInMeters(currentPos, startPos) : 0;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 3D Layer */}
      {startPos && (gameState !== GameState.IDLE && gameState !== GameState.RESULT) && (
        <ARScene 
          nodes={nodes} 
          companions={companions} 
          gameState={gameState} 
          capturingId={capturingId}
          cameraRotation={cameraRot}
        />
      )}

      {/* UI Layer */}
      <div id="ui-layer">
        <GameUI 
          gameState={gameState}
          stats={stats}
          message={message}
          nearbyNode={activeNode}
          capturingProgress={captureProgress}
          onStart={handleStart}
          onCaptureStart={startCapture}
          onCaptureEnd={cancelCapture}
          onEvacuate={handleEvacuate}
          onReset={handleReset}
          distanceToHome={distToHome}
          companionsCount={companions.length}
          
          // Debug props
          isDebugMode={isDebugMode}
          onToggleDebug={() => setIsDebugMode(!isDebugMode)}
          onSimulateMove={handleSimulateMove}
          onSimulateTurn={handleSimulateTurn}
          currentHeading={heading}
        />
      </div>
    </div>
  );
};

export default App;
