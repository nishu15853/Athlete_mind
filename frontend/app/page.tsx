"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import {
  PlayerProfile,
  MatchRecord,
  AggregatedStats,
  Achievement,
  LeaderboardEntry,
  AppSettings,
  getProfile,
  saveProfile,
  getMatchHistory,
  getAggregatedStats,
  getAchievements,
  getLeaderboard,
  getSettings,
  saveSettings,
  recordMatchResult,
  resetAllData,
} from "@/lib/storage";

// ---------------------------------------------------------------------------
// Navigation View State
// ---------------------------------------------------------------------------
export type View = "ARENA" | "PROFILE" | "STATS" | "LEADERBOARD" | "MATCH_HISTORY" | "SETTINGS";

// ---------------------------------------------------------------------------
// Biomechanical & Kinematic Interfaces
// ---------------------------------------------------------------------------

interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface PoseResults {
  poseLandmarks?: Landmark[];
  poseWorldLandmarks?: Landmark[];
}

interface PoseInstance {
  setOptions: (options: {
    modelComplexity?: number;
    smoothLandmarks?: boolean;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }) => void;
  onResults: (callback: (results: PoseResults) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close: () => Promise<void>;
}

declare global {
  interface Window {
    Pose?: new (config: { locateFile: (file: string) => string }) => PoseInstance;
  }
}

export type ExerciseType = "squat" | "pushup" | "overhead_press" | "rdl" | "circuit";
export type DifficultyTier = "rehab" | "standard" | "athlete";

export interface BioEnginePayload {
  event?: string;
  exercise: ExerciseType;
  orientation?: "FRONT" | "SIDE";
  dominant_side?: "LEFT" | "RIGHT" | "BILATERAL";
  valgus?: boolean;
  warning?: string;
  status: string;
  phase: string;
  primary_angle: number;
  primary_label: string;
  secondary_angle: number;
  secondary_label: string;
  knee_angle?: number;
  hip_angle?: number;
  fault_detected: boolean;
  fault_name: string;
  voice_cue: string;
  hold_progress: number;
  hold_time: number;
  rep_count: number;
  purity: number;
  damage: number;
  damage_taken: number;
  coach_feedback: string;
  weapon_overheated: boolean;
  symmetry?: number;
  is_critical?: boolean;
  message?: string;
  circuit_phase?: number;
  circuit_phase_name?: string;
  circuit_phase_reps?: number;
  circuit_target_reps?: number;
  circuit_total_reps?: number;
  circuit_banner?: string;
  next_exercise?: string;
}

export interface EncounterStats {
  totalReps: number;
  purityScores: number[];
  depthAngles: number[];
  holdTimes: number[];
  valgusWarnings: number;
  egoPenalties: number;
  maxConsecutiveCrits: number;
  currentCritStreak: number;
  symmetryScores: number[];
  cadenceBonusReps: number;
  overdriveActivations: number;
  projectilesDeflected: number;
  clashesWon: number;
  missionTimeSeconds: number;
}

export interface HazardState {
  type: "NONE" | "HIGH_LASER" | "LATERAL_BLAST";
  side?: "LEFT" | "RIGHT";
  phase: "WARNING" | "ACTIVE" | "CLEARED" | "FAILED";
  startTime: number;
  duration: number;
  warningDuration: number;
  duckThresholdY: number;
}

export interface ProjectileOrb {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  active: boolean;
}

export interface BossArchetype {
  id: "goliath" | "velocity" | "chrono";
  name: string;
  subtitle: string;
  avatar: string;
  tag: string;
  hp: number;
  attackInterval: number;
  vulnerability: string;
  description: string;
  color: string;
  borderColor: string;
  badgeColor: string;
  stats: { armor: number; speed: number; threat: string };
  taunts: {
    intro: string;
    comboBreak: string;
    hit5x: string;
    clash: string;
    enrage: string;
    meltdown: string;
  };
}

export const BOSS_CATALOG: Record<string, BossArchetype> = {
  goliath: {
    id: "goliath",
    name: "GOLIATH UNIT",
    subtitle: "HEAVY SIEGE COLOSSUS // MK-IV",
    avatar: "🤖",
    tag: "HEAVY TANK",
    hp: 600,
    attackInterval: 15.0,
    vulnerability: "Deep squats with strict 2.0s pause holds to crack armor",
    description: "Massive reinforced titanium armor plating. Slow, devastating telegraphed attacks. Highly vulnerable to deep, sustained isometric holds.",
    color: "from-amber-600 via-orange-500 to-red-600",
    borderColor: "border-amber-500",
    badgeColor: "bg-amber-950/80 text-amber-300 border-amber-500/50",
    stats: { armor: 95, speed: 30, threat: "HIGH" },
    taunts: {
      intro: "Goliath Unit online. Your pathetic reps cannot pierce my armor!",
      comboBreak: "Ha! Form cracked! Your muscles fail you!",
      hit5x: "Impossible! My hydraulic shielding is buckling!",
      clash: "Face the brute force of Goliath! Hold your ground or be crushed!",
      enrage: "Core overcharged! Total hydraulic purge imminent!",
      meltdown: "Mission timer expired! Meltdown protocol engaged!",
    },
  },
  velocity: {
    id: "velocity",
    name: "VELOCITY STALKER",
    subtitle: "HYPERSONIC ASSASSIN // V-9",
    avatar: "⚡",
    tag: "SPEED & AGILITY",
    hp: 300,
    attackInterval: 7.0,
    vulnerability: "Snappy cadence rhythm & rapid laser parries",
    description: "Lightweight cybernetic drone moving at overclocked velocity. Relentless 7-second attack pacing. Fragile frame shatters against synchronized rhythm.",
    color: "from-cyan-600 via-sky-500 to-blue-600",
    borderColor: "border-cyan-400",
    badgeColor: "bg-cyan-950/80 text-cyan-300 border-cyan-500/50",
    stats: { armor: 40, speed: 95, threat: "EXTREME" },
    taunts: {
      intro: "Velocity Stalker deployed. Too fast for your sluggish joints!",
      comboBreak: "Too slow, human! You dropped the cadence rhythm!",
      hit5x: "Gah! How did you match my overclocked speed?!",
      clash: "Can you withstand hypersonic kinetic impact?!",
      enrage: "Overdrive thrusters maxed out! Try to keep up!",
      meltdown: "Time has run out! Hypersonic annihilation begins!",
    },
  },
  chrono: {
    id: "chrono",
    name: "CHRONO WARDEN",
    subtitle: "TEMPORAL WARP MATRIX // Ω-1",
    avatar: "⏳",
    tag: "TIME HAZARD",
    hp: 450,
    attackInterval: 10.0,
    vulnerability: "Sweeping laser grids & spatial zone hazards",
    description: "Warps space-time fabric to deploy deadly sweeping laser lines and lateral detonation zones. Demands spatial agility and deep evasive squats.",
    color: "from-purple-600 via-fuchsia-500 to-indigo-600",
    borderColor: "border-purple-400",
    badgeColor: "bg-purple-950/80 text-purple-300 border-purple-500/50",
    stats: { armor: 70, speed: 70, threat: "CRITICAL" },
    taunts: {
      intro: "Chrono Warden initialized. Your seconds are numbered in this sector!",
      comboBreak: "A temporal rift opens! Your rhythm has collapsed!",
      hit5x: "My temporal field is shattering! Impossible!",
      clash: "Time warp collapse! Anchor your stance or fade into void!",
      enrage: "Temporal containment breached! Meltdown imminent!",
      meltdown: "Temporal clock expired! Entropy consumes this reality!",
    },
  },
};

const INITIAL_ENGINE: BioEnginePayload = {
  exercise: "squat",
  status: "STANDBY",
  phase: "IDLE",
  primary_angle: 180,
  primary_label: "KNEE",
  secondary_angle: 180,
  secondary_label: "HIP",
  fault_detected: false,
  fault_name: "",
  voice_cue: "",
  hold_progress: 0,
  hold_time: 0,
  rep_count: 0,
  purity: 100,
  damage: 0,
  damage_taken: 0,
  coach_feedback: "ENGAGE BATTLE TO INITIATE CALIBRATION",
  weapon_overheated: false,
};

const INITIAL_STATS: EncounterStats = {
  totalReps: 0,
  purityScores: [],
  depthAngles: [],
  holdTimes: [],
  valgusWarnings: 0,
  egoPenalties: 0,
  maxConsecutiveCrits: 0,
  currentCritStreak: 0,
  symmetryScores: [],
  cadenceBonusReps: 0,
  overdriveActivations: 0,
  projectilesDeflected: 0,
  clashesWon: 0,
  missionTimeSeconds: 0,
};

// ---------------------------------------------------------------------------
// Native Web Audio & Voice Coach Singleton
// ---------------------------------------------------------------------------

class SoundFX {
  private ctx: AudioContext | null = null;
  public isMuted = false;
  public isMusicMuted = false;
  public isVoiceMuted = false;
  public masterVolume = 0.8;
  private filterNode: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private isLoopRunning = false;
  private loopTimer: number | null = null;
  private currentStep = 0;
  private isEnragedMode = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx?.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  setVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    const ctx = this.getContext();
    if (this.masterGain && ctx) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, ctx.currentTime);
    }
  }

  tone(freq: number, type: OscillatorType, duration: number, gainVal = 0.2, delay = 0) {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration);
  }

  hit() { this.tone(523.25, "triangle", 0.15, 0.25); }
  penalty() { this.tone(130.81, "sawtooth", 0.45, 0.35); }
  bossAttack() { this.tone(90, "sawtooth", 0.5, 0.4); }
  victory() {
    this.fanfareChord();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, "sine", 0.35, 0.25, i * 0.1));
  }
  defeat() { [440, 370, 311, 220].forEach((f, i) => this.tone(f, "sawtooth", 0.45, 0.3, i * 0.15)); }
  countdownBeep(freq = 440) { this.tone(freq, "sine", 0.12, 0.2); }
  countdownEngage() { [587.33, 880.0, 1174.66, 1760.0].forEach((f, i) => this.tone(f, "triangle", 0.4, 0.3, i * 0.08)); }
  cadenceBonus() { [880.0, 1318.51].forEach((f, i) => this.tone(f, "sine", 0.2, 0.3, i * 0.08)); }
  deflect() { [1200, 1600, 2000].forEach((f, i) => this.tone(f, "triangle", 0.1, 0.25, i * 0.04)); }
  dodgeSuccess() { [440, 660, 880].forEach((f, i) => this.tone(f, "sine", 0.15, 0.25, i * 0.05)); }

  metronomeTick(isAccent = false, isChime = false) {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (isChime) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1320, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.1);
    } else if (isAccent) {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(920, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.05);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(620, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.035);
    }
  }

  impactGlide() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.2);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  glitchWarning() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    [110, 116.5].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  fanfareChord() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.50];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);
      gain.gain.setValueAtTime(0.18, t + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t + idx * 0.04);
      osc.stop(t + 1.1);
    });
  }

  overdriveBeam() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.8);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 2.5);
  }

  sirenWarning() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.linearRampToValueAtTime(950, t + 0.25);
    osc.frequency.linearRampToValueAtTime(650, t + 0.5);
    osc.frequency.linearRampToValueAtTime(950, t + 0.75);
    osc.frequency.linearRampToValueAtTime(650, t + 1.0);
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 1.1);
  }

  bassDrop() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.45);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  spiritBombExplosion() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    this.bassDrop();
    [55, 110, 220, 440].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.26, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8 + idx * 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 2.0);
    });
  }

  private initAdaptiveEngine() {
    const ctx = this.getContext();
    if (!ctx || this.filterNode || !this.masterGain) return;
    try {
      this.filterNode = ctx.createBiquadFilter();
      this.filterNode.type = "lowpass";
      this.filterNode.frequency.setValueAtTime(1800, ctx.currentTime);
      this.filterNode.Q.setValueAtTime(2.2, ctx.currentTime);
      this.filterNode.connect(this.masterGain);
    } catch {
      /* noop */
    }
  }

  setMuffled(isMuffled: boolean) {
    if (this.isMuted || this.isMusicMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    this.initAdaptiveEngine();
    if (!this.filterNode) return;
    const targetFreq = isMuffled ? 320 : (this.isEnragedMode ? 2400 : 1800);
    this.filterNode.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.08);
  }

  setEnraged(enraged: boolean) {
    this.isEnragedMode = enraged;
    const ctx = this.getContext();
    if (this.filterNode && ctx) {
      this.filterNode.frequency.setTargetAtTime(enraged ? 2400 : 1800, ctx.currentTime, 0.1);
    }
  }

  startAdaptiveLoop() {
    if (this.isLoopRunning || this.isMuted || this.isMusicMuted) return;
    this.initAdaptiveEngine();
    this.isLoopRunning = true;
    this.currentStep = 0;

    const bassNotes = [55, 55, 65.4, 73.4, 55, 55, 82.4, 73.4];
    const enragedNotes = [82.4, 82.4, 98.0, 110.0, 82.4, 82.4, 123.4, 110.0];

    const tick = () => {
      if (!this.isLoopRunning || this.isMuted || this.isMusicMuted) return;
      const ctx = this.getContext();
      if (ctx && this.filterNode) {
        const t = ctx.currentTime;
        const notes = this.isEnragedMode ? enragedNotes : bassNotes;
        const noteFreq = notes[this.currentStep % notes.length];
        const isKick = this.currentStep % 2 === 0;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = this.isEnragedMode ? "sawtooth" : "triangle";
        osc.frequency.setValueAtTime(noteFreq, t);
        gain.gain.setValueAtTime(this.isEnragedMode ? 0.15 : 0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (this.isEnragedMode ? 0.18 : 0.22));
        osc.connect(gain);
        gain.connect(this.filterNode);
        osc.start(t);
        osc.stop(t + (this.isEnragedMode ? 0.18 : 0.22));

        if (isKick) {
          const kickOsc = ctx.createOscillator();
          const kickGain = ctx.createGain();
          kickOsc.type = "sine";
          kickOsc.frequency.setValueAtTime(130, t);
          kickOsc.frequency.exponentialRampToValueAtTime(42, t + 0.08);
          kickGain.gain.setValueAtTime(0.18, t);
          kickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
          kickOsc.connect(kickGain);
          kickGain.connect(this.filterNode);
          kickOsc.start(t);
          kickOsc.stop(t + 0.09);
        }
      }

      this.currentStep++;
      const tempo = this.isEnragedMode ? 210 : 275;
      this.loopTimer = window.setTimeout(tick, tempo);
    };

    tick();
  }

  stopAdaptiveLoop() {
    this.isLoopRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }
}

const sfx = new SoundFX();

const coachSpeak = (text: string) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || sfx.isMuted || sfx.isVoiceMuted) return;
  try {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.15;
    utt.pitch = 1.05;
    window.speechSynthesis.speak(utt);
  } catch {
    /* noop */
  }
};

// ---------------------------------------------------------------------------
// Canvas 3D Skeleton & Particle Drawing
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  radius: number;
  life: number;
}

interface CanvasFloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

interface Shockwave {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

function drawVisuals(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lms: Landmark[],
  engine: BioEnginePayload,
  activeEx: ExerciseType,
  trackedSide: "LEFT" | "RIGHT",
  particles: Particle[],
  floatingTexts: CanvasFloatingText[],
  shockwaves: Shockwave[],
  projectiles: ProjectileOrb[],
  timeMs: number,
  hazard: HazardState,
  ghostCycleSec: number,
  isGhostSync: boolean,
  comboStreak: number,
  spiritBombProgress: number,
  isEnraged: boolean,
  isClashActive: boolean,
  clashProgress: number
) {
  const toPx = (i: number) => {
    const lm = lms[i];
    return lm ? { x: lm.x * w, y: lm.y * h } : null;
  };

  const lSh = toPx(11), rSh = toPx(12);
  const lEl = toPx(13), rEl = toPx(14);
  const lWr = toPx(15), rWr = toPx(16);
  const lHp = toPx(23), rHp = toPx(24);
  const lKn = toPx(25), rKn = toPx(26);
  const lAn = toPx(27), rAn = toPx(28);

  const isFront = engine.orientation === "FRONT" || (lSh && rSh && Math.abs(lSh.x - rSh.x) > w * 0.15);
  const hasValgus = Boolean(engine.valgus);
  const isHold = engine.phase.includes("HOLD") || engine.phase === "LOCKOUT" || (activeEx === "squat" && (engine.knee_angle ?? 180) <= 95);
  const isFault = hasValgus || engine.fault_detected || engine.status === "penalty" || engine.phase === "STUNNED";

  const haloColor = isFault ? "#ef4444" : isHold ? "#10b981" : "#00f0ff";
  const laserColor = isFault ? "rgba(239, 68, 68, 0.85)" : isHold ? "rgba(16, 185, 129, 0.85)" : "rgba(0, 240, 255, 0.85)";
  const armLaserColor = isFault ? "rgba(239, 68, 68, 0.85)" : isHold ? "rgba(16, 185, 129, 0.85)" : "rgba(56, 189, 248, 0.85)";

  const drawLaserBone = (p1: { x: number; y: number } | null, p2: { x: number; y: number } | null, strokeColor: string) => {
    if (!p1 || !p2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = strokeColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = strokeColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.restore();
  };

  if (lSh && rSh && lHp && rHp) {
    const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
    const midHp = { x: (lHp.x + rHp.x) / 2, y: (lHp.y + rHp.y) / 2 };
    drawLaserBone(midSh, midHp, "rgba(148, 163, 184, 0.85)");
    drawLaserBone(lSh, rSh, "rgba(6, 182, 212, 0.85)");
    drawLaserBone(lHp, rHp, "rgba(6, 182, 212, 0.85)");
  }

  if (isFront && lHp && rHp) {
    drawLaserBone(lHp, lKn, laserColor);
    drawLaserBone(lKn, lAn, laserColor);
    drawLaserBone(rHp, rKn, laserColor);
    drawLaserBone(rKn, rAn, laserColor);

    if (activeEx === "pushup" || activeEx === "overhead_press" || activeEx === "circuit") {
      drawLaserBone(lSh, lEl, armLaserColor);
      drawLaserBone(lEl, lWr, armLaserColor);
      drawLaserBone(rSh, rEl, armLaserColor);
      drawLaserBone(rEl, rWr, armLaserColor);
    }
  } else {
    const isRight = trackedSide === "RIGHT";
    const sh = isRight ? (rSh || lSh) : (lSh || rSh);
    const el = isRight ? (rEl || lEl) : (lEl || rEl);
    const wr = isRight ? (rWr || lWr) : (lWr || rWr);
    const hp = isRight ? (rHp || lHp) : (lHp || rHp);
    const kn = isRight ? (rKn || lKn) : (lKn || rKn);
    const an = isRight ? (rAn || lAn) : (lAn || rAn);

    drawLaserBone(sh, hp, "rgba(148, 163, 184, 0.85)");
    drawLaserBone(hp, kn, laserColor);
    drawLaserBone(kn, an, laserColor);

    if (activeEx === "pushup" || activeEx === "overhead_press" || activeEx === "circuit") {
      drawLaserBone(sh, el, armLaserColor);
      drawLaserBone(el, wr, armLaserColor);
    }
  }

  const curSide = trackedSide;
  const isRightSide = curSide === "RIGHT";
  const activeJoints = isFront
    ? [
        { p: lKn, lbl: `L-KNEE`, isPrimary: activeEx === "squat" },
        { p: rKn, lbl: `R-KNEE`, isPrimary: activeEx === "squat" },
        { p: lAn, lbl: "L-ANKLE", isPrimary: false },
        { p: rAn, lbl: "R-ANKLE", isPrimary: false },
        { p: lHp, lbl: "L-HIP", isPrimary: activeEx === "rdl" },
        { p: rHp, lbl: "R-HIP", isPrimary: activeEx === "rdl" },
        { p: lSh, lbl: "L-SHOULDER", isPrimary: false },
        { p: rSh, lbl: "R-SHOULDER", isPrimary: false },
        { p: lEl, lbl: "L-ELBOW", isPrimary: activeEx === "pushup" },
        { p: rEl, lbl: "R-ELBOW", isPrimary: activeEx === "pushup" },
        { p: lWr, lbl: "L-WRIST", isPrimary: activeEx === "overhead_press" },
        { p: rWr, lbl: "R-WRIST", isPrimary: activeEx === "overhead_press" },
      ]
    : (() => [
        { p: isRightSide ? (rKn || lKn) : (lKn || rKn), lbl: `${engine.primary_label} ${Math.round(engine.primary_angle)}°`, isPrimary: activeEx === "squat" },
        { p: isRightSide ? (rHp || lHp) : (lHp || rHp), lbl: `${engine.secondary_label} ${Math.round(engine.secondary_angle)}°`, isPrimary: activeEx === "rdl" },
        { p: isRightSide ? (rAn || lAn) : (lAn || rAn), lbl: "ANKLE", isPrimary: false },
        { p: isRightSide ? (rSh || lSh) : (lSh || rSh), lbl: "SHOULDER", isPrimary: false },
        { p: isRightSide ? (rEl || lEl) : (lEl || rEl), lbl: "ELBOW", isPrimary: activeEx === "pushup" },
        { p: isRightSide ? (rWr || lWr) : (lWr || rWr), lbl: "WRIST", isPrimary: activeEx === "overhead_press" },
      ])();

  activeJoints.forEach((j) => {
    if (!j.p) return;
    ctx.save();
    ctx.shadowBlur = isHold ? 18 : 10;
    ctx.shadowColor = haloColor;

    ctx.beginPath();
    ctx.arc(j.p.x, j.p.y, 7, 0, 2 * Math.PI);
    ctx.strokeStyle = haloColor;
    ctx.lineWidth = isHold ? 2.5 : 2;
    ctx.stroke();

    if (isHold && j.isPrimary) {
      const pulseR = 8 + Math.sin(timeMs * 0.01) * 3.5;
      ctx.beginPath();
      ctx.arc(j.p.x, j.p.y, pulseR, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(j.p.x, j.p.y, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = isFault ? "#ffffff" : isHold ? "#ecfdf5" : "#ffffff";
    ctx.fill();

    if (j.lbl && !isFront) {
      ctx.save();
      ctx.translate(j.p.x, j.p.y - 12);
      ctx.scale(-1, 1);
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = haloColor;
      ctx.textAlign = "center";
      ctx.fillText(j.lbl, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  });

  if (hasValgus && lKn && rKn) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lKn.x, lKn.y);
    ctx.lineTo(rKn.x, rKn.y);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ef4444";
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate((lKn.x + rKn.x) / 2, (lKn.y + rKn.y) / 2 - 16);
    ctx.scale(-1, 1);
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "center";
    ctx.fillText("⚠️ MEDIAL VALGUS COLLAPSE", 0, 0);
    ctx.restore();
  }

  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.radius += 3.5;
    sw.alpha -= 0.045;
    if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
      shockwaves.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, 2 * Math.PI);
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = Math.max(0, sw.alpha);
    ctx.shadowBlur = 16;
    ctx.shadowColor = sw.color;
    ctx.stroke();
    ctx.restore();
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.vy *= 0.94;
    ft.alpha -= 0.022;
    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.translate(ft.x, ft.y);
    ctx.scale(-1, 1);
    ctx.font = "900 20px monospace";
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = Math.max(0, ft.alpha);
    ctx.shadowBlur = 14;
    ctx.shadowColor = ft.color;
    ctx.textAlign = "center";
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.93;
    p.vy *= 0.93;
    p.alpha -= 0.028;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.shadowBlur = 12;
    ctx.shadowColor = p.color;
    ctx.fill();
    ctx.restore();
  }

  projectiles.forEach((orb) => {
    if (!orb.active) return;
    ctx.save();
    const grad = ctx.createRadialGradient(orb.x, orb.y, 2, orb.x, orb.y, orb.radius);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, orb.color);
    grad.addColorStop(0.8, "rgba(244, 63, 94, 0.7)");
    grad.addColorStop(1, "rgba(244, 63, 94, 0)");
    ctx.fillStyle = grad;
    ctx.shadowBlur = 24;
    ctx.shadowColor = orb.color;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius, 0, 2 * Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius + 4, 0, 2 * Math.PI);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(orb.x, orb.y - orb.radius - 8);
    ctx.scale(-1, 1);
    ctx.font = "900 12px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.shadowBlur = 12;
    ctx.shadowColor = orb.color;
    ctx.fillText("✋ SWAT WRIST!", 0, 0);
    ctx.restore();
    ctx.restore();
  });

  if (isClashActive) {
    ctx.save();
    const pulse = Math.sin(timeMs * 0.02) > 0;
    ctx.strokeStyle = pulse ? "rgba(239, 68, 68, 0.9)" : "rgba(245, 158, 11, 0.9)";
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(w * 0.12, h * 0.18, w * 0.76, h * 0.64);

    ctx.save();
    ctx.translate(w / 2, h * 0.28);
    ctx.scale(-1, 1);
    ctx.font = "900 16px monospace";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "center";
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#ef4444";
    ctx.fillText("🚨 LOCK-IN CLASH IN PROGRESS! 🚨", 0, 0);
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`HOLD 4s DEEP SQUAT: ${Math.round(clashProgress * 100)}%`, 0, 24);
    ctx.restore();
    ctx.restore();
  }

  // 3. Ghost Stickman Anchor: Safe Upper-Right Corner HUD (x = canvas.width - 120, y = 80)
  const ghostX = w - 120;
  const ghostY = 80;

  let ghostDepth = 0;
  let ghostPhaseLabel = "DESCENT";
  if (ghostCycleSec < 2.0) {
    ghostDepth = ghostCycleSec / 2.0;
    ghostPhaseLabel = `DESCENT ${(2.0 - ghostCycleSec).toFixed(1)}s`;
  } else if (ghostCycleSec < 3.5) {
    ghostDepth = 1.0;
    ghostPhaseLabel = `HOLD ${(3.5 - ghostCycleSec).toFixed(1)}s`;
  } else {
    ghostDepth = Math.max(0, 1.0 - (ghostCycleSec - 3.5) / 1.0);
    ghostPhaseLabel = `PUSH ${(4.5 - ghostCycleSec).toFixed(1)}s`;
  }

  // Mini holographic pacing stickman anchored at (ghostX, ghostY)
  const gHeadY = ghostY - 28 + ghostDepth * 14;
  const gShoulderY = gHeadY + 12;
  const gHipY = ghostY - 2 + ghostDepth * 14;
  const gKneeX = ghostX - 10 - ghostDepth * 8;
  const gKneeY = ghostY + 16 + ghostDepth * 4;
  const gAnkleX = ghostX;
  const gAnkleY = ghostY + 34;
  const gWristX = ghostX + 12;
  const gWristY = gShoulderY + 10;

  ctx.save();
  const ghostColor = isGhostSync ? "#10b981" : "#00f0ff";
  ctx.strokeStyle = isGhostSync ? "rgba(16, 185, 129, 0.75)" : "rgba(0, 240, 255, 0.65)";
  ctx.lineWidth = 3.0;
  ctx.lineCap = "round";
  ctx.shadowBlur = isGhostSync ? 16 : 10;
  ctx.shadowColor = ghostColor;

  // Head
  ctx.beginPath();
  ctx.arc(ghostX, gHeadY, 8, 0, 2 * Math.PI);
  ctx.stroke();

  // Torso
  ctx.beginPath();
  ctx.moveTo(ghostX, gShoulderY);
  ctx.lineTo(ghostX, gHipY);
  ctx.stroke();

  // Arm
  ctx.beginPath();
  ctx.moveTo(ghostX, gShoulderY);
  ctx.lineTo(gWristX, gWristY);
  ctx.stroke();

  // Upper Leg
  ctx.beginPath();
  ctx.moveTo(ghostX, gHipY);
  ctx.lineTo(gKneeX, gKneeY);
  ctx.stroke();

  // Lower Leg
  ctx.beginPath();
  ctx.moveTo(gKneeX, gKneeY);
  ctx.lineTo(gAnkleX, gAnkleY);
  ctx.stroke();

  // Inner Core
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(ghostX, gShoulderY);
  ctx.lineTo(ghostX, gHipY);
  ctx.lineTo(gKneeX, gKneeY);
  ctx.lineTo(gAnkleX, gAnkleY);
  ctx.stroke();

  // Header & Phase Badge
  ctx.save();
  ctx.translate(ghostX, ghostY - 42);
  ctx.scale(-1, 1);
  ctx.font = "bold 9px monospace";
  ctx.fillStyle = ghostColor;
  ctx.textAlign = "center";
  ctx.fillText("AI GHOST // 4.5s CADENCE", 0, 0);

  ctx.font = "900 9px monospace";
  ctx.fillStyle = isGhostSync ? "#10b981" : "#fbbf24";
  ctx.fillText(isGhostSync ? "✦ SYNCHRONIZED (+25%) ✦" : `[${ghostPhaseLabel}]`, 0, 11);
  ctx.restore();
  ctx.restore();

  if (hazard.type === "HIGH_LASER") {
    const laserY = h * hazard.duckThresholdY;
    const isWarning = hazard.phase === "WARNING";
    const isActive = hazard.phase === "ACTIVE";

    ctx.save();
    if (isWarning) {
      const pulse = Math.sin(timeMs * 0.02) > 0;
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = pulse ? "#ef4444" : "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, laserY);
      ctx.lineTo(w, laserY);
      ctx.stroke();

      ctx.save();
      ctx.translate(w / 2, laserY - 14);
      ctx.scale(-1, 1);
      ctx.font = "900 12px monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#ef4444";
      ctx.fillText("⚠️ INCOMING HIGH LASER // DUCK TO EVADE! ⚠️", 0, 0);
      ctx.restore();
    } else if (isActive) {
      ctx.beginPath();
      ctx.moveTo(0, laserY);
      ctx.lineTo(w, laserY);
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
      ctx.shadowBlur = 25;
      ctx.shadowColor = "#ef4444";
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, laserY);
      ctx.lineTo(w, laserY);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      ctx.save();
      ctx.translate(w / 2, laserY + 22);
      ctx.scale(-1, 1);
      ctx.font = "900 12px monospace";
      ctx.fillStyle = "#10b981";
      ctx.textAlign = "center";
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#10b981";
      ctx.fillText("⬇️ MAINTAIN DUCK POSITION (SAFE ZONE) ⬇️", 0, 0);
      ctx.restore();
    }
    ctx.restore();
  } else if (hazard.type === "LATERAL_BLAST") {
    const isLeft = hazard.side === "LEFT";
    const isWarning = hazard.phase === "WARNING";
    const isActive = hazard.phase === "ACTIVE";
    const zoneX = isLeft ? 0 : w / 2;
    const zoneW = w / 2;

    ctx.save();
    if (isWarning) {
      const alpha = 0.18 + Math.sin(timeMs * 0.015) * 0.1;
      ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.fillRect(zoneX, 0, zoneW, h);

      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(zoneX, 0, zoneW, h);

      ctx.save();
      ctx.translate(zoneX + zoneW / 2, h * 0.28);
      ctx.scale(-1, 1);
      ctx.font = "900 13px monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#ef4444";
      ctx.fillText(`⚠️ MISSILE LOCK: ${isLeft ? "LEFT" : "RIGHT"} ZONE!`, 0, 0);
      ctx.fillText(`SHIFT TO ${isLeft ? "RIGHT" : "LEFT"} NOW!`, 0, 18);
      ctx.restore();
    } else if (isActive) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.45)";
      ctx.fillRect(zoneX, 0, zoneW, h);

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.strokeRect(zoneX, 0, zoneW, h);

      ctx.save();
      ctx.translate(zoneX + zoneW / 2, h * 0.4);
      ctx.scale(-1, 1);
      ctx.font = "900 16px monospace";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#ef4444";
      ctx.fillText("⚡ DETONATION ZONE ⚡", 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(w * 0.5, 28);
  ctx.scale(-1, 1);
  ctx.font = "900 12px monospace";
  ctx.textAlign = "center";
  const comboMult = comboStreak >= 5 ? 2.0 : comboStreak >= 3 ? 1.5 : 1.0;
  if (comboStreak >= 5) {
    ctx.fillStyle = "#fbbf24";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#fbbf24";
    ctx.fillText(`🔥 5x HYPER OVERDRIVE (${comboMult.toFixed(1)}x DMG)`, 0, 0);
  } else if (comboStreak >= 3) {
    ctx.fillStyle = "#38bdf8";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#38bdf8";
    ctx.fillText(`⚡ ${comboStreak}x COMBO SURGE (${comboMult.toFixed(1)}x DMG)`, 0, 0);
  } else if (comboStreak > 1) {
    ctx.fillStyle = "#00f0ff";
    ctx.fillText(`⚡ ${comboStreak}x STREAK (1.0x DMG)`, 0, 0);
  }
  ctx.restore();

  if (comboStreak >= 5 && lWr && rWr) {
    const nose = lms[0];
    const headLevel = nose ? nose.y * h : h * 0.25;
    const isArmsUp = lWr.y < headLevel && rWr.y < headLevel;

    if (isArmsUp || spiritBombProgress > 0) {
      const bombX = (lWr.x + rWr.x) / 2;
      const bombY = Math.min(lWr.y, rWr.y) - 35;
      const radius = 18 + spiritBombProgress * 32;

      ctx.save();
      const grad = ctx.createRadialGradient(bombX, bombY, 5, bombX, bombY, radius);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#ffd700");
      grad.addColorStop(0.8, "rgba(251, 191, 36, 0.7)");
      grad.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = grad;
      ctx.shadowBlur = 25;
      ctx.shadowColor = "#ffd700";
      ctx.beginPath();
      ctx.arc(bombX, bombY, radius, 0, 2 * Math.PI);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(bombX, bombY, radius + 8, -Math.PI / 2, -Math.PI / 2 + spiritBombProgress * 2 * Math.PI);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.save();
      ctx.translate(bombX, bombY - radius - 16);
      ctx.scale(-1, 1);
      ctx.font = "900 13px monospace";
      ctx.fillStyle = "#ffd700";
      ctx.textAlign = "center";
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#ffd700";
      ctx.fillText(`💥 SPIRIT BOMB: ${Math.round(spiritBombProgress * 100)}%`, 0, 0);
      ctx.restore();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface CombatPopup {
  id: number;
  text: string;
  isCrit?: boolean;
  isOverdrive?: boolean;
}

export default function Home() {
  // Navigation Shell State
  const [currentView, setCurrentView] = useState<View>("ARENA");
  const [profile, setProfile] = useState<PlayerProfile>(getProfile());
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [stats, setStats] = useState<AggregatedStats>(getAggregatedStats());
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [selectedMatchLog, setSelectedMatchLog] = useState<MatchRecord | null>(null);

  // Match State
  const [selectedBossId, setSelectedBossId] = useState<string>("goliath");
  const [scriptReady, setScriptReady] = useState(false);
  const [bossHp, setBossHp] = useState<number>(600);
  const [combatPopups, setCombatPopups] = useState<CombatPopup[]>([]);
  const [overdriveGauge, setOverdriveGauge] = useState<number>(0);
  const [isOverdriveFiring, setIsOverdriveFiring] = useState<boolean>(false);
  const [cadenceTime, setCadenceTime] = useState<number>(0);
  const [missionTimeLeft, setMissionTimeLeft] = useState<number>(90.0);
  const [isMeltdown, setIsMeltdown] = useState<boolean>(false);

  // Dynamic Boss Dialogue
  const [bossDialogue, setBossDialogue] = useState<string | null>(null);

  // Boss Interactions
  const [isClashActive, setIsClashActive] = useState<boolean>(false);
  const [clashProgress, setClashProgress] = useState<number>(0);
  const clashHoldStartRef = useRef<number>(0);
  const hasClashedRef = useRef<boolean>(false);
  const projectilesRef = useRef<ProjectileOrb[]>([]);

  // Refs for animation loops & async event handlers
  const bossHpRef = useRef<number>(600);
  useEffect(() => { bossHpRef.current = bossHp; }, [bossHp]);

  const overdriveGaugeRef = useRef<number>(0);
  useEffect(() => { overdriveGaugeRef.current = overdriveGauge; }, [overdriveGauge]);

  const isOverdriveFiringRef = useRef<boolean>(false);
  useEffect(() => { isOverdriveFiringRef.current = isOverdriveFiring; }, [isOverdriveFiring]);

  const lastRepTimestampRef = useRef<number>(0);
  const [circuitBanner, setCircuitBanner] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<CanvasFloatingText[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const curJointRef = useRef<{ x: number; y: number }>({ x: 320, y: 240 });
  const [calibratedRom, setCalibratedRom] = useState<{ squat_min?: number; pushup_min?: number; ohp_max?: number }>({});
  const calibratedRomRef = useRef<{ squat_min?: number; pushup_min?: number; ohp_max?: number }>({});
  const [displayCalibAngle, setDisplayCalibAngle] = useState<number>(180);

  // Combos & Hazards
  const [comboStreak, setComboStreak] = useState<number>(1);
  const comboStreakRef = useRef<number>(1);
  useEffect(() => { comboStreakRef.current = comboStreak; }, [comboStreak]);

  const [spiritBombProgress, setSpiritBombProgress] = useState<number>(0);
  const spiritBombProgressRef = useRef<number>(0);
  useEffect(() => { spiritBombProgressRef.current = spiritBombProgress; }, [spiritBombProgress]);
  const spiritBombHoldStartRef = useRef<number>(0);

  const [hazard, setHazard] = useState<HazardState>({
    type: "NONE",
    phase: "WARNING",
    startTime: 0,
    duration: 4500,
    warningDuration: 1800,
    duckThresholdY: 0.38,
  });
  const hazardRef = useRef<HazardState>(hazard);
  useEffect(() => { hazardRef.current = hazard; }, [hazard]);

  const [isGhostSync, setIsGhostSync] = useState<boolean>(false);
  const ghostTimeRef = useRef<number>(0);

  // Post-match debrief modal state
  const [completedMatchReport, setCompletedMatchReport] = useState<{
    outcome: "VICTORY" | "DEFEAT";
    newAchievements: string[];
  } | null>(null);

  // Game Engine State
  const [game, setGame] = useState({
    stage: "IDLE" as "IDLE" | "CALIBRATING" | "ACTIVE" | "COMPLETED",
    outcome: "VICTORY" as "VICTORY" | "DEFEAT",
    calibrationSeconds: 5,
    autoRestartSeconds: 10,
    exercise: "squat" as ExerciseType,
    difficulty: "standard" as DifficultyTier,
    playerHp: 100,
    playerOverheat: 0,
    bossHp: 600,
    bossAttackTimer: 15.0,
    screenFlash: "NONE" as "NONE" | "HIT" | "PENALTY" | "BOSS_ATTACK",
    wsConnected: false,
    trackedSide: "LEFT" as "LEFT" | "RIGHT",
    engine: INITIAL_ENGINE,
    stats: INITIAL_STATS,
  });

  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const lastRepRef = useRef<number>(0);
  const lastPenaltyRef = useRef<number>(0);
  const hitAwardedRepRef = useRef<number>(-1);

  // Camera & Device Lifecycle Management
  const [cameraStatus, setCameraStatus] = useState<"INITIALIZING" | "ACTIVE" | "ERROR">("INITIALIZING");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stable Refs to prevent camera effect destruction during combat loops
  const currentBossRef = useRef(BOSS_CATALOG[selectedBossId] || BOSS_CATALOG.goliath);
  const profileRef = useRef(profile);
  const isClashActiveRef = useRef(isClashActive);
  const clashProgressRef = useRef(clashProgress);
  const triggerFlashRef = useRef<(type: "HIT" | "PENALTY" | "BOSS_ATTACK") => void>(() => {});
  const triggerCombatPopupRef = useRef<(text: string, isCrit?: boolean, isOverdrive?: boolean) => void>(() => {});
  const fireOverdriveBeamRef = useRef<() => void>(() => {});
  const startCalibrationRef = useRef<(bossId?: string) => void>(() => {});
  const finishMatchRef = useRef<(outcome: "VICTORY" | "DEFEAT") => void>(() => {});
  const triggerBossDialogueRef = useRef<(text: string) => void>(() => {});

  // Load persistent client state on mount
  useEffect(() => {
    setProfile(getProfile());
    setMatchHistory(getMatchHistory());
    setStats(getAggregatedStats());
    setAchievements(getAchievements());
    setLeaderboard(getLeaderboard());
    const storedSettings = getSettings();
    setSettings(storedSettings);
    sfx.setVolume(storedSettings.masterVolume / 100);
    sfx.isMusicMuted = !storedSettings.musicEnabled;
    sfx.isVoiceMuted = !storedSettings.voiceTauntsEnabled;
  }, []);

  const currentBoss = BOSS_CATALOG[selectedBossId] || BOSS_CATALOG.goliath;

  const triggerRumble = useCallback((duration = 180) => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), duration);
  }, []);

  const triggerBossDialogue = useCallback((text: string) => {
    setBossDialogue(text);
    coachSpeak(text);
    setTimeout(() => setBossDialogue(null), 5000);
  }, []);

  const spawnParticles = useCallback((x: number, y: number, colorScheme: string[] = ["#00f2fe", "#10b981", "#ffd700", "#ec4899"]) => {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 6.5;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colorScheme[Math.floor(Math.random() * colorScheme.length)],
        alpha: 1.0,
        radius: 3.5 + Math.random() * 3.5,
        life: 1.0,
      });
    }
  }, []);

  const spawnFloatingText = useCallback((x: number, y: number, text: string, color = "#10b981") => {
    floatingTextsRef.current.push({
      id: Date.now() + Math.random(),
      x,
      y,
      text,
      color,
      alpha: 1.0,
      vy: -2.2,
    });
  }, []);

  const spawnShockwave = useCallback((x: number, y: number, color = "#ffffff") => {
    shockwavesRef.current.push({
      id: Date.now() + Math.random(),
      x,
      y,
      radius: 18,
      maxRadius: 75,
      alpha: 1.0,
      color,
    });
  }, []);

  const triggerFlash = useCallback((type: "HIT" | "PENALTY" | "BOSS_ATTACK") => {
    setGame((prev) => ({ ...prev, screenFlash: type }));
    setTimeout(() => {
      setGame((prev) => ({ ...prev, screenFlash: "NONE" }));
    }, 450);
  }, []);

  const triggerCombatPopup = useCallback((text: string, isCrit = false, isOverdrive = false) => {
    const id = Date.now() + Math.random();
    setCombatPopups((prev) => [...prev.slice(-2), { id, text, isCrit, isOverdrive }]);
    setTimeout(() => {
      setCombatPopups((prev) => prev.filter((p) => p.id !== id));
    }, 1400);
  }, []);

  // Match Conclusion: Updates Local Storage, Unlocks Achievements, Records XP
  const finishMatch = useCallback((outcome: "VICTORY" | "DEFEAT") => {
    const duration = Math.round(90 - missionTimeLeft);
    const totalReps = gameRef.current.stats.totalReps;
    const purityScores = gameRef.current.stats.purityScores;
    const avgPurity = purityScores.length > 0
      ? Math.round(purityScores.reduce((a, b) => a + b, 0) / purityScores.length)
      : Math.round(gameRef.current.engine.purity) || 100;
    const avgSymmetry = gameRef.current.stats.symmetryScores.length > 0
      ? Math.round(gameRef.current.stats.symmetryScores.reduce((a, b) => a + b, 0) / gameRef.current.stats.symmetryScores.length)
      : 98;
    const cadenceAccuracy = totalReps > 0
      ? Math.round((gameRef.current.stats.cadenceBonusReps / totalReps) * 100)
      : 100;

    const score = Math.round(
      totalReps * 200 +
      avgPurity * 50 +
      (outcome === "VICTORY" ? 3000 : 800) +
      cadenceAccuracy * 10
    );

    const { profile: updatedProfile, achievements: updatedAch, newAchievementsUnlocked } = recordMatchResult({
      bossName: currentBoss.name,
      exercise: gameRef.current.exercise,
      result: outcome,
      durationSeconds: Math.max(5, duration),
      reps: totalReps,
      formPurity: avgPurity,
      score,
      symmetry: avgSymmetry,
      valgusWarnings: gameRef.current.stats.valgusWarnings,
      egoPenalties: gameRef.current.stats.egoPenalties,
      maxCombo: comboStreakRef.current,
      cadenceAccuracy,
    });

    setProfile(updatedProfile);
    setAchievements(updatedAch);
    setMatchHistory(getMatchHistory());
    setStats(getAggregatedStats());
    setLeaderboard(getLeaderboard());

    setGame((prev) => ({
      ...prev,
      outcome,
      stage: "COMPLETED",
      autoRestartSeconds: 10,
    }));

    setCompletedMatchReport({
      outcome,
      newAchievements: newAchievementsUnlocked,
    });
  }, [missionTimeLeft, currentBoss]);

  // Kinetic Overdrive Beam Execution
  const fireOverdriveBeam = useCallback(() => {
    if (isOverdriveFiringRef.current || overdriveGaugeRef.current < 100) return;
    setIsOverdriveFiring(true);
    setOverdriveGauge(0);
    sfx.overdriveBeam();
    coachSpeak("Kinetic Overdrive activated! Maximum firepower!");
    triggerCombatPopup("-250 OVERDRIVE!", false, true);

    let ticks = 0;
    const damageInterval = setInterval(() => {
      ticks++;
      setBossHp((prevHp) => {
        const nextHp = Math.max(0, prevHp - 25);
        if (nextHp === 0) {
          finishMatchRef.current("VICTORY");
          sfx.victory();
          coachSpeak("Target neutralized! Overdrive execution flawless.");
        }
        return nextHp;
      });
      triggerFlashRef.current("HIT");
      if (ticks >= 10) {
        clearInterval(damageInterval);
        setIsOverdriveFiring(false);
      }
    }, 300);

    setGame((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        overdriveActivations: prev.stats.overdriveActivations + 1,
      },
    }));
  }, [finishMatch, triggerFlash, triggerCombatPopup]);

  // Start Calibration Buffer & Launch Encounter
  const startCalibration = useCallback((bossId?: string) => {
    const targetBossId = bossId || selectedBossId;
    const targetBoss = BOSS_CATALOG[targetBossId] || BOSS_CATALOG.goliath;
    setSelectedBossId(targetBossId);

    hitAwardedRepRef.current = -1;
    lastRepTimestampRef.current = Date.now();
    setBossHp(targetBoss.hp);
    setOverdriveGauge(0);
    setIsOverdriveFiring(false);
    setCombatPopups([]);
    setCircuitBanner(null);
    setCompletedMatchReport(null);
    calibratedRomRef.current = {};
    setDisplayCalibAngle(180);
    particlesRef.current = [];
    floatingTextsRef.current = [];
    shockwavesRef.current = [];
    projectilesRef.current = [];
    setComboStreak(1);
    setSpiritBombProgress(0);
    setMissionTimeLeft(90.0);
    setIsMeltdown(false);
    setIsClashActive(false);
    setClashProgress(0);
    hasClashedRef.current = false;
    clashHoldStartRef.current = 0;
    setHazard({ type: "NONE", phase: "WARNING", startTime: 0, duration: 4500, warningDuration: 1800, duckThresholdY: 0.38 });

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: "reset" }));
    }

    const countdown = settings.countdownSeconds || 5;

    setGame((prev) => ({
      ...prev,
      stage: "CALIBRATING",
      calibrationSeconds: countdown,
      screenFlash: "NONE",
      bossHp: targetBoss.hp,
      bossAttackTimer: targetBoss.attackInterval,
      playerHp: 100,
    }));
    setCurrentView("ARENA");
    sfx.countdownBeep(440);
    coachSpeak(`Encounter initialized. ${countdown} seconds to calibrate mobility.`);
  }, [selectedBossId, settings.countdownSeconds]);

  // Synchronize dynamic state with stable refs
  useEffect(() => { currentBossRef.current = currentBoss; }, [currentBoss]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { isClashActiveRef.current = isClashActive; }, [isClashActive]);
  useEffect(() => { clashProgressRef.current = clashProgress; }, [clashProgress]);
  useEffect(() => { triggerFlashRef.current = triggerFlash; }, [triggerFlash]);
  useEffect(() => { triggerCombatPopupRef.current = triggerCombatPopup; }, [triggerCombatPopup]);
  useEffect(() => { fireOverdriveBeamRef.current = fireOverdriveBeam; }, [fireOverdriveBeam]);
  useEffect(() => { startCalibrationRef.current = startCalibration; }, [startCalibration]);
  useEffect(() => { finishMatchRef.current = finishMatch; }, [finishMatch]);
  useEffect(() => { triggerBossDialogueRef.current = triggerBossDialogue; }, [triggerBossDialogue]);

  // Resilient MediaPipe Script Detection
  useEffect(() => {
    if (typeof window !== "undefined") {
      if ((window as unknown as { Pose?: unknown }).Pose) {
        setScriptReady(true);
      } else {
        const interval = setInterval(() => {
          if ((window as unknown as { Pose?: unknown }).Pose) {
            setScriptReady(true);
            clearInterval(interval);
          }
        }, 150);
        return () => clearInterval(interval);
      }
    }
  }, []);

  // Re-attach video stream if video element mounts or remounts
  useEffect(() => {
    if (streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
    }
  }, [currentView, cameraStatus]);

  // Immediate Camera Mount: Stream webcam right away so feed is visible without waiting for CDN/MediaPipe
  useEffect(() => {
    let isRunning = true;
    const initWebcam = async () => {
      if (streamRef.current) return;
      try {
        setCameraStatus("INITIALIZING");
        setCameraError(null);
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (!isRunning) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (e) {
            console.warn("Autoplay error:", e);
          }
        }
        setCameraStatus("ACTIVE");
      } catch (err: unknown) {
        console.error("Camera init error:", err);
        setCameraStatus("ERROR");
        setCameraError(err instanceof Error ? err.message : "Camera access denied or device busy");
      }
    };
    initWebcam();
    return () => {
      isRunning = false;
    };
  }, []);

  // Explicit Camera Restart / Recovery Trigger
  const restartCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraStatus("INITIALIZING");
    setCameraError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(console.error);
      }
      setCameraStatus("ACTIVE");
    } catch (err: unknown) {
      console.error("Camera restart failed:", err);
      setCameraStatus("ERROR");
      setCameraError(err instanceof Error ? err.message : "Failed to access camera");
    }
  }, []);

  // Dynamic Rep Cadence Metronome (4s cycle: 2s eccentric descent, 1s isometric hold, 1s concentric push)
  useEffect(() => {
    if (game.stage !== "ACTIVE") return;
    let lastBeat = -1;
    const interval = setInterval(() => {
      setCadenceTime((prev) => {
        const next = (prev + 0.05) % 4.0;
        const currentBeat = Math.floor(next);
        if (currentBeat !== lastBeat) {
          lastBeat = currentBeat;
          if (currentBeat === 0) {
            sfx.metronomeTick(true, false);
          } else if (currentBeat === 2) {
            sfx.metronomeTick(false, false);
          } else if (currentBeat === 3) {
            sfx.metronomeTick(false, true);
          }
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [game.stage]);

  // 90-Second Mission Countdown & Emergency Meltdown Drain Loop
  useEffect(() => {
    if (game.stage !== "ACTIVE") return;

    const interval = setInterval(() => {
      setMissionTimeLeft((prev) => {
        const next = Math.max(0, prev - 0.1);
        if (next <= 0 && !isMeltdown) {
          setIsMeltdown(true);
          sfx.sirenWarning();
          triggerBossDialogue(currentBoss.taunts.meltdown);
          coachSpeak("Warning! Mission time expired! Reactor meltdown active!");
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [game.stage, isMeltdown, currentBoss, triggerBossDialogue]);

  // Meltdown HP Drain (-10 HP / 1.5s when mission timer reaches 0)
  useEffect(() => {
    if (game.stage !== "ACTIVE" || !isMeltdown) return;

    const interval = setInterval(() => {
      sfx.glitchWarning();
      triggerFlashRef.current("PENALTY");
      triggerRumble(200);
      spawnFloatingText(curJointRef.current.x, curJointRef.current.y, "-10 MELTDOWN DRAIN", "#ef4444");

      setGame((prev) => {
        const nextPlayerHp = Math.max(0, prev.playerHp - 10);
        if (nextPlayerHp <= 0) {
          finishMatchRef.current("DEFEAT");
          sfx.defeat();
          coachSpeak("System overwhelmed by reactor meltdown.");
        }
        return { ...prev, playerHp: nextPlayerHp };
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [game.stage, isMeltdown, triggerFlash, triggerRumble, spawnFloatingText, finishMatch]);

  // Calibration Countdown Timer
  useEffect(() => {
    if (game.stage !== "CALIBRATING") return;

    let sec = game.calibrationSeconds;
    const interval = setInterval(() => {
      sec -= 1;
      setGame((prev) => ({ ...prev, calibrationSeconds: sec }));

      if (sec > 0) {
        sfx.countdownBeep(440 + (5 - sec) * 75);
      } else {
        clearInterval(interval);
        sfx.countdownEngage();

        if (socketRef.current?.readyState === WebSocket.OPEN && Object.keys(calibratedRomRef.current).length > 0) {
          socketRef.current.send(JSON.stringify({
            action: "calibrate_rom",
            rom_calibration: calibratedRomRef.current,
          }));
        }
        setCalibratedRom({ ...calibratedRomRef.current });

        lastRepRef.current = gameRef.current.engine.rep_count;
        lastPenaltyRef.current = 0;
        hitAwardedRepRef.current = -1;
        lastRepTimestampRef.current = Date.now();
        setBossHp(currentBossRef.current.hp);

        setGame((prev) => ({
          ...prev,
          stage: "ACTIVE",
          playerHp: 100,
          bossHp: currentBossRef.current.hp,
          playerOverheat: 0,
          bossAttackTimer: currentBossRef.current.attackInterval,
          stats: { ...INITIAL_STATS },
        }));
        triggerBossDialogue(currentBoss.taunts.intro);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [game.stage, currentBoss, triggerBossDialogue]);

  // Boss Attack Loop
  useEffect(() => {
    if (game.stage !== "ACTIVE") return;

    const interval = setInterval(() => {
      setGame((prev) => {
        const nextOverheat = Math.max(0, prev.playerOverheat - 0.5);
        const isEnraged = bossHpRef.current <= currentBossRef.current.hp * 0.4;
        const resetTimer = isEnraged ? currentBossRef.current.attackInterval * 0.5 : currentBossRef.current.attackInterval;

        if (prev.bossAttackTimer <= 0.1) {
          sfx.bossAttack();
          triggerFlash("BOSS_ATTACK");
          coachSpeak("Incoming boss attack!");

          const nextPlayerHp = Math.max(0, prev.playerHp - 20);
          if (nextPlayerHp <= 0) {
            finishMatchRef.current("DEFEAT");
            sfx.defeat();
            coachSpeak("Mission failed. Reboot simulation.");
          }

          return {
            ...prev,
            playerOverheat: nextOverheat,
            playerHp: nextPlayerHp,
            bossAttackTimer: resetTimer,
          };
        }

        return {
          ...prev,
          playerOverheat: nextOverheat,
          bossAttackTimer: Math.max(0, prev.bossAttackTimer - 0.1),
        };
      });
    }, 100);

    return () => clearInterval(interval);
  }, [game.stage, currentBoss, triggerFlash, finishMatch]);

  // Adaptive Web Audio Loop & Boss Enrage Sound Modulation
  useEffect(() => {
    if (game.stage === "ACTIVE" && settings.musicEnabled) {
      sfx.startAdaptiveLoop();
    } else {
      sfx.stopAdaptiveLoop();
    }
    return () => sfx.stopAdaptiveLoop();
  }, [game.stage, settings.musicEnabled]);

  useEffect(() => {
    sfx.setEnraged(bossHp <= currentBossRef.current.hp * 0.4 && bossHp > 0);
  }, [bossHp, currentBoss]);

  // Incoming Plasma Projectile Spawner (Direct Boss Interaction every 13s)
  useEffect(() => {
    if (game.stage !== "ACTIVE" || isClashActive) return;

    const interval = setInterval(() => {
      if (projectilesRef.current.length >= 2) return;
      const canvas = canvasRef.current;
      const w = canvas?.width || 640;
      const h = canvas?.height || 480;

      projectilesRef.current.push({
        id: Date.now(),
        x: w * 0.5 + (Math.random() * 160 - 80),
        y: h * 0.35 + (Math.random() * 60 - 30),
        radius: 10,
        maxRadius: 42,
        color: selectedBossId === "velocity" ? "#38bdf8" : selectedBossId === "chrono" ? "#c084fc" : "#fb923c",
        active: true,
      });

      sfx.tone(480, "sawtooth", 0.2, 0.2);
      coachSpeak("Incoming plasma orb! Swat it away!");
    }, 13000);

    return () => clearInterval(interval);
  }, [game.stage, isClashActive, selectedBossId]);

  // Projectile Expansion & Impact Resolution Tick
  useEffect(() => {
    if (game.stage !== "ACTIVE") return;

    const interval = setInterval(() => {
      for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
        const orb = projectilesRef.current[i];
        if (!orb.active) {
          projectilesRef.current.splice(i, 1);
          continue;
        }

        orb.radius += 0.45;
        if (orb.radius >= orb.maxRadius) {
          orb.active = false;
          projectilesRef.current.splice(i, 1);
          sfx.penalty();
          triggerFlash("BOSS_ATTACK");
          triggerRumble(250);
          spawnFloatingText(curJointRef.current.x, curJointRef.current.y, "-15 ORB IMPACT", "#ef4444");

          setGame((prev) => {
            const nextHp = Math.max(0, prev.playerHp - 15);
            if (nextHp <= 0) {
              finishMatchRef.current("DEFEAT");
              sfx.defeat();
              coachSpeak("Defenses breached by plasma orb.");
            }
            return { ...prev, playerHp: nextHp };
          });
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [game.stage, triggerFlash, triggerRumble, spawnFloatingText, finishMatch]);

  // Environmental Hazards Scheduler
  useEffect(() => {
    if (game.stage !== "ACTIVE" || selectedBossId !== "chrono") {
      setHazard({ type: "NONE", phase: "WARNING", startTime: 0, duration: 4500, warningDuration: 1800, duckThresholdY: 0.38 });
      return;
    }

    let hazardCount = 0;
    const interval = setInterval(() => {
      if (hazardRef.current.type !== "NONE") return;
      hazardCount++;
      const isLaser = hazardCount % 2 === 1;
      const type: "HIGH_LASER" | "LATERAL_BLAST" = isLaser ? "HIGH_LASER" : "LATERAL_BLAST";
      const side: "LEFT" | "RIGHT" = Math.random() > 0.5 ? "LEFT" : "RIGHT";

      setHazard({
        type,
        side,
        phase: "WARNING",
        startTime: Date.now(),
        duration: 4500,
        warningDuration: 1800,
        duckThresholdY: 0.38,
      });

      sfx.sirenWarning();
      coachSpeak(isLaser ? "Warning! Temporal high laser sweep! Duck low!" : `Warning! Lateral missile incoming! Clear the ${side.toLowerCase()} side!`);
    }, 18000);

    return () => clearInterval(interval);
  }, [game.stage, selectedBossId]);

  // MediaPipe Pose & Real-Time Biomechanical Stream
  useEffect(() => {
    if (!scriptReady || !window.Pose) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/pose";
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => setGame((prev) => ({ ...prev, wsConnected: true }));
    socket.onerror = () => setGame((prev) => ({ ...prev, wsConnected: false }));
    socket.onclose = () => setGame((prev) => ({ ...prev, wsConnected: false }));

    socket.onmessage = (event) => {
      try {
        const data: BioEnginePayload = JSON.parse(event.data);

        if (data.circuit_banner && data.circuit_banner !== circuitBanner) {
          setCircuitBanner(data.circuit_banner);
          coachSpeak(data.circuit_banner);
          sfx.fanfareChord();
          triggerRumble(350);
          setTimeout(() => setCircuitBanner(null), 5500);
        }

        if (data.event === "CIRCUIT_PHASE_ADVANCE") {
          triggerCombatPopupRef.current("PHASE CLEARED!", true, true);
          sfx.cadenceBonus();
          triggerRumble(250);
        }

        if (data.voice_cue && gameRef.current.stage === "ACTIVE") {
          coachSpeak(data.voice_cue);
        }

        const isRepComplete = data.event === "REP_COMPLETE" || (typeof data.rep_count === "number" && data.rep_count > lastRepRef.current);
        const hasDamage = typeof data.damage === "number" && data.damage > 0;
        const isHitEvent = hasDamage && (data.status === "CRITICAL HIT!" || data.status === "hit");

        if (gameRef.current.stage === "IDLE" && (isRepComplete || isHitEvent)) {
          setGame((prev) => ({ ...prev, stage: "ACTIVE" }));
        }

        if (gameRef.current.stage === "CALIBRATING") {
          lastRepRef.current = data.rep_count;
          setGame((prev) => ({ ...prev, engine: data }));
          return;
        }

        const isHold = data.phase.includes("HOLD") || data.phase === "LOCKOUT";

        if (overdriveGaugeRef.current >= 100 && !isOverdriveFiringRef.current && isHold && (data.hold_time >= 2.5 || data.hold_progress >= 0.95)) {
          fireOverdriveBeamRef.current();
        }

        const shouldDamageBoss = isRepComplete || (hasDamage && hitAwardedRepRef.current !== data.rep_count);

        if (shouldDamageBoss) {
          hitAwardedRepRef.current = data.rep_count;
          const now = Date.now();
          const repDuration = (now - lastRepTimestampRef.current) / 1000;
          lastRepTimestampRef.current = now;

          const isCadenceSync = (repDuration >= 2.8 && repDuration <= 5.8) && (data.hold_time >= 0.7 || isHold);
          const baseDamage = (hasDamage ? data.damage : 100) || 100;
          const cadenceDamage = isCadenceSync ? Math.round(baseDamage * 1.5) : baseDamage;

          const curCombo = comboStreakRef.current;
          const comboMult = curCombo >= 5 ? 2.0 : curCombo >= 3 ? 1.5 : 1.0;
          const dailyStreakBonus = Math.min(50, profileRef.current.streak * 10);
          const dailyMult = 1 + (dailyStreakBonus / 100);

          const finalDamage = Math.round(cadenceDamage * comboMult * dailyMult);
          const popupText = curCombo >= 5
            ? `-${finalDamage} (2.0x OVERDRIVE!)`
            : curCombo >= 3
            ? `-${finalDamage} (1.5x SURGE!)`
            : isCadenceSync ? `-${finalDamage} CRIT!` : `-${finalDamage} DMG`;

          setBossHp((prevHp) => {
            const nextHp = Math.max(0, prevHp - finalDamage);

            if (!hasClashedRef.current && nextHp <= currentBossRef.current.hp * 0.5 && nextHp > 0) {
              hasClashedRef.current = true;
              setIsClashActive(true);
              clashHoldStartRef.current = 0;
              sfx.sirenWarning();
              triggerBossDialogueRef.current(currentBossRef.current.taunts.clash);
              coachSpeak("Boss clash initiated! Hold a deep squat for 4 seconds to push back!");
            }

            if (nextHp <= currentBossRef.current.hp * 0.4 && prevHp > currentBossRef.current.hp * 0.4) {
              triggerBossDialogueRef.current(currentBossRef.current.taunts.enrage);
            }

            if (nextHp === 0) {
              finishMatchRef.current("VICTORY");
              sfx.victory();
              coachSpeak("Target neutralized! Excellent form.");
            }
            return nextHp;
          });

          sfx.impactGlide();
          sfx.bassDrop();
          if (isCadenceSync) {
            sfx.cadenceBonus();
            coachSpeak("Cadence sync! Critical hit!");
          } else {
            sfx.hit();
          }

          triggerRumble(isCadenceSync ? 250 : 150);
          triggerFlashRef.current("HIT");
          triggerCombatPopupRef.current(popupText, isCadenceSync, curCombo >= 5);
          spawnParticles(
            curJointRef.current.x,
            curJointRef.current.y,
            isCadenceSync ? ["#ffd700", "#10b981", "#38bdf8", "#f43f5e"] : ["#38bdf8", "#06b6d4", "#10b981", "#a855f7"]
          );
          spawnShockwave(curJointRef.current.x, curJointRef.current.y, isCadenceSync ? "#ffd700" : "#ffffff");
          spawnFloatingText(
            curJointRef.current.x,
            curJointRef.current.y,
            `+${finalDamage}`,
            isCadenceSync ? "#fbbf24" : "#10b981"
          );

          if (data.purity >= 70 && !data.fault_detected) {
            setOverdriveGauge((prev) => Math.min(100, prev + 25));
            setComboStreak((prev) => {
              const next = Math.min(5, prev + 1);
              if (next === 5) {
                triggerBossDialogueRef.current(currentBossRef.current.taunts.hit5x);
              }
              return next;
            });
          }
        }

        setGame((prev) => {
          let nextPlayerHp = prev.playerHp;
          let nextOverheat = prev.playerOverheat;
          let nextBossTimer = prev.bossAttackTimer;
          const nextStats = { ...prev.stats };

          if (typeof data.symmetry === "number") {
            nextStats.symmetryScores = [...prev.stats.symmetryScores, data.symmetry];
          }

          if (data.valgus || data.fault_name === "VALGUS") {
            nextStats.valgusWarnings += 1;
            if (comboStreakRef.current > 1) {
              triggerBossDialogueRef.current(currentBossRef.current.taunts.comboBreak);
            }
            setComboStreak(1);
          }

          if (isRepComplete && data.rep_count > lastRepRef.current) {
            lastRepRef.current = data.rep_count;
            nextStats.totalReps += 1;
            nextStats.purityScores = [...prev.stats.purityScores, data.purity];
            nextStats.depthAngles = [...prev.stats.depthAngles, data.primary_angle];
            nextStats.holdTimes = [...prev.stats.holdTimes, data.hold_time || 1.2];
            const isCrit = (data.damage || 100) >= 80;
            const nextStreak = isCrit ? prev.stats.currentCritStreak + 1 : 0;
            nextStats.currentCritStreak = nextStreak;
            nextStats.maxConsecutiveCrits = Math.max(prev.stats.maxConsecutiveCrits, nextStreak);

            const now = Date.now();
            const repDuration = (now - lastRepTimestampRef.current) / 1000;
            const isCadenceSync = (repDuration >= 2.8 && repDuration <= 5.8) && (data.hold_time >= 0.7 || isHold);
            if (isCadenceSync) {
              nextStats.cadenceBonusReps = prev.stats.cadenceBonusReps + 1;
            }

            const isEnraged = bossHpRef.current <= currentBossRef.current.hp * 0.4;
            nextBossTimer = isEnraged ? currentBossRef.current.attackInterval * 0.5 : currentBossRef.current.attackInterval;
          }

          if (data.status === "penalty") {
            const now = Date.now();
            if (now - lastPenaltyRef.current > 2000) {
              lastPenaltyRef.current = now;
              sfx.penalty();
              sfx.glitchWarning();
              triggerRumble(300);
              triggerFlashRef.current("PENALTY");
              spawnParticles(curJointRef.current.x, curJointRef.current.y, ["#ef4444", "#dc2626", "#b91c1c", "#f87171"]);
              spawnShockwave(curJointRef.current.x, curJointRef.current.y, "#ef4444");
              spawnFloatingText(curJointRef.current.x, curJointRef.current.y, "! EGO LIFT", "#ef4444");

              nextStats.egoPenalties += 1;
              nextStats.currentCritStreak = 0;
              if (comboStreakRef.current > 1) {
                triggerBossDialogueRef.current(currentBossRef.current.taunts.comboBreak);
              }
              setComboStreak(1);
              nextOverheat = 100;
              nextPlayerHp = Math.max(0, prev.playerHp - 25);

              if (nextPlayerHp <= 0) {
                finishMatchRef.current("DEFEAT");
                sfx.defeat();
                coachSpeak("System critical. You have been defeated.");
              }
            }
          }

          return {
            ...prev,
            playerHp: nextPlayerHp,
            playerOverheat: nextOverheat,
            bossAttackTimer: nextBossTimer,
            engine: data,
            stats: nextStats,
          };
        });
      } catch (err) {
        console.error("Pose socket parse error:", err);
      }
    };

    const pose = new window.Pose({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results: PoseResults) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas) return;

      // 2. Landmark Coordinate Normalization: Sync internal drawing buffer with display size
      if (video && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {
        const lms = results.poseLandmarks;
        const lSh = lms[11], rSh = lms[12];
        const lHp = lms[23], rHp = lms[24];
        const lAnk = lms[27], rAnk = lms[28];

        const leftVis = ((lHp?.visibility ?? 0) + (lms[25]?.visibility ?? 0) + (lAnk?.visibility ?? 0) + (lSh?.visibility ?? 0)) / 4;
        const rightVis = ((rHp?.visibility ?? 0) + (lms[26]?.visibility ?? 0) + (rAnk?.visibility ?? 0) + (rSh?.visibility ?? 0)) / 4;
        const curSide = rightVis > leftVis + 0.15 ? "RIGHT" : "LEFT";
        if (gameRef.current.trackedSide !== curSide) {
          setGame((prev) => ({ ...prev, trackedSide: curSide }));
        }

        const activeEx = gameRef.current.engine.exercise || gameRef.current.exercise;
        if (canvas) {
          if (activeEx === "squat") {
            const k = curSide === "RIGHT" ? lms[26] : lms[25];
            if (k) curJointRef.current = { x: k.x * canvas.width, y: k.y * canvas.height };
          } else if (activeEx === "pushup" || activeEx === "overhead_press") {
            const w = curSide === "RIGHT" ? lms[16] : lms[15];
            const e = curSide === "RIGHT" ? lms[14] : lms[13];
            const pt = w || e;
            if (pt) curJointRef.current = { x: pt.x * canvas.width, y: pt.y * canvas.height };
          } else {
            const h = curSide === "RIGHT" ? rHp : lHp;
            if (h) curJointRef.current = { x: h.x * canvas.width, y: h.y * canvas.height };
          }
        }

        if (gameRef.current.stage === "CALIBRATING") {
          const ex = gameRef.current.exercise === "circuit" ? "squat" : gameRef.current.exercise;
          if (ex === "squat") {
            const k = curSide === "RIGHT" ? lms[26] : lms[25];
            const h = curSide === "RIGHT" ? rHp : lHp;
            const a = curSide === "RIGHT" ? rAnk : lAnk;
            if (k && h && a) {
              const v1 = { x: h.x - k.x, y: h.y - k.y, z: (h.z || 0) - (k.z || 0) };
              const v2 = { x: a.x - k.x, y: a.y - k.y, z: (a.z || 0) - (k.z || 0) };
              const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
              const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
              const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
              if (mag1 > 0 && mag2 > 0) {
                const deg = Math.round(Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI));
                if (deg < (calibratedRomRef.current.squat_min || 180) && deg >= 50) {
                  calibratedRomRef.current.squat_min = deg;
                  setDisplayCalibAngle(deg);
                }
              }
            }
          }
        }

        const pack = (lm?: Landmark) => (lm ? [lm.x, lm.y, lm.z ?? 0, lm.visibility ?? 1] : null);
        const canStream = Boolean(lSh || rSh || lHp || rHp);
        if (canStream && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              exercise: gameRef.current.exercise,
              difficulty: gameRef.current.difficulty,
              rom_calibration: calibratedRomRef.current,
              left: {
                shoulder: pack(lms[11]), elbow: pack(lms[13]), wrist: pack(lms[15]),
                hip: pack(lHp), knee: pack(lms[25]), ankle: pack(lAnk),
                ear: pack(lms[7]),
              },
              right: {
                shoulder: pack(lms[12]), elbow: pack(lms[14]), wrist: pack(lms[16]),
                hip: pack(rHp), knee: pack(lms[26]), ankle: pack(rAnk),
                ear: pack(lms[8]),
              },
            })
          );
        }

        if (isClashActiveRef.current) {
          const kneeAngle = gameRef.current.engine.knee_angle ?? 180;
          const isHoldingClash = kneeAngle <= 95 || gameRef.current.engine.phase.includes("HOLD");

          if (isHoldingClash) {
            if (clashHoldStartRef.current === 0) clashHoldStartRef.current = Date.now();
            const holdElapsed = (Date.now() - clashHoldStartRef.current) / 1000;
            const progress = Math.min(1.0, holdElapsed / 4.0);
            setClashProgress(progress);

            if (progress >= 1.0) {
              setIsClashActive(false);
              clashHoldStartRef.current = 0;
              setClashProgress(0);
              sfx.fanfareChord();
              sfx.bassDrop();
              triggerRumble(500);
              triggerFlashRef.current("HIT");
              triggerCombatPopupRef.current("⚔️ CLASH WON! -150 DMG!", true, true);
              spawnFloatingText(curJointRef.current.x, curJointRef.current.y, "COUNTER-STRIKE +150", "#10b981");
              spawnParticles(curJointRef.current.x, curJointRef.current.y, ["#10b981", "#ffd700", "#38bdf8", "#ffffff"]);
              spawnShockwave(curJointRef.current.x, curJointRef.current.y, "#10b981");

              setBossHp((prev) => {
                const nextHp = Math.max(0, prev - 150);
                if (nextHp === 0) {
                  finishMatchRef.current("VICTORY");
                  sfx.victory();
                  coachSpeak("Boss neutralized by massive counter-strike!");
                }
                return nextHp;
              });
              coachSpeak("Lock-in clash victorious! Massive counter-strike delivered!");
            }
          } else {
            clashHoldStartRef.current = 0;
            setClashProgress(0);
          }
        }

        if (canvas) {
          const lWrLm = lms[15], rWrLm = lms[16];
          const lWrPx = lWrLm ? { x: lWrLm.x * canvas.width, y: lWrLm.y * canvas.height } : null;
          const rWrPx = rWrLm ? { x: rWrLm.x * canvas.width, y: rWrLm.y * canvas.height } : null;

          projectilesRef.current.forEach((orb) => {
            if (!orb.active) return;
            const checkDeflect = (wr: { x: number; y: number } | null) => {
              if (!wr) return false;
              const dist = Math.hypot(wr.x - orb.x, wr.y - orb.y);
              return dist < orb.radius + 35;
            };

            if (checkDeflect(lWrPx) || checkDeflect(rWrPx)) {
              orb.active = false;
              sfx.deflect();
              sfx.bassDrop();
              triggerRumble(200);
              triggerFlashRef.current("HIT");
              triggerCombatPopupRef.current("PROJECTILE DEFLECTED! +75", true, false);
              spawnFloatingText(orb.x, orb.y, "DEFLECTED +75", "#38bdf8");
              spawnParticles(orb.x, orb.y, ["#38bdf8", "#00f0ff", "#ffffff", "#f43f5e"]);
              spawnShockwave(orb.x, orb.y, "#38bdf8");

              setBossHp((prev) => Math.max(0, prev - 75));
              setOverdriveGauge((prev) => Math.min(100, prev + 20));
              coachSpeak("Projectile deflected! High-speed counter!");
            }
          });
        }

        const nowMs = performance.now();
        const ghostCycle = (nowMs / 1000) % 4.5;
        ghostTimeRef.current = ghostCycle;

        let ghostDepthRatio = 0;
        if (ghostCycle < 2.0) {
          ghostDepthRatio = ghostCycle / 2.0;
        } else if (ghostCycle < 3.5) {
          ghostDepthRatio = 1.0;
        } else {
          ghostDepthRatio = Math.max(0, 1.0 - (ghostCycle - 3.5) / 1.0);
        }

        const playerAngle = gameRef.current.engine.primary_angle ?? 180;
        const playerDepthRatio = Math.max(0, Math.min(1.0, (180 - playerAngle) / (180 - 85)));
        const isSync = Math.abs(playerDepthRatio - ghostDepthRatio) <= 0.12 && playerDepthRatio > 0.25;
        setIsGhostSync(isSync);

        const isHoldingSquat = gameRef.current.engine.phase.includes("HOLD") || (gameRef.current.engine.knee_angle ?? 180) <= 95;
        sfx.setMuffled(isHoldingSquat);

        if (hazardRef.current.type !== "NONE") {
          const now = Date.now();
          const elapsed = now - hazardRef.current.startTime;
          const total = hazardRef.current.duration;
          const warn = hazardRef.current.warningDuration;

          if (elapsed >= total) {
            setHazard((prev) => ({ ...prev, type: "NONE" }));
          } else if (elapsed >= warn && hazardRef.current.phase === "WARNING") {
            setHazard((prev) => ({ ...prev, phase: "ACTIVE" }));
          } else if (hazardRef.current.phase === "ACTIVE") {
            if (hazardRef.current.type === "HIGH_LASER") {
              const nose = lms[0];
              const isDucked = (nose && nose.y > hazardRef.current.duckThresholdY) || (gameRef.current.engine.knee_angle ?? 180) <= 115;

              if (isDucked) {
                setHazard((prev) => ({ ...prev, phase: "CLEARED" }));
                sfx.dodgeSuccess();
                sfx.bassDrop();
                triggerRumble(200);
                triggerFlashRef.current("HIT");
                triggerCombatPopupRef.current("LASER EVADED! +150", true, false);
                spawnFloatingText(curJointRef.current.x, curJointRef.current.y, "PARRIED +150", "#10b981");
                setBossHp((prev) => Math.max(0, prev - 150));
                setOverdriveGauge((prev) => Math.min(100, prev + 25));
                coachSpeak("Laser parried! Excellent evasion!");
              } else if (elapsed >= warn + 1600) {
                setHazard((prev) => ({ ...prev, phase: "FAILED" }));
                sfx.penalty();
                sfx.glitchWarning();
                triggerRumble(350);
                triggerFlashRef.current("PENALTY");
                spawnFloatingText(curJointRef.current.x, curJointRef.current.y, "-30 LASER HIT", "#ef4444");
                setGame((prev) => {
                  const nextHp = Math.max(0, prev.playerHp - 30);
                  if (nextHp <= 0) {
                    finishMatchRef.current("DEFEAT");
                    sfx.defeat();
                    coachSpeak("Laser strike fatal. Reboot arena.");
                  }
                  return { ...prev, playerHp: nextHp };
                });
                setComboStreak(1);
              }
            }
          }
        }

        if (ctx && canvas) {
          drawVisuals(
            ctx,
            canvas.width,
            canvas.height,
            lms,
            gameRef.current.engine,
            gameRef.current.engine.exercise || gameRef.current.exercise,
            curSide,
            particlesRef.current,
            floatingTextsRef.current,
            shockwavesRef.current,
            projectilesRef.current,
            nowMs,
            hazardRef.current,
            ghostCycle,
            isSync,
            comboStreakRef.current,
            spiritBombProgressRef.current,
            bossHpRef.current <= currentBossRef.current.hp * 0.4 && bossHpRef.current > 0,
            isClashActiveRef.current,
            clashProgressRef.current
          );
        }
      }
    });

    let isRunning = true;
    let localStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        let stream = streamRef.current;
        if (!stream) {
          setCameraStatus("INITIALIZING");
          setCameraError(null);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
          if (!isRunning) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
        }
        localStream = stream;

        if (videoRef.current) {
          if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
          }
          try {
            await videoRef.current.play();
          } catch (e) {
            console.warn("Video play error:", e);
          }
        }

        setCameraStatus("ACTIVE");

        let isProcessing = false;
        const processFrame = async () => {
          if (!isRunning) return;
          if (
            videoRef.current &&
            videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            !isProcessing
          ) {
            isProcessing = true;
            try {
              await pose.send({ image: videoRef.current });
            } catch (err) {
              console.error("Frame error:", err);
            } finally {
              isProcessing = false;
            }
          }
          if (isRunning) {
            animationFrameId.current = requestAnimationFrame(processFrame);
          }
        };
        processFrame();
      } catch (err: unknown) {
        console.error("Camera access failed:", err);
        setCameraStatus("ERROR");
        setCameraError(err instanceof Error ? err.message : "Camera access denied or device busy");
      }
    };

    startCamera();

    return () => {
      isRunning = false;
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      try { pose.close(); } catch { /* noop */ }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    };
  }, [scriptReady]);

  const isEgoLift = game.engine.status === "penalty" || game.engine.phase === "STUNNED";
  const isCriticalHit = game.engine.status === "hit" || game.engine.status === "CRITICAL HIT!" || Boolean(game.engine.damage > 0);
  const isHolding = game.engine.phase.includes("HOLD") || game.engine.phase === "LOCKOUT";
  const isBossEnraged = bossHp <= currentBossRef.current.hp * 0.4 && bossHp > 0;
  const isBossDefeated = bossHp <= 0;

  const exercises = [
    { id: "circuit" as ExerciseType, label: "BOUNTY CIRCUIT", weapon: "TITAN ONSLAUGHT", icon: "⚔️", damage: "CIRCUIT 3x5" },
    { id: "squat" as ExerciseType, label: "SQUATS", weapon: "KINETIC QUAKE", icon: "🏋️‍♂️", damage: "100 DMG" },
    { id: "pushup" as ExerciseType, label: "PUSH-UPS", weapon: "REPULSOR BLAST", icon: "💪", damage: "90 DMG" },
    { id: "overhead_press" as ExerciseType, label: "OVERHEAD PRESS", weapon: "PLASMA BEAM", icon: "⚡", damage: "80 DMG" },
    { id: "rdl" as ExerciseType, label: "ROMANIAN DEADLIFT", weapon: "TACTICAL HINGE", icon: "🎯", damage: "110 DMG" },
  ];

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />

      <style jsx global>{`
        @keyframes screenRumble {
          0% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(-3px, 2px) rotate(-0.5deg); }
          40% { transform: translate(3px, -2px) rotate(0.5deg); }
          60% { transform: translate(-2px, -1px) rotate(-0.3deg); }
          80% { transform: translate(2px, 1px) rotate(0.3deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        .animate-rumble {
          animation: screenRumble 0.15s ease-in-out infinite;
        }
      `}</style>

      {circuitBanner && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-[92%] bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 text-black font-mono font-black text-sm sm:text-lg px-6 py-3 rounded-2xl border-4 border-white shadow-[0_0_50px_rgba(250,204,21,1)] animate-bounce text-center uppercase tracking-wider flex items-center justify-center gap-3 pointer-events-none">
          <span className="text-2xl animate-pulse">⚔️</span>
          <span>{circuitBanner}</span>
          <span className="text-2xl animate-pulse">⚔️</span>
        </div>
      )}

      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-3 sm:p-6 select-none font-sans relative overflow-x-hidden">

        {/* ----------------------------------------------------------------- */}
        {/* GLOBAL NAVIGATION HEADER & STATUS STRIP (Zero Visual Clutter)     */}
        {/* ----------------------------------------------------------------- */}
        <header className="w-full max-w-5xl mb-4 bg-slate-900/95 border border-slate-800 rounded-xl p-3 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView("ARENA")}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center text-sm shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              ⚡
            </div>
            <div>
              <div className="font-mono font-black text-xs sm:text-sm tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
                ATHLETEMIND
              </div>
              <div className="text-[9px] font-mono text-slate-400 tracking-wider -mt-0.5">
                CYBER-SUITE // LVL {profile.level} {profile.rankTitle.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Tab Routing Strip */}
          <nav className="flex items-center gap-1 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-none">
            {(
              [
                { id: "ARENA", label: "ARENA", icon: "⚔️" },
                { id: "PROFILE", label: "PROFILE", icon: "👤" },
                { id: "STATS", label: "STATS", icon: "📊" },
                { id: "LEADERBOARD", label: "RANKS", icon: "🏆" },
                { id: "MATCH_HISTORY", label: "LOGS", icon: "📜" },
                { id: "SETTINGS", label: "SETTINGS", icon: "⚙️" },
              ] as { id: View; label: string; icon: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  currentView === tab.id
                    ? "bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Quick Stats Pill */}
          <div className="hidden md:flex items-center gap-2 font-mono text-xs">
            <div className="bg-amber-950/80 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold">
              <span>🔥</span>
              <span>{profileRef.current.streak}d Streak</span>
            </div>
            <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-lg font-bold">
              ⚡ {profile.bioCredits} Credits
            </div>
          </div>
        </header>

        {/* ----------------------------------------------------------------- */}
        {/* VIEW 1: ARENA (Combat Simulation & Biomechanical Telemetry)       */}
        {/* ----------------------------------------------------------------- */}
        <section className={`w-full max-w-5xl flex flex-col items-center animate-fadeIn ${currentView === "ARENA" ? "flex" : "hidden"}`}>
            
            {/* BOSS SELECTION BAR */}
            <div className="w-full mb-3 flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">TARGET:</span>
                {Object.values(BOSS_CATALOG).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      if (game.stage !== "ACTIVE") setSelectedBossId(b.id);
                    }}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedBossId === b.id
                        ? `${b.borderColor} ${b.badgeColor} shadow-[0_0_10px_rgba(255,255,255,0.15)]`
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <span>{b.avatar}</span>
                    <span>{b.name}</span>
                    <span className="text-[10px] opacity-75">({b.hp} HP)</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">LOADOUT:</span>
                {exercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setGame((prev) => ({ ...prev, exercise: ex.id }))}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      game.exercise === ex.id
                        ? "bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TOP ARENA HUD */}
            <div className="w-full mb-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-2xl backdrop-blur-md">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                
                {/* Player Bio-Harness */}
                <div className="md:col-span-4 flex flex-col gap-1">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      {profile.handle}
                    </span>
                    <span className="font-bold text-white">{game.playerHp} / 100 HP</span>
                  </div>

                  <div className="w-full bg-slate-950 h-4 rounded-lg overflow-hidden border border-slate-800 relative">
                    <div
                      className={`h-full transition-all duration-300 ${
                        game.playerHp > 50
                          ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                          : game.playerHp > 25
                          ? "bg-gradient-to-r from-yellow-600 to-amber-400"
                          : "bg-gradient-to-r from-red-700 to-rose-500 animate-pulse"
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, game.playerHp))}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] font-mono mt-0.5">
                    <span className="text-amber-400 font-bold">
                      ⚡ OVERDRIVE: {overdriveGauge}%
                      {overdriveGauge >= 100 && <span className="ml-1 text-yellow-300 animate-pulse">(READY!)</span>}
                    </span>
                    <span className="text-slate-400">Streak +{Math.min(50, profileRef.current.streak * 10)}% DMG</span>
                  </div>
                </div>

                {/* Center 90s Mission Clock */}
                <div className="md:col-span-4 flex flex-col items-center justify-center text-center py-1 bg-slate-950/60 rounded-xl border border-slate-800/80 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-400">MISSION CLOCK:</span>
                    <span className={`font-mono font-black text-lg tracking-wider ${
                      isMeltdown
                        ? "text-red-500 animate-ping"
                        : missionTimeLeft < 20
                        ? "text-rose-400 animate-pulse"
                        : "text-yellow-400"
                    }`}>
                      {Math.floor(missionTimeLeft / 60).toString().padStart(2, "0")}:
                      {Math.floor(missionTimeLeft % 60).toString().padStart(2, "0")}
                    </span>
                  </div>

                  {isMeltdown ? (
                    <div className="text-[10px] font-mono text-red-400 font-black tracking-wider uppercase animate-pulse mt-0.5">
                      ⚠️ REACTOR MELTDOWN (-10 HP/1.5s)
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-slate-400 tracking-wider uppercase mt-0.5">
                      BARRAGE: <span className="text-red-400 font-bold">{game.bossAttackTimer.toFixed(1)}s</span>
                    </div>
                  )}
                </div>

                {/* Boss Core */}
                <div className="md:col-span-4 flex flex-col gap-1 relative">
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 w-full flex flex-col items-center pointer-events-none z-50">
                    {combatPopups.map((popup) => (
                      <div
                        key={popup.id}
                        className={`font-mono font-black text-lg sm:text-2xl tracking-wider transition-all duration-700 ease-out animate-bounce ${
                          popup.isOverdrive
                            ? "text-yellow-300 drop-shadow-[0_0_25px_rgba(250,204,21,1)] scale-125"
                            : popup.isCrit
                            ? "text-emerald-300 drop-shadow-[0_0_18px_rgba(110,231,183,1)]"
                            : "text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                        }`}
                      >
                        {popup.text}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="font-bold text-purple-400 flex items-center gap-1.5">
                      {currentBoss.avatar} {currentBoss.name}
                    </span>
                    <span className="font-bold text-white">{bossHp} / {currentBossRef.current.hp} HP</span>
                  </div>

                  <div className="w-full bg-slate-950 h-4 rounded-lg overflow-hidden border border-slate-800 relative">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isBossEnraged
                          ? "bg-gradient-to-r from-red-600 via-rose-500 to-purple-600 animate-pulse"
                          : `bg-gradient-to-r ${currentBoss.color}`
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, (bossHp / currentBossRef.current.hp) * 100))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono mt-0.5">
                    <span className="text-slate-400">STATUS:</span>
                    {isBossDefeated ? (
                      <span className="text-zinc-500 font-bold">DEFEATED</span>
                    ) : isBossEnraged ? (
                      <span className="text-red-400 font-bold animate-ping">🔥 OVERDRIVE</span>
                    ) : (
                      <span className="text-purple-400 font-semibold">{currentBoss.tag}</span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* DYNAMIC BOSS BANTER */}
            {bossDialogue && (
              <div className="w-full mb-3 bg-purple-950/80 border border-purple-400/80 p-2.5 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.3)] flex items-center justify-center gap-3 animate-bounce">
                <span className="text-xl">{currentBoss.avatar}</span>
                <span className="font-mono font-bold text-xs sm:text-sm text-purple-200 uppercase tracking-wide">
                  &ldquo;{bossDialogue}&rdquo;
                </span>
                <span className="text-xl">{currentBoss.avatar}</span>
              </div>
            )}

            {/* CADENCE METRONOME */}
            <div className="w-full mb-3 bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 shadow-xl backdrop-blur-md">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-1.5 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-bold">CADENCE METRONOME:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    cadenceTime < 2.0
                      ? "bg-cyan-950 text-cyan-300 border border-cyan-500/40"
                      : cadenceTime < 3.0
                      ? "bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse"
                      : "bg-emerald-950 text-emerald-300 border border-emerald-500/40"
                  }`}>
                    {cadenceTime < 2.0 ? "⬇️ 2s ECCENTRIC DESCENT" : cadenceTime < 3.0 ? "⏸️ 1s ISOMETRIC PAUSE" : "⬆️ 1s CONCENTRIC EXPLODE"}
                  </span>
                </div>
                <div className="text-[10px] text-yellow-300 font-bold">
                  ⚡ CADENCE SYNC = +50% CRITICAL HIT DAMAGE
                </div>
              </div>

              <div className="w-full bg-slate-950 h-3 rounded-lg overflow-hidden border border-slate-800 relative flex">
                <div className="w-1/2 h-full bg-cyan-950/40 border-r border-slate-800 flex items-center justify-center text-[9px] font-mono text-cyan-400 font-bold">
                  2.0s DESCENT
                </div>
                <div className="w-1/4 h-full bg-amber-950/40 border-r border-slate-800 flex items-center justify-center text-[9px] font-mono text-amber-400 font-bold">
                  1.0s HOLD
                </div>
                <div className="w-1/4 h-full bg-emerald-950/40 flex items-center justify-center text-[9px] font-mono text-emerald-400 font-bold">
                  1.0s PUSH
                </div>

                <div
                  className="absolute top-0 bottom-0 w-2 bg-yellow-300 shadow-[0_0_10px_rgba(253,224,71,1)] rounded pointer-events-none transition-all duration-75 ease-linear"
                  style={{ left: `calc(${(cadenceTime / 4.0) * 100}% - 4px)` }}
                />
              </div>
            </div>

            {/* COMBAT BANNER */}
            <div className="w-full mb-3">
              {isEgoLift ? (
                <div className="bg-red-950/90 border border-red-500 rounded-xl p-2.5 text-center shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse">
                  <div className="text-base font-black text-red-400 uppercase tracking-wider font-mono">
                    ⚠️ FORM VIOLATION DETECTED!
                  </div>
                  <div className="text-xs font-mono text-red-300 font-bold">
                    {game.engine.fault_name || "RAPID REPS"} &bull; -25 HP &bull; WEAPON OVERHEATED
                  </div>
                </div>
              ) : isCriticalHit ? (
                <div className="bg-emerald-950/90 border border-emerald-400 rounded-xl p-2.5 text-center shadow-[0_0_20px_rgba(16,185,129,0.5)] animate-bounce">
                  <div className="text-base font-black text-yellow-300 uppercase tracking-wider font-mono">
                    ⚡ CRITICAL HIT! (+{game.engine.damage || 100} DMG)
                  </div>
                  <div className="text-xs font-mono text-emerald-300 font-bold">
                    {game.engine.coach_feedback || "BIOMECHANICALLY PURE FORM CONFIRMED!"}
                  </div>
                </div>
              ) : isHolding ? (
                <div className="bg-slate-900/90 border border-amber-400 rounded-xl p-2.5 text-center">
                  <div className="text-sm font-black text-amber-400 uppercase tracking-wider font-mono">
                    ⏳ HOLD DEPTH... ({game.engine.hold_time.toFixed(1)}s)
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mt-1 border border-slate-700">
                    <div
                      className="bg-amber-400 h-full transition-all duration-100 ease-out"
                      style={{ width: `${Math.round(game.engine.hold_progress * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-2.5 text-center text-slate-300 font-mono text-xs shadow-md">
                  <span className="text-cyan-400 font-bold">VOICE COACH:</span>{" "}
                  {game.wsConnected
                    ? game.engine.coach_feedback || "READY FOR ENGAGEMENT"
                    : "CONNECTING TO BIO-ENGINE..."}
                </div>
              )}
            </div>

            {/* VIDEO & CANVAS VIEWPORT */}
            <div className={`relative w-[640px] h-[480px] rounded-2xl overflow-hidden shadow-2xl bg-black mb-4 border ${
              isBossEnraged
                ? "border-rose-500 shadow-[0_0_60px_rgba(244,63,94,0.9)] ring-4 ring-rose-500/80 animate-pulse"
                : isOverdriveFiring
                ? "border-yellow-400 shadow-[0_0_50px_rgba(234,179,8,0.8)] scale-[1.01]"
                : isShaking
                ? "border-yellow-400 ring-4 ring-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.6)] animate-rumble"
                : "border-slate-800"
            } transition-transform duration-75`}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-0"
              />
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none scale-x-[-1] z-10"
              />

              {/* Camera Status & Reconnect Overlay (Non-blocking, zero pitch-black obstruction) */}
              {cameraStatus === "ERROR" && (
                <div className="absolute inset-0 z-40 bg-slate-950/92 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                  <div className="text-3xl mb-2 animate-bounce">📹⚠️</div>
                  <div className="text-rose-400 font-mono font-bold text-sm mb-1 tracking-wider">OPTICAL SENSOR OFFLINE</div>
                  <div className="text-slate-400 font-mono text-xs max-w-sm mb-4">
                    {cameraError || "Camera access was denied or device is occupied by another application."}
                  </div>
                  <button
                    onClick={restartCamera}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-mono font-bold text-xs shadow-[0_0_20px_rgba(6,182,212,0.5)] transition-all cursor-pointer flex items-center gap-2"
                  >
                    <span>⚡</span> RECONNECT OPTICAL SENSOR
                  </button>
                </div>
              )}

              {cameraStatus === "INITIALIZING" && (
                <div className="absolute top-4 left-4 z-30 bg-slate-950/85 border border-cyan-500/40 px-3 py-1.5 rounded-lg backdrop-blur-sm flex items-center gap-2 pointer-events-none shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                  <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-cyan-300 font-mono font-bold text-[11px] tracking-wider animate-pulse">
                    SYNCHRONIZING OPTICAL SENSOR...
                  </span>
                </div>
              )}

              <div className="absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400 pointer-events-none z-20" />
              <div className="absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400 pointer-events-none z-20" />
              <div className="absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400 pointer-events-none z-20" />
              <div className="absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400 pointer-events-none z-20" />

              {/* Flash Overlays */}
              {game.screenFlash === "PENALTY" && (
                <div className="absolute inset-0 border-8 border-red-600 bg-red-600/30 animate-pulse pointer-events-none" />
              )}
              {game.screenFlash === "BOSS_ATTACK" && (
                <div className="absolute inset-0 border-8 border-purple-600 bg-purple-600/30 animate-pulse pointer-events-none" />
              )}
              {game.screenFlash === "HIT" && (
                <div className="absolute inset-0 border-8 border-emerald-400 bg-emerald-400/20 pointer-events-none animate-pulse" />
              )}

              {/* Overdrive Beam */}
              {isOverdriveFiring && (
                <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/30 via-yellow-400/50 to-amber-500/30 animate-pulse" />
                  <div className="w-full h-16 bg-gradient-to-b from-yellow-200 via-amber-400 to-yellow-100 shadow-[0_0_100px_rgba(251,191,36,1)] opacity-95 animate-pulse flex items-center justify-center">
                    <span className="font-mono font-black text-xl sm:text-2xl text-black tracking-widest animate-ping">
                      ⚡ OVERDRIVE BEAM ACTIVATED ⚡
                    </span>
                  </div>
                </div>
              )}

              {/* Calibration Overlay */}
              {game.stage === "CALIBRATING" && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center z-30 pointer-events-none animate-fadeIn">
                  <div className="relative flex flex-col items-center">
                    <div className="absolute w-44 h-44 rounded-full border border-cyan-500/30 animate-ping" />
                    <div className="text-7xl sm:text-8xl font-black font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-cyan-200 via-teal-300 to-emerald-400 drop-shadow-[0_0_30px_rgba(34,211,238,0.8)] animate-pulse">
                      {game.calibrationSeconds > 0 ? game.calibrationSeconds : "ENGAGE!"}
                    </div>

                    <div className="mt-3 px-3 py-1 rounded-full bg-slate-900/90 border border-cyan-500/80 font-mono text-[11px] font-bold text-cyan-300 uppercase tracking-widest">
                      STRETCH TO DEEPEST COMFORTABLE DEPTH
                    </div>
                    <div className="mt-1.5 px-3 py-0.5 rounded-xl bg-emerald-950/85 border border-emerald-400 text-xs font-mono font-bold text-emerald-300">
                      🎯 ROM DEPTH: {displayCalibAngle < 170 ? `${displayCalibAngle}° (Calibrated)` : "Stretching..."}
                    </div>
                  </div>
                </div>
              )}

              {/* Viewport Action Controls */}
              <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                {game.stage === "IDLE" ? (
                  <button
                    onClick={() => startCalibration()}
                    className="bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-black font-mono text-xs font-black px-4 py-2 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.6)] cursor-pointer transition-all transform hover:scale-105"
                  >
                    ⚔️ ENGAGE BATTLE
                  </button>
                ) : (
                  <button
                    onClick={() => startCalibration()}
                    className="bg-slate-900/85 hover:bg-slate-800 text-slate-300 font-mono text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-700/80 cursor-pointer"
                  >
                    🔄 REBOOT
                  </button>
                )}
              </div>
            </div>

            {/* TELEMETRY METRIC CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 w-full">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-center shadow-md">
                <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-0.5">REPS</div>
                <div className="text-2xl font-black text-emerald-400 font-mono">{game.engine.rep_count}</div>
                <div className="text-[9px] text-slate-500 font-mono">Biometrics</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-center shadow-md">
                <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-0.5">PURITY</div>
                <div className={`text-2xl font-black font-mono ${game.engine.purity >= 85 ? "text-emerald-400" : game.engine.purity >= 60 ? "text-amber-400" : "text-red-400"}`}>
                  {Math.round(game.engine.purity)}%
                </div>
                <div className="text-[9px] text-slate-500 font-mono">Kinematics</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-center shadow-md">
                <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-0.5">SYMMETRY</div>
                <div className="text-2xl font-black text-teal-400 font-mono">
                  {typeof game.engine.symmetry === "number" ? `${Math.round(game.engine.symmetry)}%` : "100%"}
                </div>
                <div className="text-[9px] text-slate-500 font-mono">L/R Balance</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-center shadow-md">
                <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-0.5">CADENCE</div>
                <div className="text-2xl font-black text-yellow-400 font-mono">{game.stats.cadenceBonusReps}</div>
                <div className="text-[9px] text-slate-500 font-mono">Tempo Sync</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-center shadow-md">
                <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-0.5">{game.engine.primary_label}</div>
                <div className="text-2xl font-black text-cyan-400 font-mono">{Math.round(game.engine.primary_angle)}°</div>
                <div className="text-[9px] text-slate-500 font-mono">Primary Axis</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-center shadow-md">
                <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-0.5">{game.engine.secondary_label}</div>
                <div className="text-2xl font-black text-indigo-400 font-mono">{Math.round(game.engine.secondary_angle)}°</div>
                <div className="text-[9px] text-slate-500 font-mono">Secondary Axis</div>
              </div>
            </div>

          </section>

        {/* ----------------------------------------------------------------- */}
        {/* VIEW 2: PROFILE & ACHIEVEMENTS VIEW                               */}
        {/* ----------------------------------------------------------------- */}
        {currentView === "PROFILE" && (
          <section className="w-full max-w-4xl flex flex-col items-center animate-fadeIn py-2">
            {/* Player Hero Card */}
            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                    🛡️
                  </div>
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40 uppercase mb-1">
                      {profile.rankTitle}
                    </div>
                    <h2 className="text-2xl font-mono font-black text-white tracking-wider">
                      {profile.handle}
                    </h2>
                    <div className="text-xs font-mono text-slate-400">Level {profile.level} Bio-Runner</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono text-center">
                  <div className="bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl">
                    <div className="text-xs text-slate-400">STREAK</div>
                    <div className="text-xl font-black text-amber-400">🔥 {profileRef.current.streak} Days</div>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl">
                    <div className="text-xs text-slate-400">CREDITS</div>
                    <div className="text-xl font-black text-emerald-400">⚡ {profile.bioCredits}</div>
                  </div>
                </div>
              </div>

              {/* XP Progression Bar */}
              <div className="mt-6">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-slate-400">LEVEL PROGRESSION:</span>
                  <span className="text-cyan-300 font-bold">{profile.xp} / {profile.xpToNextLevel} XP ({Math.round((profile.xp / profile.xpToNextLevel) * 100)}%)</span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500 shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                    style={{ width: `${Math.min(100, (profile.xp / profile.xpToNextLevel) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Achievements Grid */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <span>🏆</span>
                  <span>BIOMECHANICAL ACHIEVEMENTS</span>
                </h3>
                <span className="text-xs font-mono text-slate-500">
                  {achievements.filter((a) => a.unlocked).length} / {achievements.length} UNLOCKED
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {achievements.map((ach) => (
                  <div
                    key={ach.id}
                    className={`p-4 rounded-xl border transition-all ${
                      ach.unlocked
                        ? "bg-slate-900/90 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                        : "bg-slate-950/60 border-slate-800 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`text-2xl p-2 rounded-lg ${ach.unlocked ? "bg-emerald-500/20" : "bg-slate-800"}`}>
                        {ach.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className={`font-mono font-bold text-xs uppercase ${ach.unlocked ? "text-emerald-300" : "text-slate-400"}`}>
                            {ach.title}
                          </h4>
                          <span className={`text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded ${
                            ach.unlocked ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-slate-800 text-slate-500"
                          }`}>
                            {ach.unlocked ? "UNLOCKED" : "LOCKED"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-1 leading-snug">
                          {ach.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* VIEW 3: STATS VIEW                                                */}
        {/* ----------------------------------------------------------------- */}
        {currentView === "STATS" && (
          <section className="w-full max-w-4xl flex flex-col items-center animate-fadeIn py-2">
            <div className="w-full text-left mb-4">
              <h2 className="text-xl font-mono font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>📊</span>
                <span>AGGREGATED COMBAT TELEMETRY</span>
              </h2>
              <div className="text-xs font-mono text-slate-400">Lifetime performance metrics & kinematic fidelity</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mb-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-center shadow-lg">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">TOTAL REPS</div>
                <div className="text-3xl font-black font-mono text-emerald-400 mt-1">{stats.totalReps}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">Completed Lifetime</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-center shadow-lg">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">CAREER PURITY</div>
                <div className="text-3xl font-black font-mono text-cyan-400 mt-1">{stats.careerPurityIndex}%</div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">Kinematic Accuracy</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-center shadow-lg">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">BOSS TAKEDOWNS</div>
                <div className="text-3xl font-black font-mono text-purple-400 mt-1">{stats.totalBossTakedowns}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">Core Neutralizations</div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-center shadow-lg">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">WIN RATIO</div>
                <div className="text-3xl font-black font-mono text-yellow-400 mt-1">
                  {stats.totalMatches > 0 ? Math.round((stats.victories / stats.totalMatches) * 100) : 100}%
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">{stats.victories}W - {stats.defeats}L</div>
              </div>
            </div>

            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3 font-mono text-xs shadow-lg">
              <div className="text-sm font-bold text-teal-300 uppercase tracking-wider">Detailed Biomechanical Log:</div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Total Active Battle Duration:</span>
                <span className="font-bold text-white">{Math.floor(stats.totalBattleTimeSeconds / 60)}m {stats.totalBattleTimeSeconds % 60}s</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Total Critical Strikes Landed:</span>
                <span className="font-bold text-amber-300">{stats.totalCrits} Crits</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Total Projectiles & Attacks Parried:</span>
                <span className="font-bold text-cyan-300">{stats.totalParries} Parries</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Daily Streak Status:</span>
                <span className="font-bold text-amber-400">🔥 {profileRef.current.streak} Days Active</span>
              </div>
            </div>
          </section>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* VIEW 4: LEADERBOARD VIEW                                          */}
        {/* ----------------------------------------------------------------- */}
        {currentView === "LEADERBOARD" && (
          <section className="w-full max-w-4xl flex flex-col items-center animate-fadeIn py-2">
            <div className="w-full text-left mb-4">
              <h2 className="text-xl font-mono font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>🏆</span>
                <span>GLOBAL BIO-RUNNER LEADERBOARD</span>
              </h2>
              <div className="text-xs font-mono text-slate-400">Ranked by combat score & kinematic purity</div>
            </div>

            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                      <th className="p-3 text-center">RANK</th>
                      <th className="p-3">RUNNER</th>
                      <th className="p-3">BOSS DEFEATED</th>
                      <th className="p-3 text-center">PURITY</th>
                      <th className="p-3 text-center">TIME</th>
                      <th className="p-3 text-right">SCORE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {leaderboard.map((entry) => (
                      <tr
                        key={`${entry.rank}_${entry.player}`}
                        className={`transition-colors ${
                          entry.isPlayer
                            ? "bg-cyan-950/60 font-bold text-cyan-200 border-l-4 border-l-cyan-400"
                            : "hover:bg-slate-800/40 text-slate-300"
                        }`}
                      >
                        <td className="p-3 text-center font-black">
                          {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                        </td>
                        <td className="p-3 flex items-center gap-2">
                          <span>{entry.player}</span>
                          {entry.isPlayer && (
                            <span className="bg-cyan-400 text-black px-1.5 py-0.2 rounded font-black text-[9px]">YOU</span>
                          )}
                        </td>
                        <td className="p-3 text-purple-300">{entry.bossDefeated}</td>
                        <td className="p-3 text-center text-emerald-400">{entry.purity}%</td>
                        <td className="p-3 text-center text-slate-400">{entry.timeFormatted}</td>
                        <td className="p-3 text-right font-black text-amber-300">{entry.score.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* VIEW 5: MATCH HISTORY & LOGS                                      */}
        {/* ----------------------------------------------------------------- */}
        {currentView === "MATCH_HISTORY" && (
          <section className="w-full max-w-4xl flex flex-col items-center animate-fadeIn py-2">
            <div className="w-full text-left mb-4">
              <h2 className="text-xl font-mono font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>📜</span>
                <span>MATCH HISTORY ARCHIVE</span>
              </h2>
              <div className="text-xs font-mono text-slate-400">Previous encounters & kinematic telemetry logs</div>
            </div>

            {matchHistory.length === 0 ? (
              <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-8 text-center font-mono text-xs text-slate-400">
                No battle records logged yet. Enter the Arena to engage your first cyber-colossus!
              </div>
            ) : (
              <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="p-3">DATE</th>
                        <th className="p-3">TARGET</th>
                        <th className="p-3">RESULT</th>
                        <th className="p-3 text-center">REPS</th>
                        <th className="p-3 text-center">PURITY</th>
                        <th className="p-3 text-right">SCORE</th>
                        <th className="p-3 text-center">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {matchHistory.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-800/40 text-slate-300">
                          <td className="p-3 text-slate-400 text-[11px]">{m.formattedDate}</td>
                          <td className="p-3 font-bold text-purple-300">{m.bossName}</td>
                          <td className="p-3 font-black">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              m.result === "VICTORY"
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40"
                                : "bg-red-950 text-red-300 border border-red-500/40"
                            }`}>
                              {m.result}
                            </span>
                          </td>
                          <td className="p-3 text-center text-white font-bold">{m.reps}</td>
                          <td className="p-3 text-center text-cyan-300 font-bold">{m.formPurity}%</td>
                          <td className="p-3 text-right text-amber-300 font-black">{m.score.toLocaleString()}</td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setSelectedMatchLog(m)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-cyan-300 cursor-pointer transition-all"
                            >
                              VIEW LOG
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* VIEW 6: SETTINGS VIEW                                             */}
        {/* ----------------------------------------------------------------- */}
        {currentView === "SETTINGS" && (
          <section className="w-full max-w-3xl flex flex-col items-center animate-fadeIn py-2">
            <div className="w-full text-left mb-4">
              <h2 className="text-xl font-mono font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>⚙️</span>
                <span>SYSTEM CONFIGURATION</span>
              </h2>
              <div className="text-xs font-mono text-slate-400">Audio sliders, kinematics sensitivity, and data cache</div>
            </div>

            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-5 font-mono text-xs shadow-xl">
              
              {/* Audio Controls */}
              <div>
                <h3 className="font-bold text-cyan-400 uppercase tracking-wider mb-3">Audio Subsystems:</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Master Volume:</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settings.masterVolume}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          const next = { ...settings, masterVolume: val };
                          setSettings(next);
                          saveSettings(next);
                          sfx.setVolume(val / 100);
                        }}
                        className="w-32 accent-cyan-400"
                      />
                      <span className="w-8 text-right font-bold">{settings.masterVolume}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Procedural Synth Music Loop:</span>
                    <button
                      onClick={() => {
                        const next = { ...settings, musicEnabled: !settings.musicEnabled };
                        setSettings(next);
                        saveSettings(next);
                        sfx.isMusicMuted = !next.musicEnabled;
                      }}
                      className={`px-3 py-1 rounded-lg font-bold ${
                        settings.musicEnabled ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {settings.musicEnabled ? "ENABLED" : "DISABLED"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Voice Taunts & Coach Audio:</span>
                    <button
                      onClick={() => {
                        const next = { ...settings, voiceTauntsEnabled: !settings.voiceTauntsEnabled };
                        setSettings(next);
                        saveSettings(next);
                        sfx.isVoiceMuted = !next.voiceTauntsEnabled;
                      }}
                      className={`px-3 py-1 rounded-lg font-bold ${
                        settings.voiceTauntsEnabled ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {settings.voiceTauntsEnabled ? "ENABLED" : "DISABLED"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <h3 className="font-bold text-cyan-400 uppercase tracking-wider mb-3">Kinematics & Calibration:</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Calibration Countdown Duration:</span>
                    <div className="flex items-center gap-1.5">
                      {([3, 5, 10] as const).map((sec) => (
                        <button
                          key={sec}
                          onClick={() => {
                            const next = { ...settings, countdownSeconds: sec };
                            setSettings(next);
                            saveSettings(next);
                          }}
                          className={`px-3 py-1 rounded-lg font-bold text-xs ${
                            settings.countdownSeconds === sec
                              ? "bg-cyan-500 text-black shadow-md"
                              : "bg-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Squat Depth Sensitivity Threshold:</span>
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: "rehab", label: "Rehab (100°)" },
                          { id: "standard", label: "Standard (90°)" },
                          { id: "olympic", label: "Olympic (75°)" },
                        ] as const
                      ).map((lvl) => (
                        <button
                          key={lvl.id}
                          onClick={() => {
                            const next = { ...settings, squatDepthSensitivity: lvl.id };
                            setSettings(next);
                            saveSettings(next);
                          }}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                            settings.squatDepthSensitivity === lvl.id
                              ? "bg-purple-500 text-black shadow-md"
                              : "bg-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4 flex justify-between items-center">
                <div>
                  <div className="font-bold text-red-400 uppercase tracking-wider">Data Persistence Reset:</div>
                  <div className="text-[11px] text-slate-500">Clear profile, streaks, and match archives</div>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to reset all profile stats, streak, and match history?")) {
                      resetAllData();
                      setProfile(getProfile());
                      setMatchHistory(getMatchHistory());
                      setStats(getAggregatedStats());
                      setAchievements(getAchievements());
                      setLeaderboard(getLeaderboard());
                      alert("Client data cache wiped successfully.");
                    }
                  }}
                  className="px-4 py-2 bg-red-950/80 hover:bg-red-900 border border-red-500 text-red-300 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  RESET PROFILE CACHE
                </button>
              </div>

            </div>
          </section>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* MODAL 1: POST-MATCH DEBRIEF MODAL                                 */}
        {/* ----------------------------------------------------------------- */}
        {completedMatchReport && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className={`bg-slate-900 border-2 ${
              completedMatchReport.outcome === "VICTORY" ? "border-emerald-500 shadow-[0_0_60px_rgba(16,185,129,0.3)]" : "border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.3)]"
            } rounded-2xl p-6 max-w-lg w-full text-center relative`}>
              <div className="text-3xl mb-2">
                {completedMatchReport.outcome === "VICTORY" ? "🏆" : "💥"}
              </div>
              <h3 className={`text-2xl font-mono font-black uppercase tracking-wider ${
                completedMatchReport.outcome === "VICTORY" ? "text-emerald-400" : "text-red-500"
              }`}>
                {completedMatchReport.outcome === "VICTORY" ? `${currentBoss.name} NEUTRALIZED` : "MISSION COMPROMISED"}
              </h3>
              <p className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-widest">
                Match Telemetry Logged to Database
              </p>

              {completedMatchReport.newAchievements.length > 0 && (
                <div className="bg-yellow-950/80 border border-yellow-500/50 p-3 rounded-xl my-4 text-left font-mono text-xs text-yellow-300">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <span>🌟</span>
                    <span>ACHIEVEMENTS UNLOCKED:</span>
                  </div>
                  {completedMatchReport.newAchievements.map((ach) => (
                    <div key={ach} className="text-[11px] text-white font-semibold">&bull; {ach}</div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-5 font-mono text-xs font-bold">
                <button
                  onClick={() => {
                    setCompletedMatchReport(null);
                    setCurrentView("MATCH_HISTORY");
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  VIEW MATCH LOGS
                </button>
                <button
                  onClick={() => {
                    setCompletedMatchReport(null);
                    setCurrentView("PROFILE");
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-purple-500/40 bg-purple-950/80 text-purple-300 cursor-pointer"
                >
                  VIEW PROFILE & XP
                </button>
                <button
                  onClick={() => startCalibration()}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-black font-black uppercase tracking-wider cursor-pointer"
                >
                  FIGHT AGAIN
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* MODAL 2: MATCH TELEMETRY DETAIL DRAWER                            */}
        {/* ----------------------------------------------------------------- */}
        {selectedMatchLog && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-slate-900 border border-teal-500/60 rounded-2xl p-6 max-w-xl w-full shadow-2xl relative font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div>
                  <h3 className="font-black text-lg text-teal-300 uppercase">
                    MATCH TELEMETRY BREAKDOWN
                  </h3>
                  <div className="text-[10px] text-slate-400">ID: {selectedMatchLog.id} &bull; {selectedMatchLog.formattedDate}</div>
                </div>
                <button
                  onClick={() => setSelectedMatchLog(null)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                >
                  ✕ CLOSE
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400">Target:</span>
                  <div className="font-bold text-purple-300 text-sm">{selectedMatchLog.bossName}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400">Result:</span>
                  <div className={`font-black text-sm ${selectedMatchLog.result === "VICTORY" ? "text-emerald-400" : "text-red-400"}`}>
                    {selectedMatchLog.result}
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400">Clean Reps:</span>
                  <div className="font-black text-white text-sm">{selectedMatchLog.reps} Reps</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400">Form Purity:</span>
                  <div className="font-black text-cyan-300 text-sm">{selectedMatchLog.formPurity}%</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400">Bilateral Balance:</span>
                  <div className="font-black text-teal-400 text-sm">{selectedMatchLog.symmetry}%</div>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400">Cadence Accuracy:</span>
                  <div className="font-black text-yellow-400 text-sm">{selectedMatchLog.cadenceAccuracy}%</div>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-[11px] mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Combat Score:</span>
                  <span className="font-black text-amber-300">{selectedMatchLog.score.toLocaleString()} PTS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Valgus Collapses Flagged:</span>
                  <span className={selectedMatchLog.valgusWarnings === 0 ? "text-emerald-400" : "text-red-400"}>
                    {selectedMatchLog.valgusWarnings} events
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ego Lift Penalties:</span>
                  <span className={selectedMatchLog.egoPenalties === 0 ? "text-emerald-400" : "text-red-400"}>
                    {selectedMatchLog.egoPenalties} penalties
                  </span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setSelectedMatchLog(null)}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl uppercase tracking-wider cursor-pointer"
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
