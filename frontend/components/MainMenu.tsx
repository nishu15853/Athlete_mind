"use client";

import React from "react";

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
  return (
    <div className="relative w-full h-full min-h-screen bg-[#050811] text-white flex flex-col items-center justify-between p-4 sm:p-8 font-mono select-none overflow-y-auto">
      {/* Background Decorative Tech Grid & Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-cyan-950/40 via-cyan-500/10 to-transparent blur-[140px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-950/30 blur-[130px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-25" />
      </div>

      {/* Top Bar: Callsign, Pilot Rank & Resource Indicators */}
      <header className="relative z-10 w-full max-w-6xl flex flex-wrap items-center justify-between gap-4 py-3 px-6 rounded-2xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            🛡️
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              OPERATIVE // {callsign}
            </span>
            <span className="text-sm font-black text-cyan-300 uppercase tracking-widest">
              {rankTitle}
            </span>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-950/60 border border-amber-500/50 text-xs font-black text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
            <span>🔥</span>
            <span>DAY {streak > 0 ? streak : 1} STREAK</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/50 text-xs font-black text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
            <span>💎</span>
            <span>{bioCredits} CREDITS</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-purple-950/60 border border-purple-500/50 text-xs font-black text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)]">
            <span>⚡</span>
            <span>{energyCores} CORES</span>
          </div>
        </div>
      </header>

      {/* Center Hero: Title & Mission Briefing */}
      <div className="relative z-10 w-full max-w-4xl text-center my-6 sm:my-8 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-[10px] sm:text-xs font-mono font-black text-cyan-300 tracking-[0.25em] uppercase mb-3 shadow-[0_0_20px_rgba(0,240,255,0.25)]">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>KINETIC AEGIS ENGINE // 3D VECTOR BIOMECHANICS</span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-wider font-mono text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 drop-shadow-[0_4px_30px_rgba(0,240,255,0.3)]">
          ATHLETE<span className="text-cyan-400">MIND</span>
        </h1>
        <p className="mt-2 text-xs sm:text-base font-mono text-slate-300 tracking-widest uppercase max-w-2xl">
          Clinical Physical Therapy & Gamified Deflection Gauntlet
        </p>

        {/* Active Prescribed Exercise Pill */}
        {onOpenExerciseSelector && (
          <button
            onClick={onOpenExerciseSelector}
            className="mt-4 px-5 py-2.5 rounded-2xl bg-cyan-950/80 hover:bg-cyan-900/90 border border-cyan-500/60 hover:border-cyan-400 flex items-center gap-3 transition-all cursor-pointer shadow-[0_0_25px_rgba(0,240,255,0.25)] group"
            title="Open 10-Exercise Clinical Rehabilitation Suite"
          >
            <span className="text-xl">🎯</span>
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">
                PRESCRIBED PROTOCOL
              </span>
              <span className="text-xs sm:text-sm font-black text-cyan-300 group-hover:text-white uppercase tracking-wider font-mono">
                {activeExerciseName}
              </span>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40 ml-2 group-hover:bg-cyan-500 group-hover:text-black transition-all">
              CHANGE ▾
            </span>
          </button>
        )}
      </div>

      {/* Primary Navigation Grid (7 High-Impact Neon Modules) */}
      <main className="relative z-10 w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-8">
        {/* Tile 1: Primary Arena / Combat Encounter (Full Width or Featured) */}
        <button
          onClick={() => onNavigate("ARENA")}
          className="group relative lg:col-span-2 p-6 rounded-3xl bg-gradient-to-br from-cyan-950/80 via-slate-950/90 to-slate-900/90 border-2 border-cyan-500/70 hover:border-cyan-400 transition-all duration-300 cursor-pointer shadow-[0_0_35px_rgba(0,240,255,0.25)] hover:shadow-[0_0_55px_rgba(0,240,255,0.45)] text-left flex flex-col justify-between overflow-hidden transform hover:-translate-y-1"
        >
          <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/20 transition-all" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl sm:text-4xl">⚔️</span>
            <span className="px-3 py-1 rounded-xl bg-cyan-500 text-black text-xs font-black tracking-widest uppercase shadow-[0_0_15px_rgba(0,240,255,0.6)]">
              PRIMARY MODE
            </span>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white group-hover:text-cyan-300 uppercase tracking-wider mb-1 transition-colors">
              START COMBAT / {activeExerciseName.toUpperCase()} ARENA
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-mono">
              Deflect high-mass incoming kinetic shockwaves by squatting and holding depth. 
              Real-time biomechanical skeleton, timed parrying, and Colossus boss encounters.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
            <span>ENTER SIMULATION</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </button>

        {/* Tile 2: Circuit Training Modes */}
        <button
          onClick={() => onNavigate("CIRCUIT_SELECT")}
          className="group relative p-6 rounded-3xl bg-slate-950/80 hover:bg-slate-900/90 border border-amber-500/50 hover:border-amber-400 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-[0_0_35px_rgba(245,158,11,0.3)] text-left flex flex-col justify-between overflow-hidden transform hover:-translate-y-1"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-3xl">⚡</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-black uppercase">
              PROTOCOLS
            </span>
          </div>
          <div>
            <h2 className="text-lg font-black text-white group-hover:text-amber-300 uppercase tracking-wider mb-1 transition-colors">
              CIRCUIT TRAINING MODES
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Multi-exercise protocols: Hyper-Tension pauses, Full-Body overhead gauntlets, and Rehab endurance.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>CONFIGURE CIRCUITS →</span>
          </div>
        </button>

        {/* Tile 3: Recovery Comparison & Analytics */}
        <button
          onClick={() => onNavigate("COMPARISON")}
          className="group relative p-6 rounded-3xl bg-slate-950/80 hover:bg-slate-900/90 border border-teal-500/50 hover:border-teal-400 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-[0_0_35px_rgba(20,184,166,0.3)] text-left flex flex-col justify-between overflow-hidden transform hover:-translate-y-1"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-3xl">📊</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-teal-500/20 border border-teal-500/50 text-teal-300 text-[10px] font-black uppercase">
              DELTAS
            </span>
          </div>
          <div>
            <h2 className="text-lg font-black text-white group-hover:text-teal-300 uppercase tracking-wider mb-1 transition-colors">
              RECOVERY COMPARISON
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Side-by-side Day 1 Baseline vs. Best vs. Today telemetry, recovery curves, and range-of-motion gains.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>VIEW TRAJECTORY →</span>
          </div>
        </button>

        {/* Tile 4: Achievements System */}
        <button
          onClick={() => onNavigate("ACHIEVEMENTS")}
          className="group relative p-6 rounded-3xl bg-slate-950/80 hover:bg-slate-900/90 border border-yellow-500/50 hover:border-yellow-400 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-[0_0_35px_rgba(234,179,8,0.3)] text-left flex flex-col justify-between overflow-hidden transform hover:-translate-y-1"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-3xl">🏆</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-[10px] font-black uppercase">
              {unlockedAchievementsCount}/{totalAchievementsCount} UNLOCKED
            </span>
          </div>
          <div>
            <h2 className="text-lg font-black text-white group-hover:text-yellow-300 uppercase tracking-wider mb-1 transition-colors">
              ACHIEVEMENTS SHOWCASE
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              10 clinical and arcade milestone medals: First Blood, Iron Tendons, Zen Anchor, and Graduation honors.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>INSPECT MEDALS →</span>
          </div>
        </button>

        {/* Tile 5: Clinical Telemetry */}
        <button
          onClick={() => onNavigate("TELEMETRY")}
          className="group relative p-6 rounded-3xl bg-slate-950/80 hover:bg-slate-900/90 border border-emerald-500/50 hover:border-emerald-400 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-[0_0_35px_rgba(16,185,129,0.3)] text-left flex flex-col justify-between overflow-hidden transform hover:-translate-y-1"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-3xl">📈</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[10px] font-black uppercase">
              RAW DATA
            </span>
          </div>
          <div>
            <h2 className="text-lg font-black text-white group-hover:text-emerald-300 uppercase tracking-wider mb-1 transition-colors">
              CLINICAL TELEMETRY
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Real-time joint angle sparklines, isometric time-under-tension breakdown, bilateral symmetry, and CSV export.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>VIEW TELEMETRY & CSV →</span>
          </div>
        </button>

        {/* Tile 6: Camera Test & Hardware Sensor Diagnostics */}
        <button
          onClick={() => onNavigate("CAMERA_TEST")}
          className="group relative p-6 rounded-3xl bg-slate-950/80 hover:bg-slate-900/90 border border-purple-500/50 hover:border-purple-400 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-[0_0_35px_rgba(168,85,247,0.3)] text-left flex flex-col justify-between overflow-hidden transform hover:-translate-y-1"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-3xl">📷</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-300 text-[10px] font-black uppercase">
              SENSOR TEST
            </span>
          </div>
          <div>
            <h2 className="text-lg font-black text-white group-hover:text-purple-300 uppercase tracking-wider mb-1 transition-colors">
              CAMERA & CALIBRATION TEST
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Full-screen mirrored sensor feed with FPS counter, resolution gauge, joint confidence, and distance reticle.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>RUN SENSOR DIAGNOSTICS →</span>
          </div>
        </button>

        {/* Tile 7: Settings & Audio Customization */}
        <button
          onClick={() => onNavigate("SETTINGS")}
          className="group relative p-6 rounded-3xl bg-slate-950/80 hover:bg-slate-900/90 border border-slate-700/60 hover:border-slate-500 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-[0_0_30px_rgba(148,163,184,0.2)] text-left flex flex-col justify-between overflow-hidden transform hover:-translate-y-1"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-3xl">⚙️</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-300 text-[10px] font-black uppercase">
              CONFIG
            </span>
          </div>
          <div>
            <h2 className="text-lg font-black text-white group-hover:text-slate-200 uppercase tracking-wider mb-1 transition-colors">
              SYSTEM SETTINGS
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Synthesizer audio profiles (Arcade Synth vs. Heavy Mecha), skeletal shaders, rest day locks, and storage reset.
            </p>
          </div>
          <div className="mt-4 text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <span>PREFERENCES →</span>
          </div>
        </button>
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
