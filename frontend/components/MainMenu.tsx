"use client";

import React, { useState } from "react";

export type ActiveView =
  | "MAIN_MENU"
  | "ARENA"
  | "CIRCUIT_SELECT"
  | "SETTINGS"
  | "CAMERA_TEST"
  | "TELEMETRY"
  | "COMPARISON"
  | "ACHIEVEMENTS";

interface MainMenuProps {
  streak: number;
  unlockedAchievementsCount: number;
  totalAchievementsCount?: number;
  bioCredits: number;
  energyCores: number;
  callsign: string;
  rankTitle?: string;
  activeExerciseName?: string;
  onOpenExerciseSelector?: () => void;
  onNavigate: (view: ActiveView) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  streak,
  unlockedAchievementsCount,
  totalAchievementsCount = 10,
  bioCredits,
  energyCores,
  callsign,
  rankTitle = "Kinetic Stalker",
  activeExerciseName = "Therapeutic Squat",
  onOpenExerciseSelector,
  onNavigate,
}) => {
  const [isExploding, setIsExploding] = useState(false);

  // Synthesize a thunderous cosmic explosion sound via Web Audio API
  const playExplosionSound = () => {
    try {
      if (typeof window === "undefined") return;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      // White noise buffer for explosion rumble
      const bufferSize = Math.floor(ctx.sampleRate * 1.0);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Lowpass filter for deep muffled explosion roar
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(700, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 1.0);

      // Sub-bass punch oscillator for kinetic shockwave
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.85);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.8, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.85);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.7, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);

      osc.connect(oscGain).connect(ctx.destination);
      noise.connect(filter).connect(noiseGain).connect(ctx.destination);

      osc.start();
      noise.start();
      osc.stop(ctx.currentTime + 0.9);
      noise.stop(ctx.currentTime + 1.05);
    } catch (e) {
      // AudioContext fallback
    }
  };

  const handleRocketLaunch = () => {
    if (isExploding) return;
    setIsExploding(true);
    playExplosionSound();
    setTimeout(() => {
      onNavigate("ARENA");
    }, 1100);
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#050811] text-white flex flex-col items-center justify-between p-4 sm:p-8 font-mono select-none overflow-y-auto">
      {/* High-Definition Cosmic Starfield Background - Completely Unblurred & Prominent */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <img
          src="/main-menu-bg.jpg"
          alt="Galaxy Main Menu Background"
          className="w-full h-full object-cover object-center"
        />
      </div>

      {/* Top Bar: Callsign, Pilot Rank & Resource Indicators */}
      <header className="relative z-10 w-full max-w-6xl flex flex-wrap items-center justify-between gap-3 p-3 sm:px-6 sm:py-3.5 rounded-2xl bg-slate-950/85 border border-slate-800/80 shadow-2xl">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-lg sm:text-xl shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            🛡️
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate max-w-[140px] sm:max-w-none">
              OPERATIVE // {callsign}
            </span>
            <span className="text-xs sm:text-sm font-black text-cyan-300 uppercase tracking-wider sm:tracking-widest">
              {rankTitle}
            </span>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-amber-950/60 border border-amber-500/50 text-[10px] sm:text-xs font-black text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
            <span>🔥</span>
            <span>DAY {streak > 0 ? streak : 1} STREAK</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-cyan-950/60 border border-cyan-500/50 text-[10px] sm:text-xs font-black text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
            <span>💎</span>
            <span>{bioCredits} CREDITS</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-purple-950/60 border border-purple-500/50 text-[10px] sm:text-xs font-black text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)]">
            <span>⚡</span>
            <span>{energyCores} CORES</span>
          </div>
        </div>
      </header>

      {/* Center Hero: Title & Mission Briefing */}
      <div className="relative z-10 w-full max-w-4xl text-center my-4 sm:my-6 md:my-8 flex flex-col items-center px-2">
        <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-[9px] sm:text-xs font-mono font-black text-cyan-300 tracking-[0.15em] sm:tracking-[0.25em] uppercase mb-2 sm:mb-3 shadow-[0_0_20px_rgba(0,240,255,0.25)]">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>KINETIC AEGIS ENGINE // 3D VECTOR BIOMECHANICS</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black uppercase tracking-wider font-mono text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 drop-shadow-[0_4px_30px_rgba(0,240,255,0.3)]">
          ATHLETE<span className="text-cyan-400">MIND</span>
        </h1>
        <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-sm md:text-base font-mono text-slate-300 tracking-wider sm:tracking-widest uppercase max-w-2xl px-2">
          Clinical Physical Therapy & Gamified Deflection Gauntlet
        </p>

        {/* Active Prescribed Exercise Pill */}
        {onOpenExerciseSelector && (
          <button
            onClick={onOpenExerciseSelector}
            className="mt-3 sm:mt-4 px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl bg-cyan-950/80 hover:bg-cyan-900/90 border border-cyan-500/60 hover:border-cyan-400 flex items-center gap-2.5 sm:gap-3 transition-all cursor-pointer shadow-[0_0_25px_rgba(0,240,255,0.25)] group"
            title="Open 10-Exercise Clinical Rehabilitation Suite"
          >
            <span className="text-lg sm:text-xl">🎯</span>
            <div className="flex flex-col text-left">
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono uppercase tracking-widest">
                PRESCRIBED PROTOCOL
              </span>
              <span className="text-xs sm:text-sm font-black text-cyan-300 group-hover:text-white uppercase tracking-wider font-mono">
                {activeExerciseName}
              </span>
            </div>
            <span className="text-[10px] sm:text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40 ml-1.5 sm:ml-2 group-hover:bg-cyan-500 group-hover:text-black transition-all">
              CHANGE ▾
            </span>
          </button>
        )}
      </div>

      {/* Primary Navigation Shell */}
      <main className="relative z-10 w-full max-w-6xl flex flex-col items-center mb-8">
        {/* GIANT FLAGSHIP ROCKET: COMBAT ARENA LAUNCHER (Size of 3+ planets, click to explode into Arena) */}
        <div className="relative w-full flex flex-col items-center justify-center my-2 sm:my-4 md:my-5 select-none px-2">
          {/* Tactical Flagship Telemetry Badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 rounded-full bg-slate-950/90 border border-cyan-500/60 shadow-[0_0_20px_rgba(0,240,255,0.3)] mb-2">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-500 animate-ping" />
            <span className="text-[9px] sm:text-xs font-mono font-black text-cyan-300 tracking-[0.15em] sm:tracking-[0.2em] uppercase">
              FLAGSHIP COMBAT VESSEL // ATHLETEMIND EXPLORER
            </span>
            <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono hidden md:inline">
              [ TARGET: {activeExerciseName.toUpperCase()} ]
            </span>
          </div>

          {/* Interactive Giant Rocket Hull & Explosion Container */}
          <button
            onClick={handleRocketLaunch}
            disabled={isExploding}
            className="relative group w-full max-w-[500px] sm:max-w-[700px] md:max-w-[900px] h-36 sm:h-52 md:h-72 lg:h-80 flex items-center justify-center cursor-pointer focus:outline-none transition-transform duration-300"
            title="Click Flagship to Launch Combat Arena!"
          >
            {/* Ambient Engine Ion Glow */}
            <div
              className={`absolute inset-x-8 sm:inset-x-12 inset-y-4 sm:inset-y-6 bg-cyan-500/20 group-hover:bg-cyan-500/40 blur-3xl rounded-full transition-all duration-500 -z-10 ${
                isExploding ? "opacity-0" : "opacity-100"
              }`}
            />

            {/* Rocket Image with Idle Floating & Thruster Flare */}
            <div
              className={`relative w-full h-full flex items-center justify-center ${
                isExploding
                  ? "animate-ship-explode"
                  : "animate-rocket-float group-hover:scale-105 transition-transform duration-300"
              }`}
            >
              {/* Ion Engine Thruster Flame at Left/Rear */}
              {!isExploding && (
                <div className="absolute left-[8%] bottom-[22%] w-16 sm:w-24 h-8 sm:h-12 bg-gradient-to-l from-cyan-400 via-blue-500 to-transparent blur-md rounded-full animate-pulse pointer-events-none -z-10" />
              )}

              <img
                src="/rocket.png"
                alt="Athletemind Explorer Giant Flagship Rocket"
                className="w-full h-full object-contain filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.85)] group-hover:drop-shadow-[0_0_50px_rgba(0,240,255,0.85)] select-none pointer-events-none"
              />
            </div>

            {/* Supernova Explosion FX Layer when Clicked */}
            {isExploding && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                {/* Center Supernova Fireball */}
                <div className="w-40 h-40 sm:w-60 sm:h-60 md:w-72 md:h-72 rounded-full bg-gradient-to-r from-yellow-300 via-orange-500 to-red-600 animate-fireball shadow-[0_0_120px_rgba(255,100,0,1)]" />

                {/* Blinding White-Hot Core Flash */}
                <div className="absolute w-28 h-28 sm:w-40 sm:h-40 rounded-full bg-white animate-fireball blur-sm" />

                {/* Expanding Plasma Cyan Shockwave Ring */}
                <div className="absolute w-52 h-52 sm:w-72 sm:h-72 rounded-full border-4 border-cyan-400 animate-shockwave shadow-[0_0_60px_rgba(0,240,255,0.9)]" />

                {/* Secondary Golden Shockwave Ring */}
                <div className="absolute w-52 h-52 sm:w-72 sm:h-72 rounded-full border-4 border-amber-400 animate-shockwave-delay shadow-[0_0_70px_rgba(245,158,11,0.9)]" />

                {/* Tactical Screen Flash */}
                <div className="fixed inset-0 bg-white/30 pointer-events-none animate-pulse" />
              </div>
            )}
          </button>

          {/* Launch Cue Indicator */}
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[9px] sm:text-xs font-mono font-bold tracking-wider sm:tracking-widest text-cyan-400 uppercase bg-slate-950/85 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-cyan-500/40 shadow-md">
              {isExploding
                ? "💥 DETONATING ENGINE // ENTERING COMBAT SIMULATION..."
                : "⚡ CLICK FLAGSHIP TO LAUNCH COMBAT ARENA"}
            </span>
          </div>
        </div>

        {/* Celestial Solar & Planetary Exploration Sector - 6 Floating, Hovering & Tilting Worlds */}
        <section className="relative z-10 w-full max-w-6xl mb-8 sm:mb-12 mt-2 sm:mt-4 px-2">
          <div className="flex items-center justify-between px-2 mb-4 sm:mb-6">
            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-mono font-bold text-cyan-400 tracking-[0.15em] sm:tracking-[0.25em] uppercase">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>SOLAR SYSTEM & PLANETARY ORBITS // 6 CELESTIAL SECTORS</span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono tracking-widest uppercase hidden sm:inline">
              SELECT CELESTIAL SECTOR
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-6 items-start justify-items-center">
            {/* Celestial Body 1: The Sun (System Settings & Config) */}
            <button
              onClick={() => onNavigate("SETTINGS")}
              className="group flex flex-col items-center cursor-pointer transition-all duration-300 focus:outline-none w-full max-w-[150px] sm:max-w-[180px] lg:max-w-[200px]"
              title="System Settings & Audio Customization"
            >
              <div className="relative w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 flex items-center justify-center animate-sun">
                <div className="absolute inset-2 rounded-full bg-amber-500/35 group-hover:bg-amber-500/65 blur-2xl transition-all duration-500 -z-10 group-hover:scale-130 shadow-[0_0_45px_rgba(245,158,11,0.7)]" />
                <img
                  src="/sun.png"
                  alt="Solar Core System Settings"
                  className="w-full h-full object-contain filter drop-shadow-[0_8px_25px_rgba(0,0,0,0.8)] group-hover:drop-shadow-[0_0_35px_rgba(245,158,11,0.95)] group-hover:scale-110 transition-transform duration-300 select-none pointer-events-none"
                />
              </div>
              <div className="mt-2 sm:mt-3 flex flex-col items-center text-center">
                <div className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-slate-950/85 border border-amber-500/60 group-hover:border-amber-400 shadow-lg flex items-center gap-1.5 transition-all">
                  <span className="text-xs sm:text-sm">⚙️</span>
                  <span className="text-[10px] sm:text-xs font-black text-amber-300 group-hover:text-white uppercase tracking-wider font-mono">
                    SETTINGS
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-amber-400/90 font-mono font-bold uppercase tracking-widest mt-1">
                  SOLAR CORE
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 line-clamp-2 leading-tight">
                  Audio & Shaders
                </span>
              </div>
            </button>

            {/* Planet 1: Circuit Training Modes (Magma Planet) */}
            <button
              onClick={() => onNavigate("CIRCUIT_SELECT")}
              className="group flex flex-col items-center cursor-pointer transition-all duration-300 focus:outline-none w-full max-w-[150px] sm:max-w-[180px] lg:max-w-[200px]"
              title="Circuit Training Modes"
            >
              <div className="relative w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 flex items-center justify-center animate-planet-1">
                <div className="absolute inset-2 rounded-full bg-amber-500/25 group-hover:bg-amber-500/50 blur-xl transition-all duration-500 -z-10 group-hover:scale-125" />
                <img
                  src="/planets/planet-1.png"
                  alt="Circuit Training Planet"
                  className="w-full h-full object-contain filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.7)] group-hover:drop-shadow-[0_0_30px_rgba(245,158,11,0.8)] group-hover:scale-110 transition-transform duration-300 select-none pointer-events-none"
                />
              </div>
              <div className="mt-2 sm:mt-3 flex flex-col items-center text-center">
                <div className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-slate-950/85 border border-amber-500/50 group-hover:border-amber-400 shadow-lg flex items-center gap-1.5 transition-all">
                  <span className="text-xs sm:text-sm">⚡</span>
                  <span className="text-[10px] sm:text-xs font-black text-amber-300 group-hover:text-white uppercase tracking-wider font-mono">
                    CIRCUITS
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-amber-400/90 font-mono font-bold uppercase tracking-widest mt-1">
                  PROTOCOLS
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 line-clamp-2 leading-tight">
                  Hyper-Tension & Rehab
                </span>
              </div>
            </button>

            {/* Planet 2: Recovery Comparison & Analytics (Vortex Planet) */}
            <button
              onClick={() => onNavigate("COMPARISON")}
              className="group flex flex-col items-center cursor-pointer transition-all duration-300 focus:outline-none w-full max-w-[150px] sm:max-w-[180px] lg:max-w-[200px]"
              title="Recovery Comparison & Analytics"
            >
              <div className="relative w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 flex items-center justify-center animate-planet-4">
                <div className="absolute inset-2 rounded-full bg-teal-500/25 group-hover:bg-teal-500/50 blur-xl transition-all duration-500 -z-10 group-hover:scale-125" />
                <img
                  src="/planets/planet-4.png"
                  alt="Recovery Comparison Planet"
                  className="w-full h-full object-contain filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.7)] group-hover:drop-shadow-[0_0_30px_rgba(20,184,166,0.8)] group-hover:scale-110 transition-transform duration-300 select-none pointer-events-none"
                />
              </div>
              <div className="mt-2 sm:mt-3 flex flex-col items-center text-center">
                <div className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-slate-950/85 border border-teal-500/50 group-hover:border-teal-400 shadow-lg flex items-center gap-1.5 transition-all">
                  <span className="text-xs sm:text-sm">📊</span>
                  <span className="text-[10px] sm:text-xs font-black text-teal-300 group-hover:text-white uppercase tracking-wider font-mono">
                    RECOVERY
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-teal-400/90 font-mono font-bold uppercase tracking-widest mt-1">
                  DELTAS
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 line-clamp-2 leading-tight">
                  Baseline vs. Today Curves
                </span>
              </div>
            </button>

            {/* Planet 3: Achievements System (Jupiter Gas Giant) */}
            <button
              onClick={() => onNavigate("ACHIEVEMENTS")}
              className="group flex flex-col items-center cursor-pointer transition-all duration-300 focus:outline-none w-full max-w-[150px] sm:max-w-[180px] lg:max-w-[200px]"
              title="Achievements Showcase"
            >
              <div className="relative w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 flex items-center justify-center animate-planet-5">
                <div className="absolute inset-2 rounded-full bg-yellow-500/25 group-hover:bg-yellow-500/50 blur-xl transition-all duration-500 -z-10 group-hover:scale-125" />
                <img
                  src="/planets/planet-5.png"
                  alt="Achievements Planet"
                  className="w-full h-full object-contain filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.7)] group-hover:drop-shadow-[0_0_30px_rgba(234,179,8,0.8)] group-hover:scale-110 transition-transform duration-300 select-none pointer-events-none"
                />
              </div>
              <div className="mt-2 sm:mt-3 flex flex-col items-center text-center">
                <div className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-slate-950/85 border border-yellow-500/50 group-hover:border-yellow-400 shadow-lg flex items-center gap-1.5 transition-all">
                  <span className="text-xs sm:text-sm">🏆</span>
                  <span className="text-[10px] sm:text-xs font-black text-yellow-300 group-hover:text-white uppercase tracking-wider font-mono">
                    MEDALS
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-yellow-400/90 font-mono font-bold uppercase tracking-widest mt-1">
                  {unlockedAchievementsCount}/{totalAchievementsCount} UNLOCKED
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 line-clamp-2 leading-tight">
                  Clinical Milestone Badges
                </span>
              </div>
            </button>

            {/* Planet 4: Clinical Telemetry (Deep Blue / Cyan Star Planet) */}
            <button
              onClick={() => onNavigate("TELEMETRY")}
              className="group flex flex-col items-center cursor-pointer transition-all duration-300 focus:outline-none w-full max-w-[150px] sm:max-w-[180px] lg:max-w-[200px]"
              title="Clinical Telemetry & Raw Data"
            >
              <div className="relative w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 flex items-center justify-center animate-planet-3">
                <div className="absolute inset-2 rounded-full bg-emerald-500/25 group-hover:bg-emerald-500/50 blur-xl transition-all duration-500 -z-10 group-hover:scale-125" />
                <img
                  src="/planets/planet-3.png"
                  alt="Clinical Telemetry Planet"
                  className="w-full h-full object-contain filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.7)] group-hover:drop-shadow-[0_0_30px_rgba(16,185,129,0.8)] group-hover:scale-110 transition-transform duration-300 select-none pointer-events-none"
                />
              </div>
              <div className="mt-2 sm:mt-3 flex flex-col items-center text-center">
                <div className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-slate-950/85 border border-emerald-500/50 group-hover:border-emerald-400 shadow-lg flex items-center gap-1.5 transition-all">
                  <span className="text-xs sm:text-sm">📈</span>
                  <span className="text-[10px] sm:text-xs font-black text-emerald-300 group-hover:text-white uppercase tracking-wider font-mono">
                    TELEMETRY
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-emerald-400/90 font-mono font-bold uppercase tracking-widest mt-1">
                  RAW DATA
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 line-clamp-2 leading-tight">
                  Kinematic Angles & CSV
                </span>
              </div>
            </button>

            {/* Planet 5: Camera & Calibration Test (Obsidian Banded Planet) */}
            <button
              onClick={() => onNavigate("CAMERA_TEST")}
              className="group flex flex-col items-center cursor-pointer transition-all duration-300 focus:outline-none w-full max-w-[150px] sm:max-w-[180px] lg:max-w-[200px]"
              title="Camera & Sensor Diagnostics"
            >
              <div className="relative w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 flex items-center justify-center animate-planet-2">
                <div className="absolute inset-2 rounded-full bg-purple-500/25 group-hover:bg-purple-500/50 blur-xl transition-all duration-500 -z-10 group-hover:scale-125" />
                <img
                  src="/planets/planet-2.png"
                  alt="Sensor Test Planet"
                  className="w-full h-full object-contain filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.7)] group-hover:drop-shadow-[0_0_30px_rgba(168,85,247,0.8)] group-hover:scale-110 transition-transform duration-300 select-none pointer-events-none"
                />
              </div>
              <div className="mt-2 sm:mt-3 flex flex-col items-center text-center">
                <div className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-slate-950/85 border border-purple-500/50 group-hover:border-purple-400 shadow-lg flex items-center gap-1.5 transition-all">
                  <span className="text-xs sm:text-sm">📷</span>
                  <span className="text-[10px] sm:text-xs font-black text-purple-300 group-hover:text-white uppercase tracking-wider font-mono">
                    SENSORS
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-purple-400/90 font-mono font-bold uppercase tracking-widest mt-1">
                  SENSOR TEST
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 line-clamp-2 leading-tight">
                  Calibration & Reticle
                </span>
              </div>
            </button>
          </div>
        </section>
      </main>

      {/* Footer System Status */}
      <footer className="relative z-10 w-full max-w-6xl text-center border-t border-slate-800/80 pt-4 pb-2 text-slate-500 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>NEURAL MOTOR LINK ONLINE // LATENCY: 16ms</span>
        </div>
        <div>
          <span>ATHLETEMIND V2.5 • GOOGLE DEEPMIND ADVANCED CLINICAL ENGINE</span>
        </div>
      </footer>
    </div>
  );
};
