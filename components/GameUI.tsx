import React, { useEffect, useState } from 'react';
import { GameState, GameStats, GameNode, RewardRecord } from '../types';
import { Radar, Home, Navigation, Focus, Hexagon, Zap, Bug, ArrowUp, RotateCcw, RotateCw } from 'lucide-react';

interface GameUIProps {
  gameState: GameState;
  stats: GameStats;
  message: string;
  nearbyNode: GameNode | null;
  capturingProgress: number;
  onStart: () => void;
  onCaptureStart: () => void;
  onCaptureEnd: () => void;
  onEvacuate: () => void;
  onContinueExploring: () => void;
  onReset: () => void;
  distanceToHome: number;
  companionsCount: number;
  gpsAccuracy: number | null;
  isOutdoor: boolean;
  isIndoor: boolean;
  manualOutdoor: boolean;
  manualHome: boolean;
  onToggleOutdoorOverride: () => void;
  onToggleHomeOverride: () => void;
  rewardLog: RewardRecord[];
  reticlePulseKey: number;
  
  // Debug
  isDebugMode: boolean;
  onToggleDebug: () => void;
  onSimulateMove: (meters: number) => void;
  onSimulateTurn: (deg: number) => void;
  currentHeading: number;
}

export const GameUI: React.FC<GameUIProps> = ({
  gameState,
  stats,
  message,
  nearbyNode,
  capturingProgress,
  onStart,
  onCaptureStart,
  onCaptureEnd,
  onEvacuate,
  onContinueExploring,
  onReset,
  distanceToHome,
  companionsCount,
  gpsAccuracy,
  isOutdoor,
  isIndoor,
  manualOutdoor,
  manualHome,
  onToggleOutdoorOverride,
  onToggleHomeOverride,
  rewardLog,
  reticlePulseKey,
  isDebugMode,
  onToggleDebug,
  onSimulateMove,
  onSimulateTurn,
  currentHeading
}) => {
  const [reticlePulse, setReticlePulse] = useState(false);

  useEffect(() => {
    if (!reticlePulseKey) return;
    setReticlePulse(true);
    const timer = window.setTimeout(() => setReticlePulse(false), 300);
    return () => window.clearTimeout(timer);
  }, [reticlePulseKey]);
  // 1. IDLE / START SCREEN
  if (gameState === GameState.IDLE) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-slate-900/90 text-center p-6 space-y-8">
        <div className="relative">
          <div className="absolute inset-0 bg-orange-500 blur-2xl opacity-20 animate-pulse"></div>
          <Hexagon size={64} className="text-orange-400 relative z-10" />
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tighter text-white mb-2">NORTH STAR</h1>
          <p className="text-slate-400 max-w-xs mx-auto text-sm">
            1. Initialize Sensors<br/>
            2. Walk outdoors to find energy signatures (Orbs)<br/>
            3. Capture Orbs & Return Home
          </p>
        </div>
        <button
          onClick={onStart}
          className="px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-full transition-all active:scale-95 shadow-[0_0_20px_rgba(234,88,12,0.5)]"
        >
          INITIALIZE SENSORS
        </button>
        <p className="text-xs text-slate-500 mt-4 max-w-xs">
          Physical movement required. Enable "Debug Mode" inside to simulate movement if testing indoors.
        </p>
      </div>
    );
  }

  // 2. RESULT SCREEN
  if (gameState === GameState.RESULT) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-slate-900/95 text-center p-6 space-y-6">
        <h2 className="text-3xl font-bold text-white">MISSION COMPLETE</h2>
        <div className="w-full max-w-sm bg-slate-800/50 p-6 rounded-lg border border-slate-700">
          <div className="flex justify-between mb-4">
            <span className="text-slate-400">Duration</span>
            <span className="font-mono text-orange-300">{((Date.now() - stats.startTime) / 1000 / 60).toFixed(1)} min</span>
          </div>
          <div className="flex justify-between mb-4">
            <span className="text-slate-400">Outdoor Time</span>
            <span className="font-mono text-orange-300">{(stats.outdoorTimeMs / 1000 / 60).toFixed(1)} min</span>
          </div>
          <div className="flex justify-between mb-4">
            <span className="text-slate-400">Distance</span>
            <span className="font-mono text-orange-300">{stats.distanceWalked.toFixed(0)} m</span>
          </div>
          <div className="flex justify-between border-t border-slate-700 pt-4">
            <span className="text-slate-200">Companions Saved</span>
            <span className="font-bold text-2xl text-orange-400">{stats.rewardsCollected}</span>
          </div>

          {rewardLog.length > 0 && (
            <div className="mt-4 border-t border-slate-700 pt-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest">Recovered</div>
              <div className="mt-2 max-h-24 overflow-y-auto space-y-1 text-xs text-slate-300">
                {rewardLog.map((reward, index) => (
                  <div key={`${reward.id}_${index}`} className="flex justify-between">
                    <span>{reward.type}</span>
                    <span className="text-orange-300">{reward.tier}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onReset}
          className="px-8 py-3 border border-orange-500 text-orange-400 rounded-full hover:bg-orange-500/10"
        >
          NEW RUN
        </button>
      </div>
    );
  }

  // 3. MAIN HUD (SEARCH, CAPTURE, EVAC)
  return (
    <div className="flex flex-col justify-between h-full w-full p-4 pointer-events-none">
      {/* Top Bar */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="flex flex-col bg-slate-900/60 backdrop-blur p-2 rounded-lg border border-slate-700/50">
          <span className="text-xs text-slate-400 uppercase tracking-widest">Signal</span>
          <div className="flex items-center space-x-2">
            <Navigation size={16} className="text-orange-400 animate-pulse" />
            <span className="font-mono text-sm">{message}</span>
          </div>
          <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1">
            <span>GPS {gpsAccuracy !== null ? `${Math.round(gpsAccuracy)}m` : '--'}</span>
            <span className={isOutdoor ? 'text-emerald-400' : 'text-amber-400'}>
              {isOutdoor ? 'OUTDOOR' : 'WEAK'}
            </span>
            {isIndoor && <span className="text-emerald-300">INDOOR</span>}
            {(manualOutdoor || manualHome) && <span className="text-cyan-300">MANUAL</span>}
          </div>
        </div>
        
        <div className="flex flex-col items-end space-y-2">
          <div className="bg-slate-900/60 backdrop-blur px-3 py-1 rounded-full border border-orange-500/30">
             <span className="text-orange-400 font-bold">{companionsCount}</span> <span className="text-xs text-slate-400">ORBS</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onToggleOutdoorOverride}
              className={`px-2 py-1 text-[10px] rounded border ${
                manualOutdoor
                  ? 'bg-emerald-600/80 border-emerald-400 text-white'
                  : 'bg-slate-900/60 border-slate-700 text-slate-400'
              }`}
            >
              OUTSIDE
            </button>
            <button
              onClick={onToggleHomeOverride}
              className={`px-2 py-1 text-[10px] rounded border ${
                manualHome
                  ? 'bg-cyan-600/80 border-cyan-400 text-white'
                  : 'bg-slate-900/60 border-slate-700 text-slate-400'
              }`}
            >
              I'M HOME
            </button>
          </div>
          
          <button 
             onClick={onToggleDebug}
             className={`p-2 rounded-full border pointer-events-auto ${isDebugMode ? 'bg-orange-900/80 border-orange-500 text-white' : 'bg-slate-900/50 border-slate-700 text-slate-500'}`}
          >
             <Bug size={16} />
          </button>
        </div>
      </div>

      {/* DEBUG CONTROLS (Only visible if Debug Mode is ON) */}
      {isDebugMode && (
        <div className="absolute top-24 left-4 flex flex-col space-y-2 pointer-events-auto bg-slate-900/80 p-2 rounded border border-slate-700">
           <div className="text-[10px] text-slate-400 font-mono">SIMULATION CONTROLS</div>
           <div className="flex space-x-2">
              <button onClick={() => onSimulateTurn(-45)} className="p-2 bg-slate-700 rounded text-white active:bg-slate-600"><RotateCcw size={16}/></button>
              <button onClick={() => onSimulateMove(10)} className="p-2 bg-orange-700 rounded text-white active:bg-orange-600 font-bold flex items-center"><ArrowUp size={16}/> 10m</button>
              <button onClick={() => onSimulateTurn(45)} className="p-2 bg-slate-700 rounded text-white active:bg-slate-600"><RotateCw size={16}/></button>
           </div>
           <div className="text-[10px] text-orange-400 font-mono text-center">HDG: {currentHeading.toFixed(0)}°</div>
        </div>
      )}

      {/* Center Reticle */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
        {/* Static Ring */}
        <div className={`w-64 h-64 border border-slate-400/30 rounded-full transition-all duration-300 ${nearbyNode ? 'scale-100 opacity-100' : 'scale-90 opacity-20'}`}></div>
        
        {/* Active Reticle */}
        <div className={`absolute w-16 h-16 border-2 rounded-full transition-all duration-200 flex items-center justify-center
          ${gameState === GameState.CAPTURE_READY ? 'border-orange-400 bg-orange-400/10 scale-125' : 'border-slate-500/50'}
          ${gameState === GameState.CAPTURING ? 'border-orange-500 scale-90' : ''}
        `}>
          {reticlePulse && (
            <div className="absolute inset-0 rounded-full border-2 border-orange-300 animate-ping"></div>
          )}
          <Focus size={24} className={gameState === GameState.CAPTURE_READY ? 'text-orange-400' : 'text-slate-500'} />
        </div>

        {/* Capture Progress Ring */}
        {gameState === GameState.CAPTURING && (
           <svg className="absolute w-32 h-32 transform -rotate-90">
             <circle
               cx="64" cy="64" r="60"
               stroke="currentColor" strokeWidth="4"
               fill="transparent"
               className="text-orange-500"
               strokeDasharray={377}
               strokeDashoffset={377 - (377 * capturingProgress)}
               strokeLinecap="round"
             />
           </svg>
        )}
      </div>

      {/* Bottom Action Area */}
      <div className="flex flex-col items-center justify-end space-y-4 pointer-events-auto pb-8">
        {/* Emergency Evac Button */}
        {gameState !== GameState.EVAC_READY && gameState !== GameState.EVAC_ANIM && (
            <button 
              onClick={onEvacuate}
              className="absolute bottom-8 right-4 bg-red-900/80 text-red-200 text-xs px-3 py-2 rounded border border-red-500/30 pointer-events-auto active:scale-95"
            >
              EMERGENCY EVAC
            </button>
        )}

        {gameState === GameState.EVAC_READY ? (
          <div className="animate-bounce flex flex-col items-center">
            <button
              onClick={onEvacuate}
              className="px-8 py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20"
            >
              CONFIRM EVACUATION
            </button>
            <p className="text-center text-xs text-emerald-300 mt-2 bg-black/50 p-1 rounded">You are safely home</p>
            <button
              onClick={onContinueExploring}
              className="mt-3 text-[10px] text-slate-300 uppercase tracking-widest"
            >
              Continue Exploring
            </button>
          </div>
        ) : nearbyNode && (gameState === GameState.CAPTURE_READY || gameState === GameState.CAPTURING) ? (
          <div className="flex flex-col items-center space-y-2">
            <div className="text-orange-300 text-sm font-bold uppercase tracking-widest drop-shadow-md">
              {nearbyNode.type} DETECTED
            </div>
            <button
              onMouseDown={onCaptureStart}
              onMouseUp={onCaptureEnd}
              onTouchStart={(e) => { e.preventDefault(); onCaptureStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); onCaptureEnd(); }}
              className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-200
                ${gameState === GameState.CAPTURING ? 'bg-orange-500 border-white scale-110' : 'bg-slate-900/80 border-orange-500 hover:scale-105'}
              `}
            >
              <Zap size={32} className="text-white" fill={gameState === GameState.CAPTURING ? "white" : "none"} />
            </button>
            <span className="text-xs text-slate-400">HOLD TO CAPTURE</span>
          </div>
        ) : (
          <div className="text-center space-y-1 opacity-70">
             <Radar className="mx-auto text-slate-500 animate-spin-slow" />
             <p className="text-xs text-slate-400">Scanning for energy signatures...</p>
             <p className="text-[10px] text-slate-600 font-mono">DIST TO HOME: {distanceToHome.toFixed(0)}m</p>
          </div>
        )}
      </div>
    </div>
  );
};
