"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";

// ---------------------------------------------------------------------------
// Biomechanical & Pose Types
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

type ExerciseType = "squat" | "pushup" | "overhead_press" | "rdl" | "circuit";
type DifficultyTier = "rehab" | "standard" | "athlete";

interface BioEnginePayload {
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

interface EncounterStats {
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
}

interface GameState {
  stage: "IDLE" | "CALIBRATING" | "ACTIVE" | "COMPLETED";
  outcome: "VICTORY" | "DEFEAT";
  calibrationSeconds: number;
  autoRestartSeconds: number;
  exercise: ExerciseType;
  difficulty: DifficultyTier;
  playerHp: number;
  playerOverheat: number;
  bossHp: number;
  bossAttackTimer: number;
  screenFlash: "NONE" | "HIT" | "PENALTY" | "BOSS_ATTACK";
  wsConnected: boolean;
  trackedSide: "LEFT" | "RIGHT";
  engine: BioEnginePayload;
  stats: EncounterStats;
}

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
};

// ---------------------------------------------------------------------------
// Native Web Audio & Voice Coach Singletons
// ---------------------------------------------------------------------------

class SoundFX {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx?.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  tone(freq: number, type: OscillatorType, duration: number, gainVal = 0.2, delay = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
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

  metronomeTick(isAccent = false, isChime = false) {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (isChime) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1320, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    } else if (isAccent) {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(920, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(620, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.035);
    }
  }

  impactGlide() {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.2);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  glitchWarning() {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [110, 116.5].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  fanfareChord() {
    const ctx = this.getContext();
    if (!ctx) return;
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
      gain.connect(ctx.destination);
      osc.start(t + idx * 0.04);
      osc.stop(t + 1.1);
    });
  }

  overdriveBeam() {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.8);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 2.5);
  }
}

const sfx = new SoundFX();

const coachSpeak = (text: string) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.15;
  utt.pitch = 1.05;
  window.speechSynthesis.speak(utt);
};

// ---------------------------------------------------------------------------
// Canvas 3D Skeleton Rendering
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
  timeMs: number
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
  const isHit = engine.status === "hit" || engine.status === "CRITICAL HIT!";
  const isHold = engine.phase.includes("HOLD") || engine.phase === "LOCKOUT" || (activeEx === "squat" && (engine.knee_angle ?? 180) <= 95);
  const isFault = hasValgus || engine.fault_detected || engine.status === "penalty" || engine.phase === "STUNNED";

  // Dynamic Neon Cyberpunk Palette
  const haloColor = isFault ? "#ef4444" : isHold ? "#10b981" : "#00f0ff";
  const laserColor = isFault ? "rgba(239, 68, 68, 0.85)" : isHold ? "rgba(16, 185, 129, 0.85)" : "rgba(0, 240, 255, 0.85)";
  const armLaserColor = isFault ? "rgba(239, 68, 68, 0.85)" : isHold ? "rgba(16, 185, 129, 0.85)" : "rgba(56, 189, 248, 0.85)";

  // 1. Kinematic Laser Bones
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

    // High-energy white laser core
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.restore();
  };

  // Connect Spine (mid-shoulder to mid-hip)
  if (lSh && rSh && lHp && rHp) {
    const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
    const midHp = { x: (lHp.x + rHp.x) / 2, y: (lHp.y + rHp.y) / 2 };
    drawLaserBone(midSh, midHp, "rgba(148, 163, 184, 0.85)");
    drawLaserBone(lSh, rSh, "rgba(6, 182, 212, 0.85)");
    drawLaserBone(lHp, rHp, "rgba(6, 182, 212, 0.85)");
  }

  if (isFront && lHp && rHp) {
    // Frontal Bilateral Chains
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
    // Sagittal / Profile Dominant Chain
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

  // 2. Dynamic Cyberpunk Skeleton & Joint Halos
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

    // Glowing Neon Ring
    ctx.beginPath();
    ctx.arc(j.p.x, j.p.y, 7, 0, 2 * Math.PI);
    ctx.strokeStyle = haloColor;
    ctx.lineWidth = isHold ? 2.5 : 2;
    ctx.stroke();

    // Expanding pulse animation on hold / lock state
    if (isHold && j.isPrimary) {
      const pulseR = 8 + Math.sin(timeMs * 0.01) * 3.5;
      ctx.beginPath();
      ctx.arc(j.p.x, j.p.y, pulseR, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Inner solid core dot
    ctx.beginPath();
    ctx.arc(j.p.x, j.p.y, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = isFault ? "#ffffff" : isHold ? "#ecfdf5" : "#ffffff";
    ctx.fill();

    // Mirror-corrected font rendering for legible text under CSS scale-x-[-1]
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

  // Valgus Collapsing Warning Line
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

  // 3. Rep Target "Lock-On" Reticle
  const targetJoint = (activeEx === "squat")
    ? (isRightSide ? (rKn || lKn) : (lKn || rKn))
    : (activeEx === "overhead_press")
    ? (isRightSide ? (rWr || lWr) : (lWr || rWr))
    : (activeEx === "pushup")
    ? (isRightSide ? (rEl || lEl) : (lEl || rEl))
    : (isRightSide ? (rHp || lHp) : (lHp || rHp));

  if (targetJoint) {
    const rx = targetJoint.x;
    const ry = targetJoint.y;
    const reticleR = 22;
    const bSize = 6;
    const reticleColor = isFault ? "#ef4444" : isHold ? "#10b981" : "#00f0ff";

    ctx.save();
    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = reticleColor;

    // 4 Corner Sci-Fi Brackets
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(rx - reticleR, ry - reticleR + bSize);
    ctx.lineTo(rx - reticleR, ry - reticleR);
    ctx.lineTo(rx - reticleR + bSize, ry - reticleR);
    ctx.stroke();
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(rx + reticleR - bSize, ry - reticleR);
    ctx.lineTo(rx + reticleR, ry - reticleR);
    ctx.lineTo(rx + reticleR, ry - reticleR + bSize);
    ctx.stroke();
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(rx - reticleR, ry + reticleR - bSize);
    ctx.lineTo(rx - reticleR, ry + reticleR);
    ctx.lineTo(rx - reticleR + bSize, ry + reticleR);
    ctx.stroke();
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(rx + reticleR - bSize, ry + reticleR);
    ctx.lineTo(rx + reticleR, ry + reticleR);
    ctx.lineTo(rx + reticleR, ry + reticleR - bSize);
    ctx.stroke();

    // Clockwise Circular Arc Progress Ring (0 to 360 deg mapped to holdProgress)
    const holdProgress = Math.max(0, Math.min(1, engine.hold_progress || 0));
    if (holdProgress > 0 || isHold) {
      ctx.beginPath();
      ctx.arc(rx, ry, reticleR + 4, -Math.PI / 2, -Math.PI / 2 + holdProgress * 2 * Math.PI);
      ctx.strokeStyle = isHold ? "#10b981" : "#fbbf24";
      ctx.lineWidth = 3;
      ctx.shadowBlur = 14;
      ctx.shadowColor = isHold ? "#10b981" : "#fbbf24";
      ctx.stroke();

      // Mirror-corrected percentage text
      ctx.save();
      ctx.translate(rx, ry - 32);
      ctx.scale(-1, 1);
      ctx.font = "900 11px monospace";
      ctx.fillStyle = isHold ? "#10b981" : "#fbbf24";
      ctx.textAlign = "center";
      ctx.fillText(isHold ? `LOCKED 100%` : `HOLD ${Math.round(holdProgress * 100)}%`, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // 4. Expanding Shockwaves on Rep Hits / Hold Clears
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

  // 5. Floating Rep Impact Numbers (Floating Combat Text on Canvas)
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.vy *= 0.94;
    ft.alpha -= 0.022; // ~800ms fade at 60fps
    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.translate(ft.x, ft.y);
    ctx.scale(-1, 1); // Un-mirror for crisp, forward-reading typography
    ctx.font = "900 20px monospace";
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = Math.max(0, ft.alpha);
    ctx.shadowBlur = 14;
    ctx.shadowColor = ft.color;
    ctx.textAlign = "center";
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }

  // 6. Radiating Combat Particle System
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

  // Fault watermark
  if (engine.fault_detected && !hasValgus) {
    ctx.save();
    ctx.translate(w / 2, h - 25);
    ctx.scale(-1, 1);
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "center";
    ctx.fillText(`⚠️ FAULT: ${engine.fault_name}`, 0, 0);
    ctx.restore();
  }
}

// Backward compatibility alias
const drawSkeleton = drawVisuals;

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
  const [scriptReady, setScriptReady] = useState(false);
  const [bossHp, setBossHp] = useState<number>(500);
  const [combatPopups, setCombatPopups] = useState<CombatPopup[]>([]);
  const [overdriveGauge, setOverdriveGauge] = useState<number>(0);
  const [isOverdriveFiring, setIsOverdriveFiring] = useState<boolean>(false);
  const [cadenceTime, setCadenceTime] = useState<number>(0);

  const bossHpRef = useRef<number>(500);
  useEffect(() => {
    bossHpRef.current = bossHp;
  }, [bossHp]);

  const overdriveGaugeRef = useRef<number>(0);
  useEffect(() => {
    overdriveGaugeRef.current = overdriveGauge;
  }, [overdriveGauge]);

  const isOverdriveFiringRef = useRef<boolean>(false);
  useEffect(() => {
    isOverdriveFiringRef.current = isOverdriveFiring;
  }, [isOverdriveFiring]);

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

  const triggerRumble = useCallback((duration = 180) => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), duration);
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

  // Consolidated Game State
  const [game, setGame] = useState<GameState>({
    stage: "IDLE",
    outcome: "VICTORY",
    calibrationSeconds: 5,
    autoRestartSeconds: 10,
    exercise: "squat",
    difficulty: "standard",
    playerHp: 100,
    playerOverheat: 0,
    bossHp: 500,
    bossAttackTimer: 10.0,
    screenFlash: "NONE",
    wsConnected: false,
    trackedSide: "LEFT",
    engine: INITIAL_ENGINE,
    stats: INITIAL_STATS,
  });

  // Keep live refs for animation & socket event handlers
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const lastRepRef = useRef<number>(0);
  const lastPenaltyRef = useRef<number>(0);
  const autoCalibratedRef = useRef<boolean>(false);
  const hitAwardedRepRef = useRef<number>(-1);

  // Screen Flash Trigger
  const triggerFlash = useCallback((type: "HIT" | "PENALTY" | "BOSS_ATTACK") => {
    setGame((prev) => ({ ...prev, screenFlash: type }));
    setTimeout(() => {
      setGame((prev) => ({ ...prev, screenFlash: "NONE" }));
    }, 450);
  }, []);

  // Floating Combat Popup Trigger
  const triggerCombatPopup = useCallback((text: string, isCrit = false, isOverdrive = false) => {
    const id = Date.now() + Math.random();
    setCombatPopups((prev) => [...prev.slice(-2), { id, text, isCrit, isOverdrive }]);
    setTimeout(() => {
      setCombatPopups((prev) => prev.filter((p) => p.id !== id));
    }, 1400);
  }, []);

  // Match Conclusion
  const finishMatch = useCallback((outcome: "VICTORY" | "DEFEAT") => {
    setGame((prev) => ({
      ...prev,
      outcome,
      stage: "COMPLETED",
      autoRestartSeconds: 10,
    }));
  }, []);

  // Kinetic Overdrive Beam Execution (250 damage over 3s, screen shake, audio cue)
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
          finishMatch("VICTORY");
          sfx.victory();
          coachSpeak("Target neutralized! Overdrive execution flawless.");
        }
        return nextHp;
      });
      triggerFlash("HIT");
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

  // Start Calibration Buffer
  const startCalibration = useCallback(() => {
    hitAwardedRepRef.current = -1;
    lastRepTimestampRef.current = Date.now();
    setBossHp(500);
    setOverdriveGauge(0);
    setIsOverdriveFiring(false);
    setCombatPopups([]);
    setCircuitBanner(null);
    calibratedRomRef.current = {};
    setDisplayCalibAngle(180);
    particlesRef.current = [];
    floatingTextsRef.current = [];
    shockwavesRef.current = [];

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: "reset" }));
    }

    setGame((prev) => ({
      ...prev,
      stage: "CALIBRATING",
      calibrationSeconds: 5,
      screenFlash: "NONE",
      bossHp: 500,
    }));
    sfx.countdownBeep(440);
    coachSpeak("Get in position. Five seconds to calibrate mobility and engage.");
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
            sfx.metronomeTick(true, false); // Accent on descent start
          } else if (currentBeat === 2) {
            sfx.metronomeTick(false, false); // Pause tick
          } else if (currentBeat === 3) {
            sfx.metronomeTick(false, true); // High chime on concentric push
          }
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [game.stage]);

  // Calibration Countdown Timer & Smart ROM Calibration Lock-in
  useEffect(() => {
    if (game.stage !== "CALIBRATING") return;

    let sec = 5;
    const interval = setInterval(() => {
      sec -= 1;
      setGame((prev) => ({ ...prev, calibrationSeconds: sec }));

      if (sec > 0) {
        sfx.countdownBeep(440 + (5 - sec) * 75);
      } else {
        clearInterval(interval);
        sfx.countdownEngage();

        // Dispatch calibrated ROM values to backend engine
        if (socketRef.current?.readyState === WebSocket.OPEN && Object.keys(calibratedRomRef.current).length > 0) {
          socketRef.current.send(JSON.stringify({
            action: "calibrate_rom",
            rom_calibration: calibratedRomRef.current
          }));
        }
        setCalibratedRom({ ...calibratedRomRef.current });

        const depthNotice = calibratedRomRef.current.squat_min
          ? `${calibratedRomRef.current.squat_min} degree knee depth`
          : calibratedRomRef.current.pushup_min
          ? `${calibratedRomRef.current.pushup_min} degree push-up depth`
          : calibratedRomRef.current.ohp_max
          ? `${calibratedRomRef.current.ohp_max} degree lockout`
          : "full mobility profile";
        coachSpeak(`Personal Range of Motion calibrated to ${depthNotice}. Engage!`);

        lastRepRef.current = gameRef.current.engine.rep_count;
        lastPenaltyRef.current = 0;
        hitAwardedRepRef.current = -1;
        lastRepTimestampRef.current = Date.now();
        setBossHp(500);

        setGame((prev) => ({
          ...prev,
          stage: "ACTIVE",
          playerHp: 100,
          bossHp: 500,
          playerOverheat: 0,
          bossAttackTimer: 10.0,
          stats: { ...INITIAL_STATS },
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [game.stage]);

  // Auto-Restart Countdown on COMPLETED Stage
  useEffect(() => {
    if (game.stage !== "COMPLETED") return;

    const interval = setInterval(() => {
      setGame((prev) => {
        if (prev.autoRestartSeconds <= 1) {
          clearInterval(interval);
          startCalibration();
          return { ...prev, autoRestartSeconds: 0 };
        }
        return { ...prev, autoRestartSeconds: prev.autoRestartSeconds - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [game.stage, startCalibration]);

  // Boss Attack Loop (Strictly during ACTIVE Stage)
  useEffect(() => {
    if (game.stage !== "ACTIVE") return;

    const interval = setInterval(() => {
      setGame((prev) => {
        const nextOverheat = Math.max(0, prev.playerOverheat - 0.5);
        const isEnraged = bossHpRef.current <= 250;
        const resetTimer = isEnraged ? 7.0 : 10.0;

        if (prev.bossAttackTimer <= 0.1) {
          sfx.bossAttack();
          triggerFlash("BOSS_ATTACK");
          coachSpeak("Incoming boss attack!");

          const nextPlayerHp = Math.max(0, prev.playerHp - 20);
          if (nextPlayerHp <= 0) {
            finishMatch("DEFEAT");
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
  }, [game.stage, triggerFlash, finishMatch]);

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

        // Diagnostic log
        console.log("[BIO-ENGINE PACKET]:", data);

        // Dynamic Circuit Phase Banner & Advance Alert
        if (data.circuit_banner && data.circuit_banner !== circuitBanner) {
          setCircuitBanner(data.circuit_banner);
          coachSpeak(data.circuit_banner);
          sfx.fanfareChord();
          triggerRumble(350);
          setTimeout(() => setCircuitBanner(null), 5500);
        }

        if (data.event === "CIRCUIT_PHASE_ADVANCE") {
          triggerCombatPopup("PHASE CLEARED!", true, true);
          sfx.cadenceBonus();
          triggerRumble(250);
        }

        // Voice cue dispatch
        if (data.voice_cue && gameRef.current.stage === "ACTIVE") {
          coachSpeak(data.voice_cue);
        }

        // Rep completion & damage conditions
        const isRepComplete = data.event === "REP_COMPLETE" || (typeof data.rep_count === "number" && data.rep_count > lastRepRef.current);
        const hasDamage = typeof data.damage === "number" && data.damage > 0;
        const isHitEvent = hasDamage && (data.status === "CRITICAL HIT!" || data.status === "hit");

        // CRITICAL: Prevent Game Stage Lockout
        // If user is in IDLE and performs a valid rep or hit, automatically engage ACTIVE stage
        if (gameRef.current.stage === "IDLE" && (isRepComplete || isHitEvent)) {
          setGame((prev) => ({ ...prev, stage: "ACTIVE" }));
        }

        // FAIL-SAFE COMBAT GATE: Only gate during the 5-second calibration countdown
        if (gameRef.current.stage === "CALIBRATING") {
          lastRepRef.current = data.rep_count;
          setGame((prev) => ({ ...prev, engine: data }));
          return;
        }

        // Check Kinetic Overdrive 3s Hold Trigger
        const isHold = data.phase.includes("HOLD") || data.phase === "LOCKOUT";
        if (overdriveGaugeRef.current >= 100 && !isOverdriveFiringRef.current && isHold && (data.hold_time >= 2.5 || data.hold_progress >= 0.95)) {
          fireOverdriveBeam();
        }

        // CRITICAL: Decrement Boss HP whenever damage > 0 or on REP_COMPLETE
        const shouldDamageBoss = isRepComplete || (hasDamage && hitAwardedRepRef.current !== data.rep_count);

        if (shouldDamageBoss) {
          hitAwardedRepRef.current = data.rep_count;
          const now = Date.now();
          const repDuration = (now - lastRepTimestampRef.current) / 1000;
          lastRepTimestampRef.current = now;

          // Cadence metronome sync: rep tempo between 2.8s and 5.8s with valid hold/depth
          const isCadenceSync = (repDuration >= 2.8 && repDuration <= 5.8) && (data.hold_time >= 0.7 || isHold);
          const baseDamage = (hasDamage ? data.damage : 100) || 100;
          const finalDamage = isCadenceSync ? Math.round(baseDamage * 1.5) : baseDamage;
          const popupText = isCadenceSync ? `-${finalDamage} CRIT!` : `-${finalDamage} DMG`;

          // Decrement Boss HP via functional state update to prevent React stale closures
          setBossHp((prevHp) => {
            const nextHp = Math.max(0, prevHp - finalDamage);
            if (nextHp === 0) {
              finishMatch("VICTORY");
              sfx.victory();
              coachSpeak("Target neutralized! Excellent form.");
            }
            return nextHp;
          });

          // Procedural Impact Glide & Audio Juice
          sfx.impactGlide();
          if (isCadenceSync) {
            sfx.cadenceBonus();
            coachSpeak("Cadence sync! Critical hit!");
          } else {
            sfx.hit();
          }

          // Camera Rumble & Neon Particle Burst from Active Joint
          triggerRumble(isCadenceSync ? 250 : 150);
          triggerFlash("HIT");
          triggerCombatPopup(popupText, isCadenceSync, false);
          spawnParticles(
            curJointRef.current.x,
            curJointRef.current.y,
            isCadenceSync
              ? ["#ffd700", "#10b981", "#38bdf8", "#f43f5e"]
              : ["#38bdf8", "#06b6d4", "#10b981", "#a855f7"]
          );
          spawnShockwave(curJointRef.current.x, curJointRef.current.y, isCadenceSync ? "#ffd700" : "#ffffff");
          spawnFloatingText(
            curJointRef.current.x,
            curJointRef.current.y,
            isCadenceSync ? `+${finalDamage} CRIT` : `+${finalDamage}`,
            isCadenceSync ? "#fbbf24" : "#10b981"
          );

          // Charge Overdrive Gauge (+25% per clean rep)
          if (data.purity >= 70 && !data.fault_detected) {
            setOverdriveGauge((prev) => Math.min(100, prev + 25));
          }
        }

        // Active combat statistics & player status processing
        setGame((prev) => {
          let nextPlayerHp = prev.playerHp;
          let nextOverheat = prev.playerOverheat;
          let nextBossTimer = prev.bossAttackTimer;
          const nextStats = { ...prev.stats };

          // Bilateral symmetry telemetry recording
          if (typeof data.symmetry === "number") {
            nextStats.symmetryScores = [...prev.stats.symmetryScores, data.symmetry];
          }

          // Valgus check
          if (data.valgus || data.fault_name === "VALGUS") {
            nextStats.valgusWarnings += 1;
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

            const isEnraged = bossHpRef.current <= 250;
            nextBossTimer = isEnraged ? 7.0 : 10.0;
          }

          // Ego-lift Penalty & Player damage
          if (data.status === "penalty") {
            const now = Date.now();
            if (now - lastPenaltyRef.current > 2000) {
              lastPenaltyRef.current = now;
              sfx.penalty();
              sfx.glitchWarning();
              triggerRumble(300);
              triggerFlash("PENALTY");
              spawnParticles(
                curJointRef.current.x,
                curJointRef.current.y,
                ["#ef4444", "#dc2626", "#b91c1c", "#f87171"]
              );
              spawnShockwave(curJointRef.current.x, curJointRef.current.y, "#ef4444");
              spawnFloatingText(curJointRef.current.x, curJointRef.current.y, "! EGO LIFT", "#ef4444");

              nextStats.egoPenalties += 1;
              nextStats.currentCritStreak = 0;
              nextOverheat = 100;
              nextPlayerHp = Math.max(0, prev.playerHp - 25);

              if (nextPlayerHp <= 0) {
                finishMatch("DEFEAT");
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

    // MediaPipe Pose Instance
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
      const ctx = canvas?.getContext("2d");
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {
        const lms = results.poseLandmarks;
        const lSh = lms[11], rSh = lms[12];
        const lEl = lms[13], rEl = lms[14];
        const lHip = lms[23], rHip = lms[24];
        const lHp = lHip, rHp = rHip;
        const lAnk = lms[27], rAnk = lms[28];

        // Dominant side visibility
        const leftVis = ((lHp?.visibility ?? 0) + (lms[25]?.visibility ?? 0) + (lAnk?.visibility ?? 0) + (lSh?.visibility ?? 0)) / 4;
        const rightVis = ((rHip?.visibility ?? 0) + (lms[26]?.visibility ?? 0) + (rAnk?.visibility ?? 0) + (rSh?.visibility ?? 0)) / 4;
        const curSide = rightVis > leftVis + 0.15 ? "RIGHT" : "LEFT";
        if (gameRef.current.trackedSide !== curSide) {
          setGame((prev) => ({ ...prev, trackedSide: curSide }));
        }

        // Active joint tracking for radiating particle bursts
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
            const h = curSide === "RIGHT" ? rHip : lHip;
            if (h) curJointRef.current = { x: h.x * canvas.width, y: h.y * canvas.height };
          }
        }

        // Smart Range-of-Motion (ROM) Auto-Calibration during CALIBRATING Stage
        if (gameRef.current.stage === "CALIBRATING") {
          const ex = gameRef.current.exercise === "circuit" ? "squat" : gameRef.current.exercise;
          if (ex === "squat") {
            const k = curSide === "RIGHT" ? lms[26] : lms[25];
            const h = curSide === "RIGHT" ? rHip : lHip;
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
          } else if (ex === "pushup") {
            const e = curSide === "RIGHT" ? rEl : lEl;
            const s = curSide === "RIGHT" ? rSh : lSh;
            const w = curSide === "RIGHT" ? lms[16] : lms[15];
            if (e && s && w) {
              const v1 = { x: s.x - e.x, y: s.y - e.y, z: (s.z || 0) - (e.z || 0) };
              const v2 = { x: w.x - e.x, y: w.y - e.y, z: (w.z || 0) - (e.z || 0) };
              const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
              const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
              const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
              if (mag1 > 0 && mag2 > 0) {
                const deg = Math.round(Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI));
                if (deg < (calibratedRomRef.current.pushup_min || 180) && deg >= 45) {
                  calibratedRomRef.current.pushup_min = deg;
                  setDisplayCalibAngle(deg);
                }
              }
            }
          } else if (ex === "overhead_press") {
            const e = curSide === "RIGHT" ? rEl : lEl;
            const s = curSide === "RIGHT" ? rSh : lSh;
            const w = curSide === "RIGHT" ? lms[16] : lms[15];
            if (e && s && w) {
              const v1 = { x: s.x - e.x, y: s.y - e.y, z: (s.z || 0) - (e.z || 0) };
              const v2 = { x: w.x - e.x, y: w.y - e.y, z: (w.z || 0) - (e.z || 0) };
              const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
              const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
              const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
              if (mag1 > 0 && mag2 > 0) {
                const deg = Math.round(Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI));
                if (deg > (calibratedRomRef.current.ohp_max || 110) && deg <= 180) {
                  calibratedRomRef.current.ohp_max = deg;
                  setDisplayCalibAngle(deg);
                }
              }
            }
          }
        }

        // Auto-calibration on initial detection of upper or lower body
        const hasKeyPoints = Boolean((lSh && rSh) || (lHip && rHip) || (lEl && rEl));
        if (!autoCalibratedRef.current && gameRef.current.stage === "IDLE" && hasKeyPoints) {
          autoCalibratedRef.current = true;
          startCalibration();
        }

        // Send Landmark Stream over WebSocket
        const pack = (lm?: Landmark) => (lm ? [lm.x, lm.y, lm.z ?? 0, lm.visibility ?? 1] : null);
        const canStream = Boolean(lSh || rSh || lHip || rHip || lEl || rEl);
        if (canStream && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              exercise: gameRef.current.exercise,
              difficulty: gameRef.current.difficulty,
              rom_calibration: calibratedRomRef.current,
              left: {
                shoulder: pack(lms[11]), elbow: pack(lms[13]), wrist: pack(lms[15]),
                hip: pack(lHip), knee: pack(lms[25]), ankle: pack(lAnk),
                ear: pack(lms[7]),
              },
              right: {
                shoulder: pack(lms[12]), elbow: pack(lms[14]), wrist: pack(lms[16]),
                hip: pack(rHip), knee: pack(lms[26]), ankle: pack(rAnk),
                ear: pack(lms[8]),
              },
              // Backward compatibility flat fields
              shoulder: pack(curSide === "RIGHT" ? lms[12] : lms[11]),
              elbow: pack(curSide === "RIGHT" ? lms[14] : lms[13]),
              wrist: pack(curSide === "RIGHT" ? lms[16] : lms[15]),
              hip: pack(curSide === "RIGHT" ? rHip : lHip),
              knee: pack(curSide === "RIGHT" ? lms[26] : lms[25]),
              ankle: pack(curSide === "RIGHT" ? rAnk : lAnk),
              right_hip: pack(curSide === "RIGHT" ? lHip : rHip),
            })
          );
        }

        // Render Cyberpunk Skeleton, Joint Halos, Reticles, Shockwaves, Floating Text & Radiating Particles
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
            performance.now()
          );
        }
      }
    });

    // Native Camera Stream Lifecycle
    let isRunning = true;
    let localStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (!isRunning) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStream = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (!isRunning) return;
            videoRef.current?.play().catch(console.error);

            const processFrame = async () => {
              if (!isRunning) return;
              if (videoRef.current && videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                try {
                  await pose.send({ image: videoRef.current });
                } catch (err) {
                  console.error("Frame error:", err);
                }
              }
              if (isRunning) {
                animationFrameId.current = requestAnimationFrame(processFrame);
              }
            };
            processFrame();
          };
        }
      } catch (err) {
        console.error("Camera access failed:", err);
      }
    };

    startCamera();

    return () => {
      isRunning = false;
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      try { pose.close(); } catch { /* noop */ }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    };
  }, [scriptReady, triggerFlash, triggerCombatPopup, fireOverdriveBeam, startCalibration, finishMatch]);

  // Derived Presentation States
  const isEgoLift = game.engine.status === "penalty" || game.engine.phase === "STUNNED";
  const isCriticalHit = game.engine.status === "hit" || game.engine.status === "CRITICAL HIT!" || Boolean(game.engine.damage > 0);
  const isHolding = game.engine.phase.includes("HOLD") || game.engine.phase === "LOCKOUT";
  const isBossEnraged = bossHp <= 250 && bossHp > 0;
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

      {/* DYNAMIC ALERT BANNER ON CIRCUIT PHASE ADVANCE */}
      {circuitBanner && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-[92%] bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 text-black font-mono font-black text-sm sm:text-lg px-6 py-3 rounded-2xl border-4 border-white shadow-[0_0_50px_rgba(250,204,21,1)] animate-bounce text-center uppercase tracking-wider flex items-center justify-center gap-3 pointer-events-none">
          <span className="text-2xl animate-pulse">⚔️</span>
          <span>{circuitBanner}</span>
          <span className="text-2xl animate-pulse">⚔️</span>
        </div>
      )}

      <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-start p-4 sm:p-6 select-none font-sans">
        
        {/* ARSENAL & MOBILITY TIER SELECTOR */}
        <section className="w-full max-w-5xl mb-3 flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-900/80 border border-slate-800 p-3 rounded-2xl shadow-xl backdrop-blur-md">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest mr-1">
              MOVEMENT:
            </span>
            {exercises.map((ex) => (
              <button
                key={ex.id}
                onClick={() => {
                  setGame((prev) => ({ ...prev, exercise: ex.id }));
                  coachSpeak(`${ex.label} selected.`);
                }}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  game.exercise === ex.id
                    ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.6)]"
                    : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <span>{ex.icon}</span>
                <span>{ex.label}</span>
                <span className="text-[10px] opacity-75 font-normal">({ex.damage})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-slate-400 font-bold uppercase text-[11px] mr-1">TIER:</span>
            {(["rehab", "standard", "athlete"] as DifficultyTier[]).map((tier) => (
              <button
                key={tier}
                onClick={() => {
                  setGame((prev) => ({ ...prev, difficulty: tier }));
                  coachSpeak(`${tier} tier engaged.`);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase cursor-pointer transition-all ${
                  game.difficulty === tier
                    ? tier === "rehab"
                      ? "bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                      : tier === "athlete"
                      ? "bg-purple-500 text-black shadow-[0_0_12px_rgba(168,85,247,0.6)]"
                      : "bg-cyan-400 text-black shadow-[0_0_12px_rgba(34,211,238,0.6)]"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </section>

        {/* BOUNTY CIRCUIT MULTI-EXERCISE PHASE PROGRESS TRACKER */}
        {game.exercise === "circuit" && (
          <section className="w-full max-w-5xl mb-3 bg-slate-900/90 border border-yellow-500/50 rounded-2xl p-3 shadow-xl backdrop-blur-md animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-black text-yellow-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping" />
                  BOUNTY CIRCUIT // 3-PHASE ROTATING ENCOUNTER:
                </span>
                <span className="text-xs font-mono font-bold text-white bg-yellow-950/80 border border-yellow-500/40 px-2.5 py-0.5 rounded-lg">
                  PHASE {game.engine.circuit_phase || 1}/3: {game.engine.circuit_phase_name || "ARMOR SHRED"}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-300">
                Phase Target: <span className="font-bold text-yellow-300">{game.engine.circuit_phase_reps ?? 0} / {game.engine.circuit_target_reps ?? 5} Reps</span> (Total: {game.engine.circuit_total_reps ?? 0}/15)
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
              <div className={`p-2 rounded-xl border text-center transition-all ${(game.engine.circuit_phase || 1) === 1 ? "bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)] font-bold" : (game.engine.circuit_phase || 1) > 1 ? "bg-slate-950/60 border-emerald-500/60 text-emerald-400 font-semibold" : "bg-slate-950/40 border-slate-800 text-slate-500"}`}>
                Phase 1: Armor Shred (5 Squats) {(game.engine.circuit_phase || 1) > 1 ? "✓ DONE" : (game.engine.circuit_phase || 1) === 1 ? `(${game.engine.circuit_phase_reps ?? 0}/5)` : ""}
              </div>
              <div className={`p-2 rounded-xl border text-center transition-all ${(game.engine.circuit_phase || 1) === 2 ? "bg-purple-950/80 border-purple-400 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.4)] font-bold" : (game.engine.circuit_phase || 1) > 2 ? "bg-slate-950/60 border-emerald-500/60 text-emerald-400 font-semibold" : "bg-slate-950/40 border-slate-800 text-slate-500"}`}>
                Phase 2: Shield Breaker (5 OHP) {(game.engine.circuit_phase || 1) > 2 ? "✓ DONE" : (game.engine.circuit_phase || 1) === 2 ? `(${game.engine.circuit_phase_reps ?? 0}/5)` : ""}
              </div>
              <div className={`p-2 rounded-xl border text-center transition-all ${(game.engine.circuit_phase || 1) === 3 ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.4)] font-bold" : "bg-slate-950/40 border-slate-800 text-slate-500"}`}>
                Phase 3: Core Finisher (5 Push-ups) {(game.engine.circuit_phase || 1) === 3 ? `(${game.engine.circuit_phase_reps ?? 0}/5)` : ""}
              </div>
            </div>
          </section>
        )}

        {/* TOP HUD: PLAYER & BOSS HEALTH BARS + OVERDRIVE GAUGE */}
        <section className="w-full max-w-5xl mb-3 bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            
            {/* Player HP & Overdrive Gauge */}
            <div className="md:col-span-5 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="font-black tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  PLAYER BIO-HARNESS
                </span>
                <span className="font-bold text-white font-mono">{game.playerHp} / 100 HP</span>
              </div>

              <div className="w-full bg-slate-950 h-5 rounded-lg overflow-hidden border border-slate-700/80 relative">
                <div
                  className={`h-full transition-all duration-300 ${
                    game.playerHp > 50
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.7)]"
                      : game.playerHp > 25
                      ? "bg-gradient-to-r from-yellow-600 to-amber-400"
                      : "bg-gradient-to-r from-red-700 to-rose-500 animate-pulse"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, game.playerHp))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono mt-0.5">
                <span className="text-slate-400">HEAT: <span className={game.playerOverheat > 75 ? "text-red-400 font-bold" : "text-amber-400"}>{Math.round(game.playerOverheat)}%</span></span>
                {game.playerOverheat >= 99 && <span className="text-red-400 font-bold text-[10px] animate-ping">OVERHEATED</span>}
              </div>

              {/* Kinetic Overdrive Super Gauge */}
              <div className="mt-1 flex flex-col gap-0.5">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    ⚡ OVERDRIVE: {overdriveGauge}%
                    {overdriveGauge >= 100 && (
                      <span className="bg-yellow-400 text-black px-1.5 py-0.2 rounded font-black text-[9px] animate-pulse">
                        READY! HOLD 3s DEPTH
                      </span>
                    )}
                  </span>
                  <span className="text-slate-500 font-mono text-[9px]">KINETIC OVERDRIVE</span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-amber-900/60 relative">
                  <div
                    className={`h-full transition-all duration-300 ${
                      overdriveGauge >= 100
                        ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 shadow-[0_0_15px_rgba(250,204,21,1)] animate-pulse"
                        : "bg-gradient-to-r from-amber-700 to-yellow-500"
                    }`}
                    style={{ width: `${overdriveGauge}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Center VS & Boss Barrage Timer */}
            <div className="md:col-span-2 flex flex-col items-center justify-center text-center py-1">
              <div className="text-xs font-black font-mono tracking-widest text-slate-500 uppercase">SECTOR CLASH</div>
              <div className="text-xl font-black font-mono text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">VS</div>
              <div className="w-full max-w-[130px] flex flex-col items-center mt-1">
                <span className="text-[10px] font-mono text-red-400 font-semibold tracking-tighter">
                  BARRAGE: {game.bossAttackTimer.toFixed(1)}s
                </span>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-red-950/80 mt-0.5">
                  <div
                    className={`h-full transition-all duration-100 ${
                      game.bossAttackTimer < 3.0 ? "bg-red-500 animate-pulse" : "bg-gradient-to-r from-amber-500 to-red-500"
                    }`}
                    style={{ width: `${Math.min(100, (game.bossAttackTimer / (isBossEnraged ? 7.0 : 10.0)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Boss HP & Floating Combat Text */}
            <div className="md:col-span-5 flex flex-col gap-1.5 relative">
              {/* Floating Combat Text Popups positioned directly above the Boss Health Bar */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-full flex flex-col items-center pointer-events-none z-50">
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
                <span className="font-black tracking-wider text-purple-400 flex items-center gap-1.5">
                  CYBER-COLOSSUS // MK-IV
                </span>
                <span className="font-bold text-white font-mono">{bossHp} / 500 HP</span>
              </div>

              <div className="w-full bg-slate-950 h-5 rounded-lg overflow-hidden border border-slate-700/80 relative">
                <div
                  className={`h-full transition-all duration-300 ${
                    isBossEnraged
                      ? "bg-gradient-to-r from-red-600 via-rose-500 to-purple-600 animate-pulse"
                      : "bg-gradient-to-r from-purple-700 to-fuchsia-500"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, (bossHp / 500) * 100))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono mt-0.5">
                <span className="text-slate-400">STATUS:</span>
                {isBossDefeated ? (
                  <span className="text-zinc-500 font-bold">DEFEATED</span>
                ) : isBossEnraged ? (
                  <span className="text-red-400 font-bold animate-ping">🔥 ENRAGED CORE</span>
                ) : (
                  <span className="text-purple-400 font-semibold">ARMORED TARGET</span>
                )}
              </div>
            </div>

          </div>
        </section>

        {/* DYNAMIC CADENCE METRONOME HUD */}
        <section className="w-full max-w-5xl mb-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-xl backdrop-blur-md">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-cyan-400 font-black tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                CADENCE METRONOME:
              </span>
              <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                cadenceTime < 2.0
                  ? "bg-cyan-950 text-cyan-300 border border-cyan-500/40"
                  : cadenceTime < 3.0
                  ? "bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse"
                  : "bg-emerald-950 text-emerald-300 border border-emerald-500/40"
              }`}>
                {cadenceTime < 2.0 ? "⬇️ 2s ECCENTRIC DESCENT" : cadenceTime < 3.0 ? "⏸️ 1s ISOMETRIC PAUSE" : "⬆️ 1s CONCENTRIC EXPLODE"}
              </span>
            </div>
            <div className="text-[10px] font-mono font-bold text-yellow-300 bg-yellow-950/60 border border-yellow-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span>⚡ PERFECT TEMPO SYNC = +50% DAMAGE (150 CRIT!)</span>
            </div>
          </div>

          <div className="w-full bg-slate-950 h-4 rounded-lg overflow-hidden border border-slate-700/80 relative flex">
            {/* 3 tempo zones: 50% Eccentric (2s), 25% Hold (1s), 25% Concentric (1s) */}
            <div className="w-1/2 h-full bg-cyan-950/40 border-r border-slate-800 flex items-center justify-center text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
              ECCENTRIC DESCENT (2.0s)
            </div>
            <div className="w-1/4 h-full bg-amber-950/40 border-r border-slate-800 flex items-center justify-center text-[10px] font-mono font-bold text-amber-400 tracking-wider">
              HOLD PAUSE (1.0s)
            </div>
            <div className="w-1/4 h-full bg-emerald-950/40 flex items-center justify-center text-[10px] font-mono font-bold text-emerald-400 tracking-wider">
              CONCENTRIC PUSH (1.0s)
            </div>

            {/* Animated Cadence Runner Marker */}
            <div
              className="absolute top-0 bottom-0 w-2.5 bg-yellow-300 shadow-[0_0_12px_rgba(253,224,71,1)] rounded pointer-events-none transition-all duration-75 ease-linear"
              style={{ left: `calc(${(cadenceTime / 4.0) * 100}% - 5px)` }}
            />
          </div>
        </section>

        {/* COMBAT BANNER & COACH FEEDBACK */}
        <section className="w-full max-w-5xl mb-3">
          {isEgoLift ? (
            <div className="bg-red-950/90 border-2 border-red-500 rounded-xl p-3 text-center shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse">
              <div className="text-xl font-black text-red-400 uppercase tracking-wider font-mono">
                ⚠️ FORM VIOLATION DETECTED!
              </div>
              <div className="text-xs font-mono text-red-300 font-bold mt-0.5">
                {game.engine.fault_name || "RAPID SLOPPY REPS"} &bull; -25 HP &bull; WEAPON OVERHEATED
              </div>
            </div>
          ) : isCriticalHit ? (
            <div className="bg-emerald-950/90 border-2 border-emerald-400 rounded-xl p-3 text-center shadow-[0_0_30px_rgba(16,185,129,0.6)] animate-bounce">
              <div className="text-xl font-black text-yellow-300 uppercase tracking-wider font-mono">
                ⚡ CRITICAL HIT! (+{game.engine.damage || 100} DMG)
              </div>
              <div className="text-xs font-mono text-emerald-300 font-bold mt-0.5">
                {game.engine.coach_feedback || "BIOMECHANICALLY PURE FORM CONFIRMED!"}
              </div>
            </div>
          ) : isHolding ? (
            <div className="bg-slate-900/90 border-2 border-amber-400 rounded-xl p-3 text-center shadow-[0_0_20px_rgba(245,158,11,0.4)]">
              <div className="text-lg font-black text-amber-400 uppercase tracking-wider font-mono">
                ⏳ HOLD DEPTH... ({game.engine.hold_time.toFixed(1)}s)
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden mt-1.5 border border-slate-700">
                <div
                  className="bg-amber-400 h-full transition-all duration-100 ease-out shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                  style={{ width: `${Math.round(game.engine.hold_progress * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-3 text-center text-slate-300 font-mono text-xs shadow-md">
              <span className="text-cyan-400 font-bold">VOICE COACH:</span>{" "}
              {game.wsConnected
                ? game.engine.coach_feedback || "READY FOR ENGAGEMENT"
                : "CONNECTING TO BIO-ENGINE..."}
            </div>
          )}
        </section>

        {/* VIEWPORT: VIDEO + CANVAS SKELETON */}
        <section className={`relative w-[640px] h-[480px] rounded-2xl overflow-hidden shadow-2xl bg-black mb-4 border-2 ${isOverdriveFiring ? "border-yellow-400 shadow-[0_0_50px_rgba(234,179,8,0.8)] scale-[1.01]" : isShaking ? "border-yellow-400 ring-4 ring-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.6)] animate-rumble" : "border-slate-700"} ring-1 ring-slate-800 transition-transform duration-75`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none scale-x-[-1]"
          />

          {/* 4 Corner Sci-Fi Tech Accents */}
          <div className="absolute top-2.5 left-2.5 w-4 h-4 border-t-2 border-l-2 border-cyan-400 pointer-events-none z-20 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          <div className="absolute top-2.5 right-2.5 w-4 h-4 border-t-2 border-r-2 border-cyan-400 pointer-events-none z-20 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          <div className="absolute bottom-2.5 left-2.5 w-4 h-4 border-b-2 border-l-2 border-cyan-400 pointer-events-none z-20 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          <div className="absolute bottom-2.5 right-2.5 w-4 h-4 border-b-2 border-r-2 border-cyan-400 pointer-events-none z-20 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />

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

          {/* Golden Kinetic Overdrive Beam Overlay */}
          {isOverdriveFiring && (
            <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/30 via-yellow-400/50 to-amber-500/30 animate-pulse backdrop-blur-[1px]" />
              <div className="w-full h-20 bg-gradient-to-b from-yellow-200 via-amber-400 to-yellow-100 shadow-[0_0_100px_rgba(251,191,36,1)] opacity-95 animate-pulse flex items-center justify-center">
                <span className="font-mono font-black text-2xl sm:text-3xl text-black tracking-widest drop-shadow-[0_0_20px_rgba(255,255,255,1)] animate-ping">
                  ⚡ OVERDRIVE BEAM ACTIVATED ⚡
                </span>
              </div>
            </div>
          )}

          {/* Hold Badge */}
          {isHolding && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-950/85 backdrop-blur-md border border-amber-400 px-4 py-1.5 rounded-full font-mono text-xs text-amber-300 font-bold shadow-[0_0_15px_rgba(245,158,11,0.6)] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span>HOLD LOCKOUT ({Math.round(game.engine.hold_progress * 100)}%)</span>
            </div>
          )}

          {/* Orientation Badge */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-20">
            <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 font-mono text-xs flex items-center gap-2.5 shadow-xl">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  !game.wsConnected
                    ? "bg-red-500"
                    : isEgoLift
                    ? "bg-red-500 animate-ping"
                    : isCriticalHit
                    ? "bg-emerald-400 animate-ping"
                    : isHolding
                    ? "bg-amber-400 animate-pulse"
                    : "bg-cyan-400"
                }`}
              />
              <span className="font-bold tracking-wide text-white uppercase">{game.engine.phase}</span>
              <span className="text-slate-600 font-normal">|</span>
              <span
                className={`font-black text-[11px] px-2 py-0.5 rounded-md ${
                  game.engine.orientation === "FRONT"
                    ? "bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                    : "bg-purple-950/80 text-purple-300 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.3)]"
                }`}
              >
                {game.engine.orientation === "FRONT"
                  ? "VIEW: FRONT (CORONAL)"
                  : `VIEW: PROFILE (${game.engine.dominant_side || game.trackedSide})`}
              </span>
            </div>

            {game.engine.valgus && (
              <div className="bg-red-950/95 border-2 border-red-500 text-red-300 px-3 py-1 rounded-xl font-mono text-xs font-black tracking-wide flex items-center gap-2 shadow-[0_0_25px_rgba(239,68,68,0.7)] animate-bounce">
                <span className="animate-ping text-sm">⚠️</span>
                <span>{game.engine.warning || "KNEES CAVING INWARD - DRIVE KNEES OUT!"}</span>
              </div>
            )}
          </div>

          {/* Quick Stage Controls */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            {game.stage === "IDLE" ? (
              <button
                onClick={startCalibration}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-mono text-xs font-black px-3.5 py-1.5 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.6)] cursor-pointer transition-all transform hover:scale-105"
              >
                ⚔️ START BATTLE
              </button>
            ) : game.stage === "ACTIVE" ? (
              <button
                onClick={startCalibration}
                className="bg-slate-900/85 hover:bg-slate-800 text-slate-300 font-mono text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-700/80 cursor-pointer transition-all"
              >
                🔄 REBOOT
              </button>
            ) : null}

            {game.engine.fault_detected && !isEgoLift && !game.engine.valgus && game.stage === "ACTIVE" && (
              <div className="bg-red-950/90 border border-red-500 px-3 py-1.5 rounded-lg font-mono text-xs text-red-400 font-bold animate-pulse">
                ⚠️ {game.engine.fault_name}
              </div>
            )}
          </div>

          {/* 5-SECOND CALIBRATION OVERLAY WITH PERSONAL ROM AUTO-CALIBRATION */}
          {game.stage === "CALIBRATING" && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center z-30 pointer-events-none animate-fadeIn">
              <div className="relative flex flex-col items-center">
                <div className="absolute w-52 h-52 rounded-full border-2 border-cyan-500/20 animate-ping" />
                <div className="absolute w-40 h-40 rounded-full border border-cyan-400/40 animate-pulse" />
                <div className="absolute w-28 h-28 rounded-full border border-teal-300/60" />

                <div className="text-8xl sm:text-9xl font-black font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-cyan-200 via-teal-300 to-emerald-400 drop-shadow-[0_0_40px_rgba(34,211,238,0.9)] animate-pulse">
                  {game.calibrationSeconds > 0 ? game.calibrationSeconds : "ENGAGE!"}
                </div>

                <div className="mt-4 px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/80 font-mono text-xs font-black text-cyan-300 uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.5)]">
                  PERFORM DEEPEST COMFORTABLE STRETCH
                </div>
                <div className="mt-2 px-3.5 py-1 rounded-xl bg-emerald-950/85 border border-emerald-400 text-xs font-mono font-bold text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  🎯 ROM AUTO-CALIBRATION: {displayCalibAngle < 170 ? `${displayCalibAngle}° (Calibrated 100% Personal Depth)` : "Stretch deep to calibrate..."}
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1.5 uppercase tracking-wider">
                  Combat logic armed in {game.calibrationSeconds}s
                </div>
              </div>
            </div>
          )}

          {/* IDLE STANDBY OVERLAY */}
          {game.stage === "IDLE" && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center z-30">
              <div className="bg-slate-950/95 border-2 border-cyan-500/80 rounded-2xl p-6 text-center max-w-sm shadow-[0_0_40px_rgba(6,182,212,0.5)]">
                <div className="text-3xl mb-2">⚔️</div>
                <h3 className="text-xl font-black font-mono text-cyan-400 tracking-wider uppercase mb-1">
                  ATHLETEMIND ARENA
                </h3>
                <p className="text-xs font-mono text-slate-300 mb-4">
                  Select your exercise movement & mobility tier, then initiate the calibration buffer.
                </p>
                <button
                  onClick={startCalibration}
                  className="w-full bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-black font-black font-mono py-3 rounded-xl uppercase tracking-widest shadow-[0_0_25px_rgba(6,182,212,0.6)] cursor-pointer transition-all transform hover:scale-105"
                >
                  ENGAGE BATTLE // START
                </button>
                <div className="text-[10px] font-mono text-slate-400 mt-2">
                  5s adjustment timer begins upon engagement
                </div>
              </div>
            </div>
          )}
        </section>

        {/* BIOMETRIC TELEMETRY CARDS */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 w-full max-w-5xl">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center shadow-lg">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-1">REPS RECORDED</div>
            <div className="text-3xl font-black text-emerald-400 font-mono">{game.engine.rep_count}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Verified Biometrics</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center shadow-lg">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-1">FORM PURITY</div>
            <div className={`text-3xl font-black font-mono ${game.engine.purity >= 85 ? "text-emerald-400" : game.engine.purity >= 60 ? "text-amber-400" : "text-red-400"}`}>
              {Math.round(game.engine.purity)}%
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Kinematic Score</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center shadow-lg">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-1">SYMMETRY</div>
            <div className="text-3xl font-black text-teal-400 font-mono">
              {typeof game.engine.symmetry === "number" ? `${Math.round(game.engine.symmetry)}%` : "100%"}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Bilateral Balance</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center shadow-lg">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-1">CADENCE REPS</div>
            <div className="text-3xl font-black text-yellow-400 font-mono">{game.stats.cadenceBonusReps}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Tempo Synced</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center shadow-lg">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-1">{game.engine.primary_label} ANGLE</div>
            <div className="text-3xl font-black text-cyan-400 font-mono">{Math.round(game.engine.primary_angle)}°</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Primary Axis</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center shadow-lg">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-semibold mb-1">{game.engine.secondary_label} ANGLE</div>
            <div className="text-3xl font-black text-indigo-400 font-mono">{Math.round(game.engine.secondary_angle)}°</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">Secondary Axis</div>
          </div>
        </section>

        {/* GAMIFIED ACHIEVEMENT & AUTO-RESTART MODAL */}
        {game.stage === "COMPLETED" && (() => {
          const cleanReps = game.stats.totalReps;
          const avgPurity = game.stats.purityScores.length > 0
            ? Math.round(game.stats.purityScores.reduce((a, b) => a + b, 0) / game.stats.purityScores.length)
            : Math.round(game.engine.purity) || 100;
          const avgDepth = game.stats.depthAngles.length > 0
            ? Math.round(game.stats.depthAngles.reduce((a, b) => a + b, 0) / game.stats.depthAngles.length)
            : Math.round(game.engine.primary_angle) || 90;
          const avgHold = game.stats.holdTimes.length > 0
            ? (game.stats.holdTimes.reduce((a, b) => a + b, 0) / game.stats.holdTimes.length).toFixed(1)
            : (game.engine.hold_time || 0).toFixed(1);
          const avgSymmetry = game.stats.symmetryScores.length > 0
            ? Math.round(game.stats.symmetryScores.reduce((a, b) => a + b, 0) / game.stats.symmetryScores.length)
            : 98;
          const cadenceAccuracy = game.stats.totalReps > 0
            ? Math.round((game.stats.cadenceBonusReps / game.stats.totalReps) * 100)
            : 100;

          const ironKneesUnlocked = game.stats.valgusWarnings === 0;
          const staticTitanUnlocked = parseFloat(avgHold) >= 2.0;
          const antiEgoUnlocked = game.stats.egoPenalties === 0;
          const criticalStrikerUnlocked = game.stats.maxConsecutiveCrits >= 3 ||
            game.stats.purityScores.filter((p) => p >= 85).length >= 5 ||
            (cleanReps >= 5 && game.stats.egoPenalties === 0);
          const bilateralMasterUnlocked = avgSymmetry >= 90;
          const metronomeMasterUnlocked = cadenceAccuracy >= 40 || game.stats.cadenceBonusReps >= 2;

          const unlockedCount = [
            ironKneesUnlocked,
            staticTitanUnlocked,
            antiEgoUnlocked,
            criticalStrikerUnlocked,
            bilateralMasterUnlocked,
            metronomeMasterUnlocked,
          ].filter(Boolean).length;

          const isVictory = game.outcome === "VICTORY";

          return (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
              <div
                className={`bg-slate-900 border-2 ${
                  isVictory ? "border-emerald-500 shadow-[0_0_60px_rgba(16,185,129,0.4)]" : "border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.4)]"
                } rounded-2xl p-6 sm:p-8 max-w-2xl w-full text-center relative overflow-hidden my-auto`}
              >
                <div
                  className={`absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-32 ${
                    isVictory ? "bg-emerald-500/20" : "bg-red-500/20"
                  } blur-3xl pointer-events-none rounded-full`}
                />

                <div className="relative mb-6">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest mb-3 ${
                      isVictory ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-red-500/20 text-red-300 border border-red-500/40"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                    {isVictory ? "MISSION COMPLETE" : "SIMULATION ABORTED"}
                  </div>

                  <h2 className={`text-3xl sm:text-4xl font-black font-mono tracking-wider uppercase ${isVictory ? "text-emerald-400" : "text-red-500"}`}>
                    {isVictory ? "BOSS ELIMINATED" : "SYSTEM OVERLOAD"}
                  </h2>
                  <p className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-widest">
                    {isVictory ? "Cyber-Colossus Neutralized // Bounty Claimed" : "Defenses Breached • Kinetic Overheat Triggered"}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-slate-950/90 p-4 rounded-xl border border-slate-800 mb-6 text-center">
                  <div className="p-2 border-r border-slate-800/80">
                    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Clean Reps</div>
                    <div className="text-2xl font-black font-mono text-white mt-1">{cleanReps}</div>
                    <div className="text-[8px] font-mono text-slate-500">Completed</div>
                  </div>
                  <div className="p-2 sm:border-r border-slate-800/80">
                    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Form Purity</div>
                    <div className={`text-2xl font-black font-mono mt-1 ${avgPurity >= 85 ? "text-emerald-400" : avgPurity >= 60 ? "text-amber-400" : "text-red-400"}`}>
                      {avgPurity}%
                    </div>
                    <div className="text-[8px] font-mono text-slate-500">Kinematic Avg</div>
                  </div>
                  <div className="p-2 border-r border-slate-800/80">
                    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Symmetry</div>
                    <div className="text-2xl font-black font-mono text-teal-400 mt-1">{avgSymmetry}%</div>
                    <div className="text-[8px] font-mono text-slate-500">L/R Balance</div>
                  </div>
                  <div className="p-2 sm:border-r border-slate-800/80">
                    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Cadence Sync</div>
                    <div className="text-2xl font-black font-mono text-yellow-400 mt-1">{cadenceAccuracy}%</div>
                    <div className="text-[8px] font-mono text-slate-500">Rhythm Match</div>
                  </div>
                  <div className="p-2 border-r border-slate-800/80">
                    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Avg Depth</div>
                    <div className="text-2xl font-black font-mono text-cyan-400 mt-1">{avgDepth}°</div>
                    <div className="text-[8px] font-mono text-slate-500">Primary Angle</div>
                  </div>
                  <div className="p-2">
                    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Avg Hold</div>
                    <div className="text-2xl font-black font-mono text-indigo-400 mt-1">{avgHold}s</div>
                    <div className="text-[8px] font-mono text-slate-500">Pause Duration</div>
                  </div>
                </div>

                <div className="text-left mb-2.5 flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-300">🏆 Biomechanical Combat Achievements</span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {unlockedCount} / 6 UNLOCKED
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6 text-left">
                  {/* Bilateral Master */}
                  <div className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${bilateralMasterUnlocked ? "bg-teal-950/40 border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.15)]" : "bg-slate-950/60 border-slate-800 opacity-60"}`}>
                    <div className={`text-2xl p-2 rounded-lg ${bilateralMasterUnlocked ? "bg-teal-500/20 text-teal-300" : "bg-slate-800 text-slate-500"}`}>⚖️</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`font-mono font-bold text-xs uppercase tracking-wider ${bilateralMasterUnlocked ? "text-teal-300" : "text-slate-400"}`}>Bilateral Master</h4>
                        <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${bilateralMasterUnlocked ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 animate-pulse" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
                          {bilateralMasterUnlocked ? "UNLOCKED" : "LOCKED"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 leading-tight">Maintained ≥ 90% bilateral symmetry across left/right chains.</p>
                    </div>
                  </div>

                  {/* Metronome Master */}
                  <div className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${metronomeMasterUnlocked ? "bg-yellow-950/40 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]" : "bg-slate-950/60 border-slate-800 opacity-60"}`}>
                    <div className={`text-2xl p-2 rounded-lg ${metronomeMasterUnlocked ? "bg-yellow-500/20 text-yellow-300" : "bg-slate-800 text-slate-500"}`}>🎯</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`font-mono font-bold text-xs uppercase tracking-wider ${metronomeMasterUnlocked ? "text-yellow-300" : "text-slate-400"}`}>Metronome Master</h4>
                        <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${metronomeMasterUnlocked ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 animate-pulse" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
                          {metronomeMasterUnlocked ? "UNLOCKED" : "LOCKED"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 leading-tight">Synchronized eccentric, pause, and concentric push with metronome tempo.</p>
                    </div>
                  </div>

                  {/* Iron Knees */}
                  <div className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${ironKneesUnlocked ? "bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "bg-slate-950/60 border-slate-800 opacity-60"}`}>
                    <div className={`text-2xl p-2 rounded-lg ${ironKneesUnlocked ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>🛡️</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`font-mono font-bold text-xs uppercase tracking-wider ${ironKneesUnlocked ? "text-emerald-300" : "text-slate-400"}`}>Iron Knees</h4>
                        <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${ironKneesUnlocked ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
                          {ironKneesUnlocked ? "UNLOCKED" : "LOCKED"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 leading-tight">0 knee-valgus collapses flagged during session.</p>
                    </div>
                  </div>

                  {/* Static Titan */}
                  <div className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${staticTitanUnlocked ? "bg-cyan-950/40 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]" : "bg-slate-950/60 border-slate-800 opacity-60"}`}>
                    <div className={`text-2xl p-2 rounded-lg ${staticTitanUnlocked ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-500"}`}>⏱️</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`font-mono font-bold text-xs uppercase tracking-wider ${staticTitanUnlocked ? "text-cyan-300" : "text-slate-400"}`}>Static Titan</h4>
                        <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${staticTitanUnlocked ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
                          {staticTitanUnlocked ? "UNLOCKED" : "LOCKED"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 leading-tight">Averaged ≥ 2.0s hold pause at rep bottom.</p>
                    </div>
                  </div>

                  {/* Anti-Ego Master */}
                  <div className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${antiEgoUnlocked ? "bg-purple-950/40 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]" : "bg-slate-950/60 border-slate-800 opacity-60"}`}>
                    <div className={`text-2xl p-2 rounded-lg ${antiEgoUnlocked ? "bg-purple-500/20 text-purple-300" : "bg-slate-800 text-slate-500"}`}>🚀</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`font-mono font-bold text-xs uppercase tracking-wider ${antiEgoUnlocked ? "text-purple-300" : "text-slate-400"}`}>Anti-Ego Master</h4>
                        <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${antiEgoUnlocked ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
                          {antiEgoUnlocked ? "UNLOCKED" : "LOCKED"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 leading-tight">0 rushed reps or ego-lift penalties incurred.</p>
                    </div>
                  </div>

                  {/* Critical Striker */}
                  <div className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${criticalStrikerUnlocked ? "bg-amber-950/40 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]" : "bg-slate-950/60 border-slate-800 opacity-60"}`}>
                    <div className={`text-2xl p-2 rounded-lg ${criticalStrikerUnlocked ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-500"}`}>⚡</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`font-mono font-bold text-xs uppercase tracking-wider ${criticalStrikerUnlocked ? "text-amber-300" : "text-slate-400"}`}>Critical Striker</h4>
                        <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${criticalStrikerUnlocked ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
                          {criticalStrikerUnlocked ? "UNLOCKED" : "LOCKED"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 leading-tight">Landed 5+ critical hit reps or high combo streak.</p>
                    </div>
                  </div>
                </div>

                {/* Auto-Restart Ring & Action */}
                <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4 text-left">
                    <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
                      <svg className="w-14 h-14 -rotate-90 transform" viewBox="0 0 60 60">
                        <circle cx="30" cy="30" r="24" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-800" />
                        <circle
                          cx="30"
                          cy="30"
                          r="24"
                          stroke="currentColor"
                          strokeWidth="4"
                          strokeDasharray={150.8}
                          strokeDashoffset={150.8 * (1 - game.autoRestartSeconds / 10)}
                          strokeLinecap="round"
                          fill="transparent"
                          className={`${isVictory ? "text-emerald-400" : "text-amber-400"} transition-all duration-1000 ease-linear`}
                        />
                      </svg>
                      <span className="absolute font-mono font-black text-sm text-white">{game.autoRestartSeconds}s</span>
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-white uppercase tracking-wider">Next Target Inbound</div>
                      <div className="text-[11px] font-mono text-slate-400">Auto-calibrating in {game.autoRestartSeconds}s...</div>
                    </div>
                  </div>

                  <button
                    onClick={startCalibration}
                    className={`w-full sm:w-auto px-6 py-3 rounded-xl font-black font-mono text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2 ${
                      isVictory
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                        : "bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                    }`}
                  >
                    <span>⚡ Fight Again Now</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </main>
    </>
  );
}