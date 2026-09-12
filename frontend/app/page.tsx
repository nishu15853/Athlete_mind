"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";

// ---------------------------------------------------------------------------
// Types & Declarations
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    Pose: any;
  }
}

type ExerciseType = "squats" | "pushups" | "overhead_press" | "rdl";
type DifficultyType = "rehab" | "standard" | "athlete";

interface BioEnginePacket {
  event?: string;
  exercise_type?: string;
  difficulty?: string;
  view_orientation?: string;
  status: string;
  phase: string;
  primary_angle?: number;
  primary_angle_name?: string;
  secondary_angle?: number;
  secondary_angle_name?: string;
  knee_angle?: number;
  hip_angle?: number;
  rep_count: number;
  hold_time?: number;
  hold_progress?: number;
  hold_target?: number;
  damage?: number;
  damage_taken?: number;
  purity?: number;
  has_fault?: boolean;
  fault_type?: string;
  knee_caved_in?: boolean;
  valgus?: boolean;
  weapon_overheated?: boolean;
  error?: string;
  message: string;
  audio_cue?: string;
  is_critical?: boolean;
  active_joint_index?: number;
  fault_joint_indices?: number[];
  boss_hp?: number;
  boss_max_hp?: number;
  player_hp?: number;
  player_max_hp?: number;
  boss_state?: "STANDARD" | "ENRAGED" | "DEFEATED";
  boss_attack_timer?: number;
  incoming_attack?: boolean;
  parry_window_sec?: number;
  parry_success?: boolean;
  parry_failed?: boolean;
  combo_streak?: number;
  combo_multiplier?: number;
  streak_collapsed?: boolean;
  combat_damage_dealt?: number;
  combat_damage_taken?: number;
}

interface AngleSample {
  timestamp: number;
  angle: number;
}

interface RepDetail {
  repIndex: number;
  exercise: string;
  minAngle: number;
  holdDuration: number;
  purityScore: number;
  verdict: string;
  faults: string;
  timestamp: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  opacity: number;
  life: number;
  maxLife: number;
}

// ---------------------------------------------------------------------------
// Browser Audio Synthesizer (FX + Procedural Audio)
// ---------------------------------------------------------------------------

class AudioSynth {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  playHoldTick(progress: number) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      const baseFreq = 320 + Math.min(1.0, progress) * 480;
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // safe
    }
  }

  playCritHit() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);

      const ping = this.ctx.createOscillator();
      const pingGain = this.ctx.createGain();
      ping.type = "sine";
      ping.frequency.setValueAtTime(880, now);
      ping.frequency.exponentialRampToValueAtTime(1760, now + 0.18);

      pingGain.gain.setValueAtTime(0.2, now);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      ping.connect(pingGain);
      pingGain.connect(this.ctx.destination);
      ping.start(now);
      ping.stop(now + 0.18);
    } catch {
      // safe
    }
  }

  playStun() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.setValueAtTime(75, now + 0.18);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // safe
    }
  }

  playBossAttack() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch {
      // safe
    }
  }

  playVictory() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const start = this.ctx!.currentTime + idx * 0.12;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(start);
        osc.stop(start + 0.35);
      });
    } catch {
      // safe
    }
  }

  playDefeat() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [440, 392, 349.23, 293.66];
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const start = this.ctx!.currentTime + idx * 0.15;
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {
      // safe
    }
  }

  playParrySuccess() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Metallic clash primary
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(1200, now);
      osc1.frequency.exponentialRampToValueAtTime(750, now + 0.3);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // High metallic sheen
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(2400, now);
      osc2.frequency.exponentialRampToValueAtTime(1600, now + 0.25);
      gain2.gain.setValueAtTime(0.25, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.25);
    } catch {
      // safe
    }
  }

  playStreakBreak() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.35);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);

      // Dissonant sub-tone
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = "square";
      sub.frequency.setValueAtTime(145, now);
      sub.frequency.exponentialRampToValueAtTime(40, now + 0.25);
      subGain.gain.setValueAtTime(0.2, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 0.25);
    } catch {
      // safe
    }
  }

  playStreakLevelUp(multiplier: number) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const base = multiplier >= 3.0 ? 600 : multiplier >= 2.0 ? 500 : 400;
      const freqs = [base, base * 1.25, base * 1.5, base * 2.0];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const start = this.ctx!.currentTime + idx * 0.07;
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(start);
        osc.stop(start + 0.22);
      });
    } catch {
      // safe
    }
  }
}

const synth = new AudioSynth();

// ---------------------------------------------------------------------------
// Main Component: AthleteMind Multi-Exercise & 3D Clinician Engine
// ---------------------------------------------------------------------------

export default function AthleteMindPage() {
  const [scriptReady, setScriptReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Exercise & Difficulty Configuration
  const [exercise, setExercise] = useState<ExerciseType>("squats");
  const [difficulty, setDifficulty] = useState<DifficultyType>("standard");
  const [orientationView, setOrientationView] = useState<string>("front");

  // Dynamic Joint Angle Tracking
  const [primaryAngle, setPrimaryAngle] = useState(180);
  const [primaryAngleName, setPrimaryAngleName] = useState("Knee");
  const [secondaryAngle, setSecondaryAngle] = useState(180);
  const [secondaryAngleName, setSecondaryAngleName] = useState("Hip");
  const [activeJointIdx, setActiveJointIdx] = useState(25);
  const [faultJointIndices, setFaultJointIndices] = useState<number[]>([]);

  // Combat State
  const [playerHp, setPlayerHp] = useState(100);
  const [bossHp, setBossHp] = useState(500);
  const [bossAttackTimer, setBossAttackTimer] = useState(10.0);
  const [overheatMeter, setOverheatMeter] = useState(0);
  const [stunTimer, setStunTimer] = useState(0);
  const [isStunned, setIsStunned] = useState(false);

  // Phase 6: Arcade Combat & Mechanics
  const [bossState, setBossState] = useState<"STANDARD" | "ENRAGED" | "DEFEATED">("STANDARD");
  const [comboStreak, setComboStreak] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1.0);
  const [incomingAttack, setIncomingAttack] = useState(false);
  const [parryWindowSec, setParryWindowSec] = useState(0.0);
  const [screenGlitch, setScreenGlitch] = useState(false);

  const isEnraged = bossState === "ENRAGED" || (bossHp > 0 && bossHp <= 250);

  // Kinematics & Metrics
  const [repCount, setRepCount] = useState(0);
  const [formPurity, setFormPurity] = useState(100);
  const [holdProgress, setHoldProgress] = useState(0);
  const [targetHoldDuration, setTargetHoldDuration] = useState(1.5);

  // Banner
  const [combatBanner, setCombatBanner] = useState("READY • POSITION BODY");
  const [combatBannerType, setCombatBannerType] = useState<"WAITING" | "HOLD" | "CRIT" | "EGO_LIFT" | "FAULT">("WAITING");

  // Game Flow & Clinician Modal
  const [matchStatus, setMatchStatus] = useState<"ACTIVE" | "VICTORY" | "DEFEAT">("ACTIVE");
  const [showClinicianModal, setShowClinicianModal] = useState(false);
  const [battleStartTime, setBattleStartTime] = useState<number>(Date.now());

  // Clinician Telemetry History
  const [angleTrace, setAngleTrace] = useState<AngleSample[]>([]);
  const [repDetails, setRepDetails] = useState<RepDetail[]>([]);
  const [valgusCount, setValgusCount] = useState(0);
  const [egoLiftsCount, setEgoLiftsCount] = useState(0);
  const [postureFaultsCount, setPostureFaultsCount] = useState(0);
  const [minSessionAngle, setMinSessionAngle] = useState(180);
  const [holdDurations, setHoldDurations] = useState<number[]>([]);

  // DOM References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Engine Refs
  const landmarksRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const poseInstanceRef = useRef<any>(null);
  const isProcessingPoseRef = useRef(false);
  const animFrameIdRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const screenShakeRef = useRef(0);
  const lastHoldTickTimeRef = useRef(0);
  const lastTraceSampleTimeRef = useRef(0);
  const lastSpeechTimeRef = useRef(0);

  // Fast access mirrors
  const primaryAngleRef = useRef(180);
  const holdProgressRef = useRef(0);
  const isStunnedRef = useRef(false);
  const isEnragedRef = useRef(false);
  const activeJointIdxRef = useRef(25);
  const faultJointIndicesRef = useRef<number[]>([]);
  const exerciseRef = useRef<ExerciseType>("squats");
  const difficultyRef = useRef<DifficultyType>("standard");

  useEffect(() => {
    isEnragedRef.current = isEnraged;
  }, [isEnraged]);

  useEffect(() => {
    exerciseRef.current = exercise;
  }, [exercise]);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  // Real-Time Audio Biomechanical Coach (Browser SpeechSynthesis API with 3s cooldown)
  const speakCoachCue = useCallback((cue: string) => {
    if (!cue || synth.muted || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const now = Date.now();
    if (now - lastSpeechTimeRef.current < 3000) return; // 3-second cooldown throttle

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cue);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
      lastSpeechTimeRef.current = now;
    } catch {
      // safe
    }
  }, []);

  const spawnParticles = useCallback((cx: number, cy: number, count = 25, color = "#00f0ff") => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 5.0;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: 2.5 + Math.random() * 2.5,
        alpha: 1.0,
        life: 0,
        maxLife: 30 + Math.random() * 15,
      });
    }
  }, []);

  const spawnFloatingText = useCallback((text: string, x: number, y: number, color = "#ffd700", fontSize = 30) => {
    floatingTextsRef.current.push({
      id: Math.random().toString(),
      text,
      x,
      y,
      color,
      fontSize,
      opacity: 1.0,
      life: 0,
      maxLife: 45,
    });
  }, []);

  // Exercise Change Handler
  const handleSelectExercise = (newEx: ExerciseType) => {
    setExercise(newEx);
    exerciseRef.current = newEx;
    if (newEx === "pushups") {
      setPrimaryAngleName("Elbow");
      setSecondaryAngleName("Plank");
      setActiveJointIdx(13);
      activeJointIdxRef.current = 13;
    } else if (newEx === "overhead_press") {
      setPrimaryAngleName("Shoulder");
      setSecondaryAngleName("Spine");
      setActiveJointIdx(11);
      activeJointIdxRef.current = 11;
    } else if (newEx === "rdl") {
      setPrimaryAngleName("Hinge");
      setSecondaryAngleName("Knee");
      setActiveJointIdx(23);
      activeJointIdxRef.current = 23;
    } else {
      setPrimaryAngleName("Knee");
      setSecondaryAngleName("Hip");
      setActiveJointIdx(25);
      activeJointIdxRef.current = 25;
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          action: "set_exercise",
          exercise_type: newEx,
          difficulty: difficultyRef.current,
        })
      );
    }
    speakCoachCue(`Switched to ${newEx.replace("_", " ")}`);
  };

  // Difficulty Change Handler
  const handleSelectDifficulty = (newDiff: DifficultyType) => {
    setDifficulty(newDiff);
    difficultyRef.current = newDiff;
    setTargetHoldDuration(newDiff === "rehab" ? 1.0 : newDiff === "athlete" ? 2.0 : 1.5);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          action: "set_exercise",
          exercise_type: exerciseRef.current,
          difficulty: newDiff,
        })
      );
    }
    speakCoachCue(`${newDiff} mode activated`);
  };

  // Reset Session
  const handleResetCombat = useCallback(() => {
    setPlayerHp(100);
    setBossHp(500);
    setOverheatMeter(0);
    setStunTimer(0);
    setIsStunned(false);
    setRepCount(0);
    setFormPurity(100);
    setPrimaryAngle(180);
    setSecondaryAngle(180);
    setHoldProgress(0);
    setBossAttackTimer(10.0);
    setCombatBanner("READY • COMMENCE EXERCISE");
    setCombatBannerType("WAITING");
    setMatchStatus("ACTIVE");
    setShowClinicianModal(false);
    setBattleStartTime(Date.now());
    setValgusCount(0);
    setEgoLiftsCount(0);
    setPostureFaultsCount(0);
    setMinSessionAngle(180);
    setAngleTrace([]);
    setRepDetails([]);
    setHoldDurations([]);

    primaryAngleRef.current = 180;
    holdProgressRef.current = 0;
    isStunnedRef.current = false;
    particlesRef.current = [];
    floatingTextsRef.current = [];

    // Reset Phase 6 Arcade Combat State
    setBossState("STANDARD");
    setComboStreak(0);
    setComboMultiplier(1.0);
    setIncomingAttack(false);
    setParryWindowSec(0.0);
    setScreenGlitch(false);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: "reset" }));
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/pose";
    const httpUrl = wsUrl.replace(/^wss?:/, (m) => (m === "wss:" ? "https:" : "http:")).replace(/\/ws\/pose$/, "");
    fetch(`${httpUrl}/api/session-reset`, { method: "POST" }).catch(() => {});
  }, []);

  const handleToggleMute = () => {
    synth.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Download Clinical Telemetry CSV
  const handleDownloadCsv = () => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/pose";
    const httpUrl = wsUrl.replace(/^wss?:/, (m) => (m === "wss:" ? "https:" : "http:")).replace(/\/ws\/pose$/, "");

    fetch(`${httpUrl}/api/export-report`)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP error");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `athletemind_${exercise}_telemetry.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => {
        // Fallback: Client-Side CSV generation
        const headers = ["Rep_Index", "Exercise", "Min_Angle_Deg", "Hold_Duration_s", "Purity_Score_Pct", "Quality_Verdict", "Faults", "Timestamp"];
        const rows = repDetails.map((r) => [
          r.repIndex,
          r.exercise,
          r.minAngle,
          r.holdDuration,
          r.purityScore,
          r.verdict,
          r.faults,
          r.timestamp,
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `athletemind_${exercise}_telemetry.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
  };

  // Boss Attack & Overheat Timer
  useEffect(() => {
    if (matchStatus !== "ACTIVE") return;

    const interval = setInterval(() => {
      setStunTimer((prevStun) => {
        if (prevStun > 0) {
          const next = Math.max(0, prevStun - 0.1);
          if (next === 0) {
            setIsStunned(false);
            isStunnedRef.current = false;
          }
          return next;
        }
        return 0;
      });

      setOverheatMeter((prevOverheat) => {
        if (prevOverheat > 0) {
          return Math.max(0, prevOverheat - 3.5);
        }
        return 0;
      });

      // If WebSocket is not connected, use client-side attack timer fallback
      const isSocketActive = socketRef.current && socketRef.current.readyState === WebSocket.OPEN;
      if (!isSocketActive && holdProgressRef.current === 0) {
        setBossAttackTimer((prevTimer) => {
          if (prevTimer <= 0.1) {
            synth.playBossAttack();
            screenShakeRef.current = 22;

            setPlayerHp((hp) => {
              const nextHp = Math.max(0, hp - 20);
              if (nextHp <= 0) {
                setMatchStatus("DEFEAT");
                setShowClinicianModal(true);
                synth.playDefeat();
                speakCoachCue("Mission failed. Retreat and recover.");
              }
              return nextHp;
            });

            const canvas = canvasRef.current;
            if (canvas) {
              spawnParticles(canvas.width / 2, canvas.height * 0.4, 35, "#ff0055");
              spawnFloatingText("-20 BOSS STRIKE!", canvas.width / 2, canvas.height / 2, "#ff0055", 34);
            }

            return isEnragedRef.current ? 6.0 : 10.0;
          }
          return Math.max(0, Number((prevTimer - 0.1).toFixed(1)));
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [matchStatus, spawnParticles, spawnFloatingText, speakCoachCue]);

  // Match completion detection
  useEffect(() => {
    if (bossHp <= 0 && matchStatus === "ACTIVE") {
      setMatchStatus("VICTORY");
      setShowClinicianModal(true);
      synth.playVictory();
      speakCoachCue("Target destroyed! Outstanding biomechanical execution!");
    } else if (playerHp <= 0 && matchStatus === "ACTIVE") {
      setMatchStatus("DEFEAT");
      setShowClinicianModal(true);
      synth.playDefeat();
      speakCoachCue("Mission failed. Recover and retry.");
    }
  }, [bossHp, playerHp, matchStatus, speakCoachCue]);

  // ---------------------------------------------------------------------------
  // Canvas Render Loop with Dynamic Color-Coded Kinematic Skeleton
  // ---------------------------------------------------------------------------

  const renderCanvasPass = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Mirrored Camera Video with Screen Shake
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      ctx.save();
      if (screenShakeRef.current > 0) {
        const dx = (Math.random() - 0.5) * screenShakeRef.current;
        const dy = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(dx, dy);
        screenShakeRef.current *= 0.86;
        if (screenShakeRef.current < 0.5) screenShakeRef.current = 0;
      }
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();

      const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width * 0.75);
      if (isEnragedRef.current) {
        grad.addColorStop(0, "rgba(255, 0, 85, 0.04)");
        grad.addColorStop(1, "rgba(50, 5, 20, 0.8)");
      } else {
        grad.addColorStop(0, "rgba(5, 10, 20, 0.05)");
        grad.addColorStop(1, "rgba(5, 10, 20, 0.75)");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = "#0a0e1a";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#00f0ff";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("TARGET ACQUISITION IN PROGRESS...", width / 2, height / 2);
    }

    // 2. Corner Tech Brackets
    ctx.strokeStyle = isEnragedRef.current ? "rgba(255, 0, 85, 0.6)" : "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 2.5;
    const bSize = 22;
    ctx.beginPath();
    ctx.moveTo(14, 14 + bSize);
    ctx.lineTo(14, 14);
    ctx.lineTo(14 + bSize, 14);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width - 14 - bSize, 14);
    ctx.lineTo(width - 14, 14);
    ctx.lineTo(width - 14, 14 + bSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(14, height - 14 - bSize);
    ctx.lineTo(14, height - 14);
    ctx.lineTo(14 + bSize, height - 14);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width - 14 - bSize, height - 14);
    ctx.lineTo(width - 14, height - 14);
    ctx.lineTo(width - 14, height - 14 - bSize);
    ctx.stroke();

    // 3. Dynamic Color-Coded Kinematic Skeleton
    const landmarks = landmarksRef.current;
    if (landmarks && Array.isArray(landmarks) && landmarks.length >= 29) {
      const getPt = (idx: number) => {
        const pt = landmarks[idx];
        if (!pt || pt.visibility < 0.35) return null;
        return {
          x: (1.0 - pt.x) * width,
          y: pt.y * height,
          idx,
        };
      };

      const lSh = getPt(11);
      const rSh = getPt(12);
      const lEl = getPt(13);
      const rEl = getPt(14);
      const lWr = getPt(15);
      const rWr = getPt(16);
      const lHip = getPt(23);
      const rHip = getPt(24);
      const lKnee = getPt(25);
      const rKnee = getPt(26);
      const lAnk = getPt(27);
      const rAnk = getPt(28);

      const isFaultJoint = (idx1: number, idx2: number) => {
        const faults = faultJointIndicesRef.current;
        return faults.includes(idx1) || faults.includes(idx2);
      };

      const getBoneColor = (idx1: number, idx2: number) => {
        if (isStunnedRef.current) return "#ff0055";
        if (isFaultJoint(idx1, idx2)) return "#ff2a5f"; // Red / Yellow alert
        if (holdProgressRef.current >= 1.0) return "#10b981"; // Neon Green for target met
        if (holdProgressRef.current > 0) return "#ffd700"; // Gold holding
        return "#00f0ff"; // Default cyan
      };

      const drawBone = (p1: any, p2: any, color: string, lineWidth = 3.5) => {
        if (!p1 || !p2) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      };

      // Arms
      drawBone(lSh, rSh, getBoneColor(11, 12), 3.5);
      drawBone(lSh, lEl, getBoneColor(11, 13), 3.5);
      drawBone(lEl, lWr, getBoneColor(13, 15), 3.5);
      drawBone(rSh, rEl, getBoneColor(12, 14), 3.5);
      drawBone(rEl, rWr, getBoneColor(14, 16), 3.5);

      // Spine & Pelvis
      if (lSh && rSh && lHip && rHip) {
        const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
        const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
        drawBone(midSh, midHip, getBoneColor(11, 23), 4.0);
        drawBone(lHip, rHip, getBoneColor(23, 24), 4.0);
      }

      // Legs
      drawBone(lHip, lKnee, getBoneColor(23, 25), 4.5);
      drawBone(lKnee, lAnk, getBoneColor(25, 27), 4.5);
      drawBone(rHip, rKnee, getBoneColor(24, 26), 4.5);
      drawBone(rKnee, rAnk, getBoneColor(26, 28), 4.5);

      // Joint Halos
      const joints = [
        { pt: lSh, idx: 11, r: 5 },
        { pt: rSh, idx: 12, r: 5 },
        { pt: lEl, idx: 13, r: 5 },
        { pt: rEl, idx: 14, r: 5 },
        { pt: lWr, idx: 15, r: 4 },
        { pt: rWr, idx: 16, r: 4 },
        { pt: lHip, idx: 23, r: 6 },
        { pt: rHip, idx: 24, r: 6 },
        { pt: lKnee, idx: 25, r: 7 },
        { pt: rKnee, idx: 26, r: 7 },
        { pt: lAnk, idx: 27, r: 5 },
        { pt: rAnk, idx: 28, r: 5 },
      ];

      joints.forEach(({ pt, idx, r }) => {
        if (!pt) return;
        const col = isFaultJoint(idx, idx)
          ? "#ff2a5f"
          : idx === activeJointIdxRef.current
          ? holdProgressRef.current >= 1.0
            ? "#10b981"
            : "#ffd700"
          : "#00f0ff";

        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      });

      // Dynamic Circular Hold Gauge on Active Joint
      const activeIdx = activeJointIdxRef.current;
      const targetJoint = getPt(activeIdx) || getPt(activeIdx === 25 ? 26 : activeIdx === 13 ? 14 : activeIdx === 11 ? 12 : 24);

      if (targetJoint && holdProgressRef.current > 0) {
        const radius = 34;
        const progress = Math.min(1.0, holdProgressRef.current);
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + Math.PI * 2 * progress;

        ctx.save();
        ctx.beginPath();
        ctx.arc(targetJoint.x, targetJoint.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 4.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(targetJoint.x, targetJoint.y, radius, startAngle, endAngle);
        ctx.strokeStyle = progress >= 1.0 ? "#10b981" : "#ffd700";
        ctx.lineWidth = 5.5;
        ctx.shadowColor = progress >= 1.0 ? "#10b981" : "#ffd700";
        ctx.shadowBlur = 14;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(primaryAngleRef.current)}°`, targetJoint.x, targetJoint.y - radius - 6);
        ctx.restore();
      }
    }

    // 4. Update & Render Particles
    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life++;
      p.alpha = Math.max(0, 1.0 - p.life / p.maxLife);

      if (p.alpha <= 0 || p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }

    // 5. Floating Numbers
    const texts = floatingTextsRef.current;
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.y -= 1.6;
      t.life++;
      t.opacity = Math.max(0, 1.0 - t.life / t.maxLife);

      if (t.opacity <= 0 || t.life >= t.maxLife) {
        texts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.font = `black ${t.fontSize}px monospace`;
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 14;
      ctx.globalAlpha = t.opacity;
      ctx.textAlign = "center";
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Continuous MediaPipe Pose Loop & WebSocket Connection (Bilateral 3D Stream)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!scriptReady || typeof window === "undefined" || !window.Pose) return;

    let isRunning = true;

    const pose = new window.Pose({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    poseInstanceRef.current = pose;

    pose.onResults((results: any) => {
      if (!isRunning) return;
      if (results.poseLandmarks) {
        landmarksRef.current = results.poseLandmarks;

        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          const lms = results.poseLandmarks;
          const getCoord = (idx: number) => {
            const p = lms[idx];
            if (!p) return [0, 0, 0, 0];
            return [p.x, p.y, p.z || 0, p.visibility || 1];
          };

          // Bilateral 3D Coordinates Vector Payload [x, y, z, v]
          const payload = {
            exercise_type: exerciseRef.current,
            difficulty: difficultyRef.current,
            left: {
              shoulder: getCoord(11),
              elbow: getCoord(13),
              wrist: getCoord(15),
              hip: getCoord(23),
              knee: getCoord(25),
              ankle: getCoord(27),
            },
            right: {
              shoulder: getCoord(12),
              elbow: getCoord(14),
              wrist: getCoord(16),
              hip: getCoord(24),
              knee: getCoord(26),
              ankle: getCoord(28),
            },
          };
          socket.send(JSON.stringify(payload));
        }
      }
    });

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/pose";
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
      setCombatBanner("READY • POSITION BODY");
      setCombatBannerType("WAITING");
      // Synchronize chosen exercise and difficulty on connect
      socket.send(
        JSON.stringify({
          action: "set_exercise",
          exercise_type: exerciseRef.current,
          difficulty: difficultyRef.current,
        })
      );
    };

    socket.onclose = () => {
      setWsConnected(false);
    };

    socket.onerror = (err) => {
      console.warn("WebSocket status:", err);
      setWsConnected(false);
    };

    socket.onmessage = (event) => {
      if (!isRunning) return;
      try {
        const data: BioEnginePacket = JSON.parse(event.data);

        // Update Orientation
        if (data.view_orientation) {
          setOrientationView(data.view_orientation);
        }

        // Update Dynamic Angle Labels
        if (data.primary_angle_name) setPrimaryAngleName(data.primary_angle_name);
        if (data.secondary_angle_name) setSecondaryAngleName(data.secondary_angle_name);

        if (data.active_joint_index !== undefined) {
          setActiveJointIdx(data.active_joint_index);
          activeJointIdxRef.current = data.active_joint_index;
        }

        if (data.fault_joint_indices) {
          setFaultJointIndices(data.fault_joint_indices);
          faultJointIndicesRef.current = data.fault_joint_indices;
        }

        // Update Kinematics
        const currentPriAngle = data.primary_angle !== undefined ? data.primary_angle : data.knee_angle;
        if (currentPriAngle !== undefined) {
          setPrimaryAngle(Math.round(currentPriAngle));
          primaryAngleRef.current = currentPriAngle;

          if (currentPriAngle < minSessionAngle) {
            setMinSessionAngle(Math.round(currentPriAngle));
          }

          // 10Hz sparkline angle trace
          const nowMs = Date.now();
          if (nowMs - lastTraceSampleTimeRef.current >= 100) {
            const elapsedSec = (nowMs - battleStartTime) / 1000;
            setAngleTrace((prev) => [...prev.slice(-150), { timestamp: Number(elapsedSec.toFixed(1)), angle: currentPriAngle }]);
            lastTraceSampleTimeRef.current = nowMs;
          }
        }

        const currentSecAngle = data.secondary_angle !== undefined ? data.secondary_angle : data.hip_angle;
        if (currentSecAngle !== undefined) {
          setSecondaryAngle(Math.round(currentSecAngle));
        }

        if (data.rep_count !== undefined) {
          setRepCount(data.rep_count);
        }

        if (data.purity !== undefined) {
          setFormPurity(Math.round(data.purity));
        }

        // Phase 6 Boss Combat Synchronization
        if (data.boss_hp !== undefined) {
          setBossHp(data.boss_hp);
        }
        if (data.player_hp !== undefined) {
          setPlayerHp(data.player_hp);
        }
        if (data.boss_state) {
          setBossState(data.boss_state);
        }
        if (data.boss_attack_timer !== undefined) {
          setBossAttackTimer(data.boss_attack_timer);
        }
        if (data.incoming_attack !== undefined) {
          setIncomingAttack(data.incoming_attack);
        }
        if (data.parry_window_sec !== undefined) {
          setParryWindowSec(data.parry_window_sec);
        }
        if (data.combo_streak !== undefined) {
          setComboStreak(data.combo_streak);
        }
        if (data.combo_multiplier !== undefined) {
          setComboMultiplier(data.combo_multiplier);
        }

        // Handle Parry Deflection (Counter Attack)
        if (data.parry_success) {
          synth.playParrySuccess();
          screenShakeRef.current = 14;
          setCombatBanner("PARRY DEFLECTED! (+50 COUNTER DMG)");
          setCombatBannerType("CRIT");
          const canvas = canvasRef.current;
          if (canvas) {
            spawnParticles(canvas.width / 2, canvas.height * 0.45, 45, "#00f0ff");
            spawnFloatingText("🛡️ PARRY DEFLECT! -50", canvas.width / 2, canvas.height * 0.35, "#00f0ff", 36);
          }
        }

        // Handle Parry Failure (Heavy Direct Hit)
        if (data.parry_failed) {
          synth.playStun();
          synth.playBossAttack();
          screenShakeRef.current = 30;
          setScreenGlitch(true);
          setTimeout(() => setScreenGlitch(false), 500);
          setCombatBanner("PARRY FAILED - DIRECT HIT TAKEN (-35 HP)!");
          setCombatBannerType("EGO_LIFT");
          const canvas = canvasRef.current;
          if (canvas) {
            spawnParticles(canvas.width / 2, canvas.height * 0.5, 40, "#ff0055");
            spawnFloatingText("-35 HP BOSS CRUSH!", canvas.width / 2, canvas.height * 0.5, "#ff0055", 36);
          }
        }

        // Handle Streak Collapse
        if (data.streak_collapsed) {
          synth.playStreakBreak();
          setCombatBanner("FORM FAULT - COMBO STREAK COLLAPSED!");
          setCombatBannerType("FAULT");
          const canvas = canvasRef.current;
          if (canvas) {
            spawnFloatingText("STREAK BROKEN (1.0x)", canvas.width / 2, canvas.height * 0.6, "#ff4444", 30);
          }
        }

        // Audio Biomechanical Coach Cue
        if (data.audio_cue) {
          speakCoachCue(data.audio_cue);
        }

        // Handle Hold Progress & Audio Tick
        if (data.hold_progress !== undefined) {
          setHoldProgress(data.hold_progress);
          holdProgressRef.current = data.hold_progress;

          if (data.hold_progress > 0) {
            if (Date.now() - lastHoldTickTimeRef.current >= 280) {
              synth.playHoldTick(data.hold_progress);
              lastHoldTickTimeRef.current = Date.now();
            }
          }
        }

        // Handle Stun & Fault Events
        if (data.status === "penalty" || data.phase === "STUNNED" || (data.damage_taken && data.damage_taken > 0 && !data.parry_failed)) {
          setIsStunned(true);
          isStunnedRef.current = true;
          setOverheatMeter(100);
          setStunTimer(3.0);
          setCombatBanner(data.message || "FORM PENALTY - STUNNED!");
          setCombatBannerType("EGO_LIFT");
          setEgoLiftsCount((c) => c + 1);

          if (data.damage_taken && data.damage_taken > 0) {
            synth.playStun();
            screenShakeRef.current = 18;
            setPlayerHp((prev) => Math.max(0, prev - data.damage_taken!));
            const canvas = canvasRef.current;
            if (canvas) {
              spawnFloatingText(`-${data.damage_taken} HP STUN`, canvas.width / 2, canvas.height / 2 + 50, "#ff0055", 34);
            }
          }
        } else if (data.status === "hit" || data.event === "HOLD_HIT" || data.event === "REP_COMPLETE") {
          setIsStunned(false);
          isStunnedRef.current = false;
          setCombatBanner(data.message || "CRITICAL HIT!");
          setCombatBannerType("CRIT");

          const dmg = data.damage || 100;
          if (dmg > 0 && !data.parry_success) {
            synth.playCritHit();
            screenShakeRef.current = 16;
            setBossHp((prev) => Math.max(0, prev - dmg));

            const mult = data.combo_multiplier || 1.0;
            const canvas = canvasRef.current;
            if (canvas) {
              spawnParticles(canvas.width / 2, canvas.height * 0.6, 30, mult >= 3.0 ? "#ff0055" : "#ffd700");
              spawnFloatingText(
                mult > 1.0 ? `-${dmg} (x${mult.toFixed(1)})` : `-${dmg} CRIT!`,
                canvas.width / 2,
                canvas.height * 0.4,
                mult >= 3.0 ? "#ff2a5f" : "#ffd700",
                mult >= 3.0 ? 40 : 36
              );
            }
          }

          if (data.event === "REP_COMPLETE") {
            if (data.combo_multiplier && data.combo_multiplier > 1.0) {
              synth.playStreakLevelUp(data.combo_multiplier);
            }
            const holdDur = Math.max(1.0, data.hold_time || 1.5);
            setHoldDurations((prev) => [...prev, holdDur]);
            setRepDetails((prev) => [
              ...prev,
              {
                repIndex: data.rep_count,
                exercise: exerciseRef.current,
                minAngle: Math.round(currentPriAngle || 90),
                holdDuration: holdDur,
                purityScore: data.purity || 100,
                verdict: data.has_fault ? (data.fault_type?.toUpperCase() || "FAULT") : "OPTIMAL",
                faults: data.fault_type || "NONE",
                timestamp: new Date().toLocaleTimeString(),
              },
            ]);
          }
        } else if (data.phase === "HOLDING") {
          setIsStunned(false);
          isStunnedRef.current = false;
          setCombatBanner(`HOLD POSITION... (${(data.hold_time || 0).toFixed(1)}s / ${(data.hold_target || 1.5)}s)`);
          setCombatBannerType("HOLD");
        } else if (data.has_fault) {
          setIsStunned(false);
          isStunnedRef.current = false;
          setCombatBanner(data.message);
          setCombatBannerType("FAULT");
          if (data.fault_type === "valgus") setValgusCount((v) => v + 1);
          else setPostureFaultsCount((p) => p + 1);
        } else {
          setIsStunned(false);
          isStunnedRef.current = false;
          setCombatBanner(data.message || "READY • COMMENCE EXERCISE");
          setCombatBannerType("WAITING");
        }
      } catch (err) {
        console.error("Packet parse error:", err);
      }
    };

    const startCamera = async () => {
      try {
        let stream = streamRef.current;
        if (!stream) {
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

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);

        const loop = async () => {
          if (!isRunning) return;

          renderCanvasPass();

          if (
            videoRef.current &&
            videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            !isProcessingPoseRef.current &&
            poseInstanceRef.current
          ) {
            isProcessingPoseRef.current = true;
            poseInstanceRef.current
              .send({ image: videoRef.current })
              .catch(() => {})
              .finally(() => {
                isProcessingPoseRef.current = false;
              });
          }

          if (isRunning) {
            animFrameIdRef.current = requestAnimationFrame(loop);
          }
        };

        animFrameIdRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error("Camera access failed:", err);
        setCameraActive(false);
      }
    };

    startCamera();

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try {
        pose.close();
      } catch {
        // safe
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [scriptReady, renderCanvasPass, spawnParticles, spawnFloatingText, battleStartTime, minSessionAngle, speakCoachCue]);

  const purityColor = formPurity >= 90 ? "text-emerald-400" : formPurity >= 70 ? "text-amber-400" : "text-rose-500";
  const durationSeconds = Math.round((Date.now() - battleStartTime) / 1000);
  const avgHoldDuration = holdDurations.length > 0
    ? Number((holdDurations.reduce((a, b) => a + b, 0) / holdDurations.length).toFixed(2))
    : targetHoldDuration;

  // Rules-Based Clinical Recommendation Generator
  const getClinicalRecommendation = () => {
    if (exercise === "squats") {
      if (valgusCount > 2) {
        return "Medial knee collapse (valgus) detected: recommend gluteus medius conditioning, banded abduction squats, and clamshells.";
      }
      if (minSessionAngle > 100) {
        return "Limited squat depth: focus on ankle dorsiflexion and adductor mobility to achieve parallel depth.";
      }
      return "Symmetric lower extremity kinematics: bilateral joint flexion displays steady eccentric control.";
    } else if (exercise === "pushups") {
      if (postureFaultsCount > 2) {
        return "Core/lumbar sagging detected during push-ups: strengthen anterior core via RKC planks and hollow body holds.";
      }
      return "Optimal sagittal push-up mechanics: scapular protraction and lumbar neutral maintained.";
    } else if (exercise === "overhead_press") {
      if (postureFaultsCount > 2) {
        return "Lumbar hyperextension compensation observed: engage rectus abdominis and improve thoracic extension.";
      }
      return "True vertical pressing plane: scapular upward rotation and spinal bracing meet athletic standards.";
    } else {
      if (postureFaultsCount > 2) {
        return "Squatting the hinge detected: maintain soft knee flexion while emphasizing posterior hip drive and hamstring recruitment.";
      }
      return "Pure hip hinge mechanics: posterior chain load transfer and spinal neutrality verified.";
    }
  };

  return (
    <div className="relative w-screen h-screen bg-[#050811] text-white flex flex-col font-mono select-none overflow-hidden">
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* ------------------------------------------------------------------- */}
      {/* 1. TOP BAR: DUAL COMBAT HUD & CLINICIAN SHORTCUT                   */}
      {/* ------------------------------------------------------------------- */}
      <header className="relative z-20 flex items-center justify-between px-6 py-2.5 bg-[#0a0f1d]/95 border-b border-cyan-500/20 backdrop-blur-md">
        {/* Left: Pilot HP & Overheat */}
        <div className="flex items-center gap-3.5 w-72">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-lg shadow-[0_0_12px_rgba(6,182,212,0.3)]">
            🛡️
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs font-bold tracking-wider text-cyan-300 mb-1">
              <span>PILOT HP</span>
              <span>{playerHp} / 100</span>
            </div>
            <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-cyan-500/30 mb-1">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  playerHp > 40
                    ? "bg-gradient-to-r from-cyan-500 to-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                    : "bg-gradient-to-r from-rose-600 to-amber-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.7)]"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, playerHp))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-400">
              <span>OVERHEAT</span>
              <span>{stunTimer > 0 ? `STUNNED (${stunTimer.toFixed(1)}s)` : `${Math.round(overheatMeter)}%`}</span>
            </div>
          </div>
        </div>

        {/* Center: Live Telemetry */}
        <div className="flex items-center gap-3">
          <div className="text-center px-3 py-1 rounded-xl bg-black/60 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <div className="text-[9px] text-cyan-400 font-semibold tracking-widest uppercase">Reps</div>
            <div className="text-2xl font-black text-cyan-300 font-mono tracking-tight">
              {repCount.toString().padStart(2, "0")}
            </div>
          </div>

          <div className="text-center px-3 py-1 rounded-xl bg-black/60 border border-cyan-500/30">
            <div className="text-[9px] text-slate-400 font-semibold tracking-widest uppercase">Purity</div>
            <div className={`text-xl font-black ${purityColor} tracking-tight`}>
              {formPurity}%
            </div>
          </div>

          {/* Kinetic Combo Multiplier Badge */}
          <div
            className={`text-center px-3 py-1 rounded-xl border transition-all duration-300 ${
              comboMultiplier >= 3.0
                ? "bg-gradient-to-b from-rose-950/90 to-amber-950/90 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.8)] animate-pulse"
                : comboMultiplier >= 2.0
                ? "bg-purple-950/80 border-fuchsia-400 text-fuchsia-300 shadow-[0_0_15px_rgba(217,70,239,0.5)]"
                : comboMultiplier >= 1.5
                ? "bg-amber-950/80 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                : "bg-black/60 border-slate-700/50 text-slate-400"
            }`}
          >
            <div className="text-[9px] uppercase font-semibold tracking-widest flex items-center justify-center gap-1">
              <span>Streak</span>
              <span className="text-white font-mono font-bold">[{comboStreak}]</span>
            </div>
            <div className="text-sm font-black font-mono tracking-wider">
              {comboMultiplier >= 3.0
                ? "x3.0 HYPER"
                : comboMultiplier >= 2.0
                ? "x2.0 SURGE"
                : comboMultiplier >= 1.5
                ? "x1.5 COMBAT"
                : "x1.0 BASE"}
            </div>
          </div>

          <div className="text-center px-3 py-1 rounded-xl bg-black/60 border border-slate-700/50">
            <div className="text-[9px] text-slate-400 font-semibold tracking-widest uppercase">
              {primaryAngleName} / {secondaryAngleName}
            </div>
            <div className="text-sm font-bold text-slate-200 tracking-tight font-mono">
              {primaryAngle}° / {secondaryAngle}°
            </div>
          </div>

          <div
            className={`text-center px-3 py-1 rounded-xl bg-black/60 border ${
              incomingAttack
                ? "border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.8)] animate-pulse"
                : isEnraged
                ? "border-rose-500/60"
                : "border-rose-500/40"
            }`}
          >
            <div className="text-[9px] text-rose-400 font-semibold tracking-widest uppercase">
              {incomingAttack ? "PARRY ALERT" : isEnraged ? "Enraged Cycle" : "Boss Strike"}
            </div>
            <div
              className={`text-base font-black font-mono tracking-tight ${
                incomingAttack
                  ? "text-rose-400 animate-bounce"
                  : bossAttackTimer <= 3.0
                  ? "text-rose-400 animate-ping"
                  : "text-amber-300"
              }`}
            >
              {incomingAttack ? `PARRY: ${parryWindowSec.toFixed(1)}s` : `${bossAttackTimer.toFixed(1)}s`}
            </div>
          </div>
        </div>

        {/* Right: Boss HP & Clinician Button */}
        <div className="flex items-center gap-3.5 w-80 justify-end">
          <div className="flex-1 text-right">
            <div className="flex justify-between text-xs font-bold tracking-wider mb-1">
              <span className={isEnraged ? "text-rose-500 animate-pulse font-black flex items-center justify-end gap-1" : "text-violet-400"}>
                {isEnraged ? (
                  <>
                    <span className="text-amber-400">🔥</span>
                    <span>CYBER-COLOSSUS [OVERCLOCKED]</span>
                  </>
                ) : (
                  "CYBER-COLOSSUS"
                )}
              </span>
              <span className="text-rose-300 font-mono">{bossHp} / 500</span>
            </div>
            <div
              className={`h-2.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border mb-1 ${
                isEnraged ? "border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.7)]" : "border-rose-500/40"
              }`}
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isEnraged
                    ? "bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.9)]"
                    : "bg-gradient-to-r from-violet-600 to-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, (bossHp / 500) * 100))}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => setShowClinicianModal(true)}
            className="px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-500/40 text-xs font-bold text-emerald-300 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.3)] flex items-center gap-1.5"
            title="Open Clinician Debrief"
          >
            <span>📊 DEBRIEF</span>
          </button>
        </div>
      </header>

      {/* Dynamic Boss Enraged Alert Banner */}
      {isEnraged && matchStatus === "ACTIVE" && (
        <div className="relative z-20 w-full bg-gradient-to-r from-red-950/95 via-rose-900/95 to-red-950/95 border-b border-rose-500/60 py-1 px-4 text-center text-[11px] font-black uppercase tracking-widest text-rose-200 flex items-center justify-center gap-2 animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.5)]">
          <span className="text-amber-300 animate-ping">⚡</span>
          <span>WARNING: SYSTEM OVERCLOCKED — BOSS ATTACK INTERVAL REDUCED TO 6.0s</span>
          <span className="text-amber-300 animate-ping">⚡</span>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 2. SECONDARY CONTROLS BAR: EXERCISE & DIFFICULTY SELECTORS          */}
      {/* ------------------------------------------------------------------- */}
      <div className="relative z-10 flex flex-wrap items-center justify-between px-6 py-2 bg-[#060a14]/90 border-b border-slate-800 text-xs">
        {/* Exercise Carousel / Pill Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Movement:</span>
          <div className="flex items-center bg-black/60 rounded-xl p-0.5 border border-slate-800">
            <button
              onClick={() => handleSelectExercise("squats")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                exercise === "squats"
                  ? "bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🏋️ SQUAT
            </button>
            <button
              onClick={() => handleSelectExercise("pushups")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                exercise === "pushups"
                  ? "bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              💪 PUSH-UP
            </button>
            <button
              onClick={() => handleSelectExercise("overhead_press")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                exercise === "overhead_press"
                  ? "bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⚡ OVERHEAD PRESS
            </button>
            <button
              onClick={() => handleSelectExercise("rdl")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                exercise === "rdl"
                  ? "bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🎯 RDL HINGE
            </button>
          </div>
        </div>

        {/* Difficulty Modifiers */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mobility Tier:</span>
          <div className="flex items-center bg-black/60 rounded-xl p-0.5 border border-slate-800">
            <button
              onClick={() => handleSelectDifficulty("rehab")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                difficulty === "rehab"
                  ? "bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  : "text-emerald-400/70 hover:text-emerald-300"
              }`}
            >
              🟢 REHAB (1.0s)
            </button>
            <button
              onClick={() => handleSelectDifficulty("standard")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                difficulty === "standard"
                  ? "bg-blue-500 text-black shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  : "text-blue-400/70 hover:text-blue-300"
              }`}
            >
              🔵 STANDARD (1.5s)
            </button>
            <button
              onClick={() => handleSelectDifficulty("athlete")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                difficulty === "athlete"
                  ? "bg-purple-500 text-black shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                  : "text-purple-400/70 hover:text-purple-300"
              }`}
            >
              🟣 ATHLETE (2.0s)
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 3. MAIN ARENA VIEWPORT                                              */}
      {/* ------------------------------------------------------------------- */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center p-3 sm:p-4 bg-gradient-to-b from-[#050811] via-[#080d1a] to-[#04060d]">
        <div
          className={`relative w-full max-w-5xl aspect-[4/3] max-h-[78vh] rounded-3xl overflow-hidden border-2 transition-all duration-500 bg-black ${
            isEnraged
              ? "border-rose-500/80 shadow-[0_0_60px_rgba(244,63,94,0.4)]"
              : "border-cyan-500/30 shadow-[0_0_50px_rgba(0,240,255,0.12)]"
          }`}
        >
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full h-full object-cover"
          />

          {/* Red Glitch Direct Hit Damage Overlay */}
          {screenGlitch && (
            <div className="absolute inset-0 z-35 bg-rose-600/35 pointer-events-none mix-blend-screen animate-pulse backdrop-invert" />
          )}

          {/* Timed Evasion & Biomechanical Parry Reticle Overlay */}
          {incomingAttack && matchStatus === "ACTIVE" && (
            <div className="absolute inset-0 z-35 flex flex-col items-center justify-center pointer-events-none">
              <div className="relative flex flex-col items-center p-6 rounded-3xl bg-black/85 border-2 border-rose-500 shadow-[0_0_50px_rgba(244,63,94,0.8)] backdrop-blur-md animate-pulse max-w-md w-full mx-4">
                <div className="text-4xl mb-2 animate-bounce">
                  {holdProgress > 0 ? "🛡️" : "⚠️"}
                </div>
                <div className="text-rose-400 font-black text-lg sm:text-xl tracking-widest uppercase text-center mb-1">
                  INCOMING BOSS STRIKE
                </div>
                <div className="text-xs sm:text-sm font-bold text-amber-300 text-center tracking-wider mb-3">
                  {holdProgress > 0 ? "SHIELD ENGAGED • MAINTAIN DEPTH TO DEFLECT!" : "PARRY BY SQUATTING & HOLDING DEPTH!"}
                </div>

                {/* Parry Timer Countdown Bar */}
                <div className="w-56 h-3 bg-slate-900 rounded-full overflow-hidden border border-rose-400/60 p-0.5 mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      holdProgress > 0
                        ? "bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                        : "bg-gradient-to-r from-amber-400 to-rose-600 shadow-[0_0_12px_rgba(244,63,94,0.8)]"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, (parryWindowSec / 3.0) * 100))}%` }}
                  />
                </div>

                <div className="text-xs font-mono font-black text-rose-300">
                  PARRY WINDOW: <span className="text-white text-sm">{parryWindowSec.toFixed(1)}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Center Feedback Banner */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
            <div
              className={`px-7 py-2.5 rounded-2xl border-2 backdrop-blur-md transition-all duration-200 uppercase font-black tracking-widest text-xs sm:text-sm flex items-center gap-2.5 shadow-2xl ${
                combatBannerType === "EGO_LIFT"
                  ? "bg-rose-950/90 border-rose-500 text-rose-300 shadow-[0_0_35px_rgba(244,63,94,0.7)] animate-bounce"
                  : combatBannerType === "CRIT"
                  ? "bg-emerald-950/90 border-emerald-400 text-emerald-200 shadow-[0_0_35px_rgba(52,211,153,0.7)] scale-105"
                  : combatBannerType === "HOLD"
                  ? "bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_25px_rgba(6,182,212,0.5)]"
                  : combatBannerType === "FAULT"
                  ? "bg-amber-950/90 border-amber-500 text-amber-200 shadow-[0_0_25px_rgba(245,158,11,0.5)]"
                  : "bg-slate-900/80 border-slate-700 text-slate-300 shadow-lg"
              }`}
            >
              <span>
                {combatBannerType === "EGO_LIFT"
                  ? "⚠️"
                  : combatBannerType === "CRIT"
                  ? "💥"
                  : combatBannerType === "HOLD"
                  ? "⏱️"
                  : combatBannerType === "FAULT"
                  ? "⚡"
                  : "🎯"}
              </span>
              <span>{combatBanner}</span>
            </div>

            {holdProgress > 0 && (
              <div className="w-60 mx-auto mt-2 h-2 bg-slate-900/90 rounded-full overflow-hidden border border-cyan-400/40 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-300 transition-all duration-75 shadow-[0_0_10px_rgba(251,191,36,0.8)]"
                  style={{ width: `${Math.min(100, holdProgress * 100)}%` }}
                />
              </div>
            )}
          </div>

          <div className="absolute bottom-4 left-6 z-20 flex items-center gap-2 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 border border-slate-700">
              <span className={`w-2 h-2 rounded-full ${cameraActive ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span>{cameraActive ? "3D SENSOR ACTIVE" : "INITIALIZING CAMERA..."}</span>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-black/60 border border-slate-700 text-cyan-300 text-[11px]">
              VIEW: {orientationView.toUpperCase()}
            </div>
            <div className="px-2.5 py-1 rounded-full bg-black/60 border border-slate-700 text-amber-300 text-[11px]">
              HOLD: {targetHoldDuration.toFixed(1)}s
            </div>
          </div>

          <div className="absolute bottom-4 right-6 z-20 flex items-center gap-3">
            <button
              onClick={handleToggleMute}
              className="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/90 border border-slate-700 hover:border-cyan-400 text-xs text-slate-300 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>{isMuted ? "🔇 MUTED" : "🔊 COACH AUDIO"}</span>
            </button>
            <button
              onClick={handleResetCombat}
              className="px-3 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 hover:border-cyan-400 text-xs text-cyan-300 font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>🔄 RESTART</span>
            </button>
          </div>
        </div>
      </main>

      {/* ------------------------------------------------------------------- */}
      {/* 4. PHASE 5 CLINICIAN MODE / POST-MISSION DEBRIEF MODAL              */}
      {/* ------------------------------------------------------------------- */}
      {showClinicianModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-[#0a101f] border-2 border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_70px_rgba(0,240,255,0.25)] flex flex-col gap-6 animate-in fade-in zoom-in duration-300">
            {/* Header with Outcome Banner */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-950/80 border border-cyan-400/50 flex items-center justify-center text-2xl shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                  {matchStatus === "VICTORY" ? "🏆" : matchStatus === "DEFEAT" ? "💀" : "📊"}
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-cyan-300">
                    {exercise.toUpperCase()} TELEMETRY • {matchStatus === "VICTORY" ? "MISSION ACCOMPLISHED" : matchStatus === "DEFEAT" ? "MISSION FAILED" : "CLINICAL DEBRIEF"}
                  </h2>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">
                    True 3D Vector Biomechanics & Kinematic Stability Report ({difficulty.toUpperCase()} MODE)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowClinicianModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-600 text-slate-300 text-sm font-bold flex items-center justify-center cursor-pointer transition-all"
              >
                ✕
              </button>
            </div>

            {/* 5-Metric Clinical Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-2xl bg-black/50 border border-slate-800 flex flex-col items-center text-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Total Reps</span>
                <span className="text-2xl font-black text-cyan-300 font-mono">{repCount}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 border border-slate-800 flex flex-col items-center text-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Form Purity</span>
                <span className={`text-2xl font-black font-mono ${purityColor}`}>{formPurity}%</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 border border-slate-800 flex flex-col items-center text-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Mean Hold Time</span>
                <span className="text-2xl font-black text-amber-300 font-mono">{avgHoldDuration}s</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 border border-slate-800 flex flex-col items-center text-center">
                <span className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Form Deviations</span>
                <span className={`text-2xl font-black font-mono ${valgusCount + postureFaultsCount === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {valgusCount + postureFaultsCount}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 border border-slate-800 flex flex-col items-center text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Max Joint ROM</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  {minSessionAngle < 180 ? `${minSessionAngle}°` : "90°"}
                </span>
              </div>
            </div>

            {/* Visual Kinematic Trace (SVG Telemetry Sparkline) */}
            <div className="p-4 rounded-2xl bg-black/60 border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-slate-300 uppercase tracking-wider">
                  📈 Visual 3D Kinematic Trace ({primaryAngleName} Angle Over Time)
                </span>
                <span className="text-[11px] text-emerald-400">
                  Green Band = Target Threshold • Top Line = Baseline Lockout
                </span>
              </div>

              {/* SVG Sparkline */}
              <div className="relative w-full h-44 bg-[#080d1a] rounded-xl overflow-hidden border border-slate-800 p-2">
                <svg className="w-full h-full" viewBox="0 0 600 160" preserveAspectRatio="none">
                  {/* Depth Target Threshold Band */}
                  <rect x="0" y="80" width="600" height="80" fill="rgba(16, 185, 129, 0.12)" />
                  <line x1="0" y1="80" x2="600" y2="80" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" />
                  <text x="8" y="74" fill="#10b981" fontSize="10" fontFamily="monospace">
                    CLINICAL TARGET ({exercise === "overhead_press" ? "165° TOP" : "90° BOTTOM"})
                  </text>

                  {/* Standing / Lockout Baseline */}
                  <line x1="0" y1="20" x2="600" y2="20" stroke="#64748b" strokeWidth="1" strokeDasharray="3 3" />
                  <text x="8" y="16" fill="#64748b" fontSize="10" fontFamily="monospace">
                    STARTING BASELINE
                  </text>

                  {/* Kinematic Angle Polyline */}
                  {angleTrace.length >= 2 ? (
                    <polyline
                      fill="none"
                      stroke="#00f0ff"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={angleTrace
                        .map((pt, idx) => {
                          const x = (idx / (angleTrace.length - 1)) * 600;
                          const norm = Math.max(0, Math.min(1, (180 - pt.angle) / 120));
                          const y = 10 + norm * 130;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                  ) : (
                    <text x="300" y="90" fill="#64748b" fontSize="12" fontFamily="monospace" textAnchor="middle">
                      Awaiting live kinematic telemetry data...
                    </text>
                  )}
                </svg>
              </div>
            </div>

            {/* Clinical Recommendation Callout */}
            <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-start gap-3 text-left">
              <span className="text-xl">🩺</span>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-cyan-300 mb-0.5">
                  Clinical Recommendation & Biomechanical Assessment:
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  {getClinicalRecommendation()}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={handleDownloadCsv}
                className="flex-1 py-3 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-400 text-slate-200 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                <span>📥 DOWNLOAD TELEMETRY (CSV)</span>
              </button>
              <button
                onClick={handleResetCombat}
                className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2"
              >
                <span>⚔️ NEXT TARGET / RESTART</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
