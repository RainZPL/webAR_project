import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, GameNode, Companion, GameStats, Coordinates, RewardTier, NodeType, RewardRecord } from './types';
import { ARScene } from './components/ARScene';
import { GameUI } from './components/GameUI';
import { 
  SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX, DISCOVER_RADIUS, CAPTURE_RADIUS, 
  HOME_RADIUS, CAPTURE_TIME_BASIC_MS, CAPTURE_TIME_ADVANCED_MS, CAPTURE_TIME_CORE_MS,
  EVAC_DURATION_MS, RETICLE_ANGLE_DEG, OUTDOOR_ACCURACY_MAX, INDOOR_ACCURACY_MIN, INDOOR_HOLD_MS,
  COMPANION_DISTANCE_MIN, COMPANION_DISTANCE_MAX,
  USE_FAKE_AR, FAKE_SPAWN_RADIUS_MIN, FAKE_SPAWN_RADIUS_MAX, FAKE_SPAWN_STEP_METERS,
  FAKE_MOVE_SPEED_ACTIVE, FAKE_MOVE_SPEED_IDLE, FAKE_MOVE_TICK_MS
} from './constants';
import { getDistanceFromLatLonInMeters, gpsToLocalVector, generateRandomNode, movePoint, getBearing } from './utils/geo';

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
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsSpeed, setGpsSpeed] = useState<number | null>(null);
  const [isOutdoor, setIsOutdoor] = useState(false);
  const [isIndoor, setIsIndoor] = useState(false);
  const [manualOutdoor, setManualOutdoor] = useState(false);
  const [manualHome, setManualHome] = useState(false);
  const [rewardLog, setRewardLog] = useState<RewardRecord[]>([]);
  const [reticlePulseKey, setReticlePulseKey] = useState(0);
  const [evacStartTime, setEvacStartTime] = useState<number | null>(null);
  
  // Debug State
  const [isDebugMode, setIsDebugMode] = useState(false);

  const [stats, setStats] = useState<GameStats>({
    startTime: 0,
    distanceWalked: 0,
    rewardsCollected: 0,
    outdoorTimeMs: 0
  });

  // Refs for loop logic to avoid stale closures in effects
  const nodesRef = useRef<GameNode[]>([]);
  const gameStateRef = useRef<GameState>(GameState.IDLE);
  const captureTimerRef = useRef<number | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const lastPosRef = useRef<Coordinates | null>(null);
  const isDebugModeRef = useRef(false);
  const startPosRef = useRef<Coordinates | null>(null);
  const currentPosRef = useRef<Coordinates | null>(null);
  const statsRef = useRef<GameStats>(stats);
  const headingRef = useRef<number>(0);
  const headingAvailableRef = useRef(false);
  const companionsRef = useRef<Companion[]>([]);
  const manualOutdoorRef = useRef(false);
  const manualHomeRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const indoorStartRef = useRef<number | null>(null);
  const lastOutdoorTickRef = useRef<number | null>(null);
  const dismissEvacUntilRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fakeLoopRef = useRef<number | null>(null);
  const lastFakeTickRef = useRef<number | null>(null);
  const lastMotionRef = useRef<number>(Date.now());
  const lastOrientationRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  const lastSpawnPosRef = useRef<Coordinates | null>(null);
  const handleLocationUpdateRef = useRef<((pos: Coordinates, heading: number | null, accuracy?: number | null, speed?: number | null) => void) | null>(null);
  
  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { isDebugModeRef.current = isDebugMode; }, [isDebugMode]);
  useEffect(() => { startPosRef.current = startPos; }, [startPos]);
  useEffect(() => { currentPosRef.current = currentPos; }, [currentPos]);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { headingRef.current = heading; }, [heading]);
  useEffect(() => { companionsRef.current = companions; }, [companions]);
  useEffect(() => { manualOutdoorRef.current = manualOutdoor; }, [manualOutdoor]);
  useEffect(() => { manualHomeRef.current = manualHome; }, [manualHome]);

  // --- INITIALIZATION ---
  const ensureAudioContext = useCallback((): AudioContext | null => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtx();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => undefined);
    }
    return audioContextRef.current;
  }, []);

  const playCaptureSound = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 740;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  }, [ensureAudioContext]);

  const getCaptureDurationMs = useCallback((tier: RewardTier) => {
    switch (tier) {
      case RewardTier.ADVANCED:
        return CAPTURE_TIME_ADVANCED_MS;
      case RewardTier.CORE:
        return CAPTURE_TIME_CORE_MS;
      case RewardTier.BASIC:
      default:
        return CAPTURE_TIME_BASIC_MS;
    }
  }, []);

  const rollRewardTier = useCallback((): RewardTier => {
    const statsSnapshot = statsRef.current;
    const companionsCount = companionsRef.current.length;
    const durationMin = statsSnapshot.startTime
      ? (Date.now() - statsSnapshot.startTime) / 60000
      : 0;
    const distance = statsSnapshot.distanceWalked;

    let advancedWeight = 0.2;
    let coreWeight = 0.05;

    if (distance > 200) advancedWeight += 0.1;
    if (distance > 600) {
      advancedWeight += 0.1;
      coreWeight += 0.05;
    }
    if (durationMin > 5) advancedWeight += 0.1;
    if (durationMin > 10) coreWeight += 0.05;
    if (companionsCount >= 3) advancedWeight += 0.1;
    if (companionsCount >= 5) coreWeight += 0.05;

    advancedWeight = Math.min(advancedWeight, 0.6);
    coreWeight = Math.min(coreWeight, 0.3);
    const basicWeight = Math.max(0.1, 1 - advancedWeight - coreWeight);

    const roll = Math.random();
    if (roll < coreWeight) return RewardTier.CORE;
    if (roll < coreWeight + advancedWeight) return RewardTier.ADVANCED;
    if (roll < coreWeight + advancedWeight + basicWeight) return RewardTier.BASIC;
    return RewardTier.BASIC;
  }, []);

  const isTargetInReticle = useCallback((node: GameNode, pos: Coordinates): boolean => {
    if (!headingAvailableRef.current) return true;
    const bearing = getBearing(pos, node.geoPosition);
    const headingDeg = headingRef.current;
    const delta = Math.abs(((bearing - headingDeg + 540) % 360) - 180);
    return delta <= RETICLE_ANGLE_DEG;
  }, []);
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

  const stopFakeMovement = useCallback(() => {
    if (fakeLoopRef.current !== null) {
      clearInterval(fakeLoopRef.current);
      fakeLoopRef.current = null;
    }
    lastFakeTickRef.current = null;
  }, []);

  const startFakeMovement = useCallback(() => {
    stopFakeMovement();
    lastFakeTickRef.current = Date.now();
    fakeLoopRef.current = window.setInterval(() => {
      const now = Date.now();
      const lastTick = lastFakeTickRef.current ?? now;
      const dt = Math.max(0, now - lastTick) / 1000;
      lastFakeTickRef.current = now;

      const lastMove = lastMotionRef.current || now;
      const active = now - lastMove < 1500;
      const speed = active ? FAKE_MOVE_SPEED_ACTIVE : FAKE_MOVE_SPEED_IDLE;

      const current = currentPosRef.current;
      if (!current) return;

      const distance = speed * dt;
      if (distance <= 0.01) return;

      const headingDeg = headingRef.current || 0;
      const nextPos = movePoint(current, distance, headingDeg);
      if (handleLocationUpdateRef.current) {
        handleLocationUpdateRef.current(nextPos, headingDeg, 12 + Math.random() * 6, speed);
      }
    }, FAKE_MOVE_TICK_MS);
  }, [stopFakeMovement]);

  const handleStart = async () => {
    try {
      ensureAudioContext();
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

      // 3. Start Orientation Watch
      window.addEventListener('deviceorientation', handleOrientation);

      if (USE_FAKE_AR) {
        const fakeStart = { latitude: 0, longitude: 0 };
        startPosRef.current = fakeStart;
        currentPosRef.current = fakeStart;
        lastPosRef.current = fakeStart;
        lastSpawnPosRef.current = fakeStart;
        setStartPos(fakeStart);
        setCurrentPos(fakeStart);
        setGpsAccuracy(12);
        setGpsSpeed(0.5);
        const newStats = { startTime: Date.now(), distanceWalked: 0, rewardsCollected: 0, outdoorTimeMs: 0 };
        statsRef.current = newStats;
        setStats(newStats);
        setGameState(GameState.OUTDOOR_SEARCH);
        setMessage("Scanning Sector...");
        spawnNodes(fakeStart, headingRef.current || 0);
        startFakeMovement();
        return;
      }

      // 4. Start Geolocation Watch
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            startPosRef.current = coords;
            currentPosRef.current = coords;
            setStartPos(coords);
            setCurrentPos(coords);
            lastPosRef.current = coords;
            lastSpawnPosRef.current = coords;
            
            const newStats = { startTime: Date.now(), distanceWalked: 0, rewardsCollected: 0, outdoorTimeMs: 0 };
            statsRef.current = newStats;
            setStats(newStats);
            setGameState(GameState.OUTDOOR_SEARCH);
            setMessage("Scanning Sector...");
            
            // Initial Spawn
            spawnNodes(coords, 0); // Heading 0 initially
          },
          (err) => {
            alert('Location required. Enabling Debug Mode.');
            // Fallback for no GPS: Fake a start pos
            const fakeStart = { latitude: 0, longitude: 0 };
            startPosRef.current = fakeStart;
            currentPosRef.current = fakeStart;
            setStartPos(fakeStart);
            setCurrentPos(fakeStart);
            lastPosRef.current = fakeStart;
            lastSpawnPosRef.current = fakeStart;
            const newStats = { startTime: Date.now(), distanceWalked: 0, rewardsCollected: 0, outdoorTimeMs: 0 };
            statsRef.current = newStats;
            setStats(newStats);
            setGameState(GameState.OUTDOOR_SEARCH);
            setIsDebugMode(true);
            spawnNodes(fakeStart, 0);
          },
          { enableHighAccuracy: true }
        );

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            // Ignore real GPS updates if in Debug/Sim mode to prevent jumping
            if (isDebugModeRef.current) return;

            const newCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            handleLocationUpdate(
              newCoords,
              Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
              pos.coords.accuracy,
              pos.coords.speed
            );
          },
          (err) => {
            console.warn('Geolocation watch error', err);
          },
          { enableHighAccuracy: true, maximumAge: 1000 }
        );
      } else {
        alert("Geolocation not supported");
      }

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
      const last = lastOrientationRef.current;
      if (last) {
        const delta =
          Math.abs(e.alpha - last.alpha) +
          Math.abs(e.beta - last.beta) +
          Math.abs(e.gamma - last.gamma);
        if (delta > 6) {
          lastMotionRef.current = Date.now();
        }
      } else {
        lastMotionRef.current = Date.now();
      }
      lastOrientationRef.current = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };

      setCameraRot({ alpha: e.alpha, beta: e.beta, gamma: e.gamma });
      
      if (!isDebugModeRef.current) {
        // e.alpha is 0-360 deg.
        const webkitHeading = (e as any).webkitCompassHeading;
        const compass = Number.isFinite(webkitHeading) ? webkitHeading : (360 - e.alpha);
        headingAvailableRef.current = true;
        headingRef.current = compass;
        setHeading(compass);
      }
    }
  };

  // --- GAME LOGIC ---

  const spawnNodes = (center: Coordinates, currentHeading: number) => {
    const newNodes: GameNode[] = [];
    // Spawn 3-5 nodes
    const count = 3 + Math.floor(Math.random() * 4);
    const minDist = USE_FAKE_AR ? FAKE_SPAWN_RADIUS_MIN : SPAWN_RADIUS_MIN;
    const maxDist = USE_FAKE_AR ? FAKE_SPAWN_RADIUS_MAX : SPAWN_RADIUS_MAX;
    
    for (let i = 0; i < count; i++) {
      const geoPos = generateRandomNode(center, currentHeading, minDist, maxDist);
      const localPos = gpsToLocalVector(center, geoPos);
      const typeRoll = Math.random();
      const nodeType =
        typeRoll < 0.33 ? NodeType.JUNCTION : typeRoll < 0.66 ? NodeType.OPEN_SPACE : NodeType.EDGE;
      
      newNodes.push({
        id: `node_${Date.now()}_${i}`,
        type: nodeType,
        tier: rollRewardTier(),
        geoPosition: geoPos,
        position: [localPos[0], 0, localPos[2]],
        captured: false,
        discovered: false
      });
    }
    setNodes(prev => [...prev, ...newNodes]);
  };

  const handleLocationUpdate = useCallback((
    newPos: Coordinates,
    geoHeading: number | null,
    accuracy?: number | null,
    speed?: number | null
  ) => {
    const start = startPosRef.current;
    if (!start) return;

    const now = Date.now();
    const hasGeoHeading = Number.isFinite(geoHeading);
    if (!isDebugModeRef.current && hasGeoHeading) {
      headingAvailableRef.current = true;
      headingRef.current = geoHeading as number;
      setHeading(geoHeading as number);
    }

    const accuracyRaw = typeof accuracy === 'number' ? accuracy : null;
    const speedRaw = typeof speed === 'number' ? speed : null;
    const accuracyValue = USE_FAKE_AR && accuracyRaw === null ? 12 : accuracyRaw;
    const speedValue = USE_FAKE_AR && speedRaw === null ? 0.5 : speedRaw;
    setGpsAccuracy(accuracyValue);
    setGpsSpeed(speedValue);

    const hasHeading = headingAvailableRef.current || hasGeoHeading;
    const outdoorDetected =
      accuracyValue !== null &&
      accuracyValue <= OUTDOOR_ACCURACY_MAX &&
      (hasHeading || (speedValue !== null && speedValue > 0.3));

    const outdoorActive = manualHomeRef.current
      ? false
      : manualOutdoorRef.current
      ? true
      : outdoorDetected;
    setIsOutdoor(outdoorActive);

    let outdoorDeltaMs = 0;
    if (outdoorActive) {
      const lastTick = lastOutdoorTickRef.current ?? now;
      outdoorDeltaMs = Math.max(0, now - lastTick);
      lastOutdoorTickRef.current = now;
    } else {
      lastOutdoorTickRef.current = null;
    }

    let distanceDelta = 0;
    if (lastPosRef.current) {
      const delta = getDistanceFromLatLonInMeters(lastPosRef.current, newPos);
      if (delta > 0.5) { // Threshold for jitter
        distanceDelta = delta;
        lastPosRef.current = newPos;
      }
    } else {
      lastPosRef.current = newPos;
    }

    if (distanceDelta > 0 || outdoorDeltaMs > 0) {
      setStats(s => ({
        ...s,
        distanceWalked: s.distanceWalked + distanceDelta,
        outdoorTimeMs: s.outdoorTimeMs + outdoorDeltaMs
      }));
    }

    setCurrentPos(newPos);
    currentPosRef.current = newPos;

    const distToHome = getDistanceFromLatLonInMeters(newPos, start);
    const indoorCandidate =
      distToHome < HOME_RADIUS &&
      accuracyValue !== null &&
      accuracyValue >= INDOOR_ACCURACY_MIN;

    if (!manualHomeRef.current && indoorCandidate) {
      if (!indoorStartRef.current) indoorStartRef.current = now;
    } else if (!indoorCandidate) {
      indoorStartRef.current = null;
    }

    const indoorDetected =
      manualHomeRef.current ||
      (indoorStartRef.current !== null && now - indoorStartRef.current >= INDOOR_HOLD_MS);
    setIsIndoor(indoorDetected);

    if (
      distToHome < HOME_RADIUS &&
      companionsRef.current.length > 0 &&
      indoorDetected &&
      gameStateRef.current !== GameState.EVAC_ANIM &&
      now > dismissEvacUntilRef.current
    ) {
      setGameState(GameState.EVAC_READY);
      setMessage("Base Proximity Detected");
    } else if (
      (distToHome >= HOME_RADIUS || !indoorDetected) &&
      gameStateRef.current === GameState.EVAC_READY
    ) {
      setGameState(GameState.OUTDOOR_SEARCH);
      setMessage("Exploration Active");
    }

    setNodes(prevNodes => prevNodes.map(node => {
      const localPos = gpsToLocalVector(newPos, node.geoPosition);
      const dist = getDistanceFromLatLonInMeters(newPos, node.geoPosition);
      const discovered = node.discovered || dist < DISCOVER_RADIUS;

      if (!node.discovered && dist < DISCOVER_RADIUS) {
        if (navigator.vibrate) navigator.vibrate(200);
      }

      return {
        ...node,
        discovered,
        position: [localPos[0], node.position[1], localPos[2]]
      };
    }));

    const activeNodes = nodesRef.current.filter(n => !n.captured);
    const headingForSpawn = hasGeoHeading ? (geoHeading as number) : headingRef.current;
    const minActiveNodes = USE_FAKE_AR ? 4 : 2;

    if (!lastSpawnPosRef.current) {
      lastSpawnPosRef.current = newPos;
    }

    const distSinceSpawn = lastSpawnPosRef.current
      ? getDistanceFromLatLonInMeters(lastSpawnPosRef.current, newPos)
      : 0;
    const spawnStep = USE_FAKE_AR ? FAKE_SPAWN_STEP_METERS : SPAWN_RADIUS_MIN;

    if (activeNodes.length < minActiveNodes || distSinceSpawn >= spawnStep) {
      spawnNodes(newPos, headingForSpawn);
      lastSpawnPosRef.current = newPos;
    }
  }, []);

  useEffect(() => {
    handleLocationUpdateRef.current = handleLocationUpdate;
  }, [handleLocationUpdate]);

  // --- SIMULATION LOGIC ---
  const handleSimulateMove = (meters: number) => {
    if (!currentPos) return;
    setIsDebugMode(true);
    // Move in direction of current heading
    const newPos = movePoint(currentPos, meters, heading);
    handleLocationUpdate(newPos, heading, null, 0);
  };

  const handleSimulateTurn = (degrees: number) => {
    setIsDebugMode(true);
    setHeading(prev => {
      const next = (prev + degrees + 360) % 360;
      headingAvailableRef.current = true;
      return next;
    });
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
      if (dist < CAPTURE_RADIUS && isTargetInReticle(node, currentPos) && dist < minDist) {
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
  }, [currentPos, nodes, gameState, isTargetInReticle]);


  const startCapture = () => {
    if (gameState !== GameState.CAPTURE_READY || !currentPos) return;
    
    // Find target
    const target = nodes.find(n =>
      n.discovered &&
      !n.captured &&
      getDistanceFromLatLonInMeters(currentPos, n.geoPosition) < CAPTURE_RADIUS &&
      isTargetInReticle(n, currentPos)
    );
    if (!target) return;

    setCapturingId(target.id);
    setGameState(GameState.CAPTURING);
    
    let startTime = Date.now();
    const captureDuration = getCaptureDurationMs(target.tier);
    captureTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / captureDuration, 1);
      setCaptureProgress(progress);
      
      if (progress >= 1) {
        completeCapture(target);
      }
    }, 16);
  };

  const cancelCapture = () => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    setCapturingId(null);
    setCaptureProgress(0);
    setGameState(GameState.CAPTURE_READY);
  };

  const completeCapture = (node: GameNode) => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playCaptureSound();
    
    // Update Node
    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, captured: true } : n));
    
    // Add Companion
    const angle = (Math.random() - 0.5) * Math.PI * 1.2;
    const radius = COMPANION_DISTANCE_MIN + Math.random() * (COMPANION_DISTANCE_MAX - COMPANION_DISTANCE_MIN);
    const offset: [number, number, number] = [Math.sin(angle) * radius, 0, -Math.cos(angle) * radius];
    setCompanions(prev => [
      ...prev, 
      { id: `comp_${Date.now()}`, tier: node.tier, offset }
    ]);
    setRewardLog(prev => [...prev, { id: node.id, tier: node.tier, type: node.type }]);
    
    setStats(s => ({ ...s, rewardsCollected: s.rewardsCollected + 1 }));
    setCapturingId(null);
    setCaptureProgress(0);
    setGameState(GameState.CARRYING);
    setMessage("Entity Stabilized");
    setReticlePulseKey(prev => prev + 1);

    setTimeout(() => {
      if (gameStateRef.current === GameState.CARRYING) {
        setGameState(GameState.OUTDOOR_SEARCH);
      }
    }, 400);
  };

  const handleEvacuate = () => {
    setGameState(GameState.EVAC_ANIM);
    setMessage("Evacuation Sequence Initiated");
    setReticlePulseKey(prev => prev + 1);
    setEvacStartTime(Date.now());
    
    // Animation delay
    setTimeout(() => {
      setGameState(GameState.RESULT);
    }, EVAC_DURATION_MS);
  };

  const handleToggleOutdoorOverride = () => {
    setManualOutdoor(prev => {
      const next = !prev;
      if (next) {
        setManualHome(false);
        setIsOutdoor(true);
      }
      return next;
    });
  };

  const handleToggleHomeOverride = () => {
    setManualHome(prev => {
      const next = !prev;
      if (next) setManualOutdoor(false);
      if (next) {
        const current = currentPosRef.current;
        const start = startPosRef.current;
        if (current && start && getDistanceFromLatLonInMeters(current, start) < HOME_RADIUS && companionsRef.current.length > 0) {
          setIsIndoor(true);
          setGameState(GameState.EVAC_READY);
          setMessage("Base Proximity Detected");
        }
      } else {
        setIsIndoor(false);
      }
      return next;
    });
  };

  const handleContinueExploring = () => {
    dismissEvacUntilRef.current = Date.now() + 60000;
    setManualHome(false);
    setGameState(GameState.OUTDOOR_SEARCH);
    setMessage("Exploration Active");
  };

  const handleReset = () => {
    // Reset Logic
    setGameState(GameState.IDLE);
    setNodes([]);
    setCompanions([]);
    setRewardLog([]);
    const resetStats = { startTime: 0, distanceWalked: 0, rewardsCollected: 0, outdoorTimeMs: 0 };
    statsRef.current = resetStats;
    setStats(resetStats);
    setStartPos(null);
    setCurrentPos(null);
    startPosRef.current = null;
    currentPosRef.current = null;
    setIsDebugMode(false);
    setIsOutdoor(false);
    setIsIndoor(false);
    setManualOutdoor(false);
    setManualHome(false);
    setGpsAccuracy(null);
    setGpsSpeed(null);
    setCapturingId(null);
    setCaptureProgress(0);
    setReticlePulseKey(0);
    setEvacStartTime(null);
    setHeading(0);
    setMessage('System Offline');
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    lastPosRef.current = null;
    lastSpawnPosRef.current = null;
    lastOrientationRef.current = null;
    lastMotionRef.current = Date.now();
    indoorStartRef.current = null;
    lastOutdoorTickRef.current = null;
    headingAvailableRef.current = false;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    stopFakeMovement();
    stopCameraStream();
  };

  // Find nearby node for UI
  const activeNode = nodes.find(n =>
    n.discovered &&
    !n.captured &&
    currentPos &&
    getDistanceFromLatLonInMeters(currentPos, n.geoPosition) < CAPTURE_RADIUS &&
    isTargetInReticle(n, currentPos)
  ) || null;
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
          pulseKey={reticlePulseKey}
          evacStartTime={evacStartTime}
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
          onContinueExploring={handleContinueExploring}
          onReset={handleReset}
          distanceToHome={distToHome}
          companionsCount={companions.length}
          gpsAccuracy={gpsAccuracy}
          isOutdoor={isOutdoor}
          isIndoor={isIndoor}
          manualOutdoor={manualOutdoor}
          manualHome={manualHome}
          onToggleOutdoorOverride={handleToggleOutdoorOverride}
          onToggleHomeOverride={handleToggleHomeOverride}
          rewardLog={rewardLog}
          reticlePulseKey={reticlePulseKey}
          
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
