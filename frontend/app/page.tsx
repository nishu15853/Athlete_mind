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

interface BioEnginePacket {
  event?: string;
  status: string;
  phase: string;
  primary_angle: number;
  secondary_angle: number;
  knee_angle: number;
  hip_angle: number;
  message: string;
  error?: string;
  fault_detected?: boolean;
  fault_name?: string;
  valgus?: boolean;
  warning?: string;
  voice_cue?: string;
  hold_progress: number;
  hold_time: number;
  rep_count: number;
  purity: number;
  symmetry?: number;
  damage: number;
  damage_taken: number;
  coach_feedback?: string;
  weapon_overheated?: boolean;
  is_critical?: boolean;
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

interface TelemetryRep {
  repNumber: number;
  kneeAngle: number;
  hipAngle: number;
  holdTime: number;
  purity: number;
  fault: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Web Audio Synthesizer Engine
// ---------------------------------------------------------------------------

class ArcadeSoundEngine {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
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
      const baseFreq = 300 + Math.min(1.0, progress) * 400;
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  playHit() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Heavy bass punch
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(220, now);
      osc1.frequency.exponentialRampToValueAtTime(45, now + 0.35);

      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Sci-fi laser ping
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now);
      osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

      gain2.gain.setValueAtTime(0.18, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.2);
    } catch {
      // noop
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
      osc.frequency.setValueAtTime(85, now + 0.15);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      // noop
    }
  }

  playVictory() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
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
      // noop
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
        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {
      // noop
    }
  }
}

const soundEngine = new ArcadeSoundEngine();

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ArcadeBossPage() {
  const [scriptReady, setScriptReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"INITIALIZING" | "ACTIVE" | "ERROR">("INITIALIZING");
  const [wsConnected, setWsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Streamlined Arcade Combat State
  const [playerHp, setPlayerHp] = useState(100);
  const [bossHp, setBossHp] = useState(500);
  const [repCount, setRepCount] = useState(0);
  const [formPurity, setFormPurity] = useState(100);
  const [kneeAngle, setKneeAngle] = useState(180);
  const [holdProgress, setHoldProgress] = useState(0);
  const [combatCallout, setCombatCallout] = useState("CALIBRATING CAMERA...");
  const [isStunned, setIsStunned] = useState(false);
  const [isCritical, setIsCritical] = useState(false);

  // Post-Match Telemetry Modal State
  const [matchOver, setMatchOver] = useState(false);
  const [matchResult, setMatchResult] = useState<"VICTORY" | "DEFEAT">("VICTORY");
  const [matchStats, setMatchStats] = useState({
    totalReps: 0,
    avgPurity: 100,
    avgHoldTime: 0,
    totalFaults: 0,
    durationSeconds: 0,
  });

  // Zero-Flicker Hardware DOM references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // High-Frequency Kinematics State stored in refs to prevent React render-thrashing
  const landmarksRef = useRef<any>(null);
  const isProcessingPose = useRef(false);
  const poseInstance = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Telemetry buffer in ref
  const telemetryHistoryRef = useRef<TelemetryRep[]>([]);
  const matchStartTimeRef = useRef<number>(Date.now());
  const faultsCountRef = useRef<number>(0);
  const lastHoldAudioTickRef = useRef<number>(0);

  // Particles & Visual FX in refs
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const screenShakeRef = useRef<number>(0);

  // Keep mirrors of values for high-speed access in render loop
  const playerHpRef = useRef(100);
  const bossHpRef = useRef(500);
  const repCountRef = useRef(0);
  const holdProgressRef = useRef(0);
  const kneeAngleRef = useRef(180);
  const isStunnedRef = useRef(false);

  useEffect(() => {
    playerHpRef.current = playerHp;
  }, [playerHp]);
  useEffect(() => {
    bossHpRef.current = bossHp;
  }, [bossHp]);
  useEffect(() => {
    repCountRef.current = repCount;
  }, [repCount]);
  useEffect(() => {
    holdProgressRef.current = holdProgress;
  }, [holdProgress]);
  useEffect(() => {
    kneeAngleRef.current = kneeAngle;
  }, [kneeAngle]);
  useEffect(() => {
    isStunnedRef.current = isStunned;
  }, [isStunned]);

  // Toggle audio
  const handleToggleMute = () => {
    soundEngine.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Spawn neon particles from joint coordinate
  const spawnHitParticles = useCallback((cx: number, cy: number, count = 20, color = "#00f0ff") => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 5.0;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: 2 + Math.random() * 3,
        alpha: 1.0,
        life: 0,
        maxLife: 30 + Math.random() * 20,
      });
    }
  }, []);

  // Spawn floating combat damage text
  const spawnFloatingText = useCallback((text: string, x: number, y: number, color = "#fae100", fontSize = 28) => {
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

  // Reset Fight Encounter
  const handleFightAgain = useCallback(() => {
    setPlayerHp(100);
    setBossHp(500);
    setRepCount(0);
    setFormPurity(100);
    setHoldProgress(0);
    setCombatCallout("READY • SQUAT DOWN");
    setIsStunned(false);
    setIsCritical(false);
    setMatchOver(false);

    playerHpRef.current = 100;
    bossHpRef.current = 500;
    repCountRef.current = 0;
    holdProgressRef.current = 0;
    isStunnedRef.current = false;
    faultsCountRef.current = 0;
    telemetryHistoryRef.current = [];
    matchStartTimeRef.current = Date.now();
    particlesRef.current = [];
    floatingTextsRef.current = [];

    // Notify backend
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: "reset" }));
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/pose";
    const httpUrl = wsUrl.replace(/^wss?:/, (m) => (m === "wss:" ? "https:" : "http:")).replace(/\/ws\/pose$/, "");
    fetch(`${httpUrl}/api/session-reset`, { method: "POST" }).catch(() => {});
  }, []);

  // Trigger Match Completion Modal
  const triggerMatchEnd = useCallback((result: "VICTORY" | "DEFEAT") => {
    setMatchOver(true);
    setMatchResult(result);
    if (result === "VICTORY") {
      soundEngine.playVictory();
    } else {
      soundEngine.playDefeat();
    }

    const duration = Math.round((Date.now() - matchStartTimeRef.current) / 1000);
    const history = telemetryHistoryRef.current;
    const avgPur = history.length > 0
      ? Math.round(history.reduce((a, b) => a + b.purity, 0) / history.length)
      : 100;
    const avgHold = history.length > 0
      ? Number((history.reduce((a, b) => a + b.holdTime, 0) / history.length).toFixed(2))
      : 0;

    setMatchStats({
      totalReps: repCountRef.current,
      avgPurity: avgPur,
      avgHoldTime: avgHold,
      totalFaults: faultsCountRef.current,
      durationSeconds: duration,
    });
  }, []);

  // Download CSV Telemetry
  const handleDownloadCsv = () => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/pose";
    const httpUrl = wsUrl.replace(/^wss?:/, (m) => (m === "wss:" ? "https:" : "http:")).replace(/\/ws\/pose$/, "");

    // Try fetching from backend first
    fetch(`${httpUrl}/api/export-report`)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP error");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "athletemind_telemetry.csv";
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => {
        // Fallback: Generate Client-side CSV from local telemetry buffer
        const headers = ["Rep", "Knee_Angle_Deg", "Hip_Angle_Deg", "Hold_Duration_s", "Purity_Pct", "Faults", "Timestamp"];
        const rows = telemetryHistoryRef.current.map((r) => [
          r.repNumber,
          r.kneeAngle,
          r.hipAngle,
          r.holdTime,
          r.purity,
          r.fault,
          r.timestamp,
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "athletemind_telemetry.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
  };

  // ---------------------------------------------------------------------------
  // Canvas Rendering & Particle Animation Pipeline
  // ---------------------------------------------------------------------------

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Mirrored Camera Stream Pass
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      ctx.save();
      // Handle screen shake on hit or stun
      if (screenShakeRef.current > 0) {
        const dx = (Math.random() - 0.5) * screenShakeRef.current;
        const dy = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(dx, dy);
        screenShakeRef.current *= 0.88;
        if (screenShakeRef.current < 0.5) screenShakeRef.current = 0;
      }
      // Mirror video horizontally so natural movement matches reflection
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();

      // Subtle Cyberpunk Arena Vignette
      const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width * 0.7);
      grad.addColorStop(0, "rgba(5, 10, 20, 0.05)");
      grad.addColorStop(1, "rgba(5, 10, 20, 0.75)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      // Standby Canvas background
      ctx.fillStyle = "#0a0e17";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#00f0ff";
      ctx.font = "bold 16px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("INITIALIZING OPTICAL BIO-SENSOR...", width / 2, height / 2);
    }

    // 2. Sci-Fi Viewport HUD Corner Brackets
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 2;
    const bracketSize = 24;
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(16, 16 + bracketSize);
    ctx.lineTo(16, 16);
    ctx.lineTo(16 + bracketSize, 16);
    ctx.stroke();
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(width - 16 - bracketSize, 16);
    ctx.lineTo(width - 16, 16);
    ctx.lineTo(width - 16, 16 + bracketSize);
    ctx.stroke();
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(16, height - 16 - bracketSize);
    ctx.lineTo(16, height - 16);
    ctx.lineTo(16 + bracketSize, height - 16);
    ctx.stroke();
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(width - 16 - bracketSize, height - 16);
    ctx.lineTo(width - 16, height - 16);
    ctx.lineTo(width - 16, height - 16 - bracketSize);
    ctx.stroke();

    // 3. Cyberpunk Laser Skeleton & Halos Pass
    const landmarks = landmarksRef.current;
    if (landmarks && Array.isArray(landmarks) && landmarks.length >= 29) {
      // Coordinate converter helper (mirrored to match canvas)
      const getPt = (idx: number) => {
        const pt = landmarks[idx];
        if (!pt || pt.visibility < 0.4) return null;
        return {
          x: (1.0 - pt.x) * width,
          y: pt.y * height,
        };
      };

      const nose = getPt(0);
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

      const drawBone = (p1: any, p2: any, strokeColor = "#00f0ff", strokeWidth = 3.5) => {
        if (!p1 || !p2) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 10;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      };

      // Primary bones
      const skeletonColor = isStunnedRef.current ? "#ff0055" : "#00f0ff";
      const legColor = holdProgressRef.current > 0 ? "#ffd700" : skeletonColor;

      // Upper Body
      drawBone(lSh, rSh, skeletonColor, 4);
      drawBone(lSh, lEl, skeletonColor, 3);
      drawBone(lEl, lWr, skeletonColor, 2.5);
      drawBone(rSh, rEl, skeletonColor, 3);
      drawBone(rEl, rWr, skeletonColor, 2.5);

      // Spine & Torso
      if (lSh && rSh && lHip && rHip) {
        const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
        const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
        if (nose) drawBone(midSh, nose, skeletonColor, 2.5);
        drawBone(midSh, midHip, skeletonColor, 4.5);
        drawBone(lHip, rHip, skeletonColor, 4);
      }

      // Lower Kinetic Chain (Legs)
      drawBone(lHip, lKnee, legColor, 4.5);
      drawBone(lKnee, lAnk, legColor, 4.5);
      drawBone(rHip, rKnee, legColor, 4.5);
      drawBone(rKnee, rAnk, legColor, 4.5);

      // Joint Halos
      const joints = [
        { pt: nose, r: 4, col: "#ffffff" },
        { pt: lSh, r: 5, col: "#00f0ff" },
        { pt: rSh, r: 5, col: "#00f0ff" },
        { pt: lEl, r: 4, col: "#00f0ff" },
        { pt: rEl, r: 4, col: "#00f0ff" },
        { pt: lWr, r: 4, col: "#00f0ff" },
        { pt: rWr, r: 4, col: "#00f0ff" },
        { pt: lHip, r: 6, col: "#00f0ff" },
        { pt: rHip, r: 6, col: "#00f0ff" },
        { pt: lKnee, r: 7, col: legColor },
        { pt: rKnee, r: 7, col: legColor },
        { pt: lAnk, r: 5, col: "#00f0ff" },
        { pt: rAnk, r: 5, col: "#00f0ff" },
      ];

      joints.forEach(({ pt, r, col }) => {
        if (!pt) return;
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

      // 4. Clinical Hold Verification Arc on Active Knee
      const activeKnee = lKnee || rKnee;
      if (activeKnee && holdProgressRef.current > 0) {
        const radius = 32;
        const progress = Math.min(1.0, holdProgressRef.current);
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + Math.PI * 2 * progress;

        ctx.save();
        // Background track circle
        ctx.beginPath();
        ctx.arc(activeKnee.x, activeKnee.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 4;
        ctx.stroke();

        // Glowing progress arc
        ctx.beginPath();
        ctx.arc(activeKnee.x, activeKnee.y, radius, startAngle, endAngle);
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 5;
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 14;
        ctx.stroke();

        // Numeric angle readout next to knee
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(kneeAngleRef.current)}°`, activeKnee.x, activeKnee.y - radius - 8);
        ctx.restore();
      }
    }

    // 5. Particles Update & Render Pass
    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
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

    // 6. Floating Damage Texts Pass
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
      ctx.font = `black ${t.fontSize}px 'Courier New', monospace`;
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = t.opacity;
      ctx.textAlign = "center";
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Continuous MediaPipe Pose & WebSocket Loop
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!scriptReady || typeof window === "undefined" || !window.Pose) return;

    let isRunning = true;

    // 1. Initialize MediaPipe Pose instance
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

    poseInstance.current = pose;

    // Handle pose output frames
    pose.onResults((results: any) => {
      if (!isRunning) return;
      if (results.poseLandmarks) {
        landmarksRef.current = results.poseLandmarks;

        // Dispatch landmarks payload to WebSocket Bio-Engine
        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          const lms = results.poseLandmarks;
          const payload = {
            exercise: "squat",
            difficulty: "standard",
            left: {
              shoulder: [lms[11]?.x, lms[11]?.y, lms[11]?.z, lms[11]?.visibility],
              elbow: [lms[13]?.x, lms[13]?.y, lms[13]?.z, lms[13]?.visibility],
              wrist: [lms[15]?.x, lms[15]?.y, lms[15]?.z, lms[15]?.visibility],
              hip: [lms[23]?.x, lms[23]?.y, lms[23]?.z, lms[23]?.visibility],
              knee: [lms[25]?.x, lms[25]?.y, lms[25]?.z, lms[25]?.visibility],
              ankle: [lms[27]?.x, lms[27]?.y, lms[27]?.z, lms[27]?.visibility],
            },
            right: {
              shoulder: [lms[12]?.x, lms[12]?.y, lms[12]?.z, lms[12]?.visibility],
              elbow: [lms[14]?.x, lms[14]?.y, lms[14]?.z, lms[14]?.visibility],
              wrist: [lms[16]?.x, lms[16]?.y, lms[16]?.z, lms[16]?.visibility],
              hip: [lms[24]?.x, lms[24]?.y, lms[24]?.z, lms[24]?.visibility],
              knee: [lms[26]?.x, lms[26]?.y, lms[26]?.z, lms[26]?.visibility],
              ankle: [lms[28]?.x, lms[28]?.y, lms[28]?.z, lms[28]?.visibility],
            },
          };
          socket.send(JSON.stringify(payload));
        }
      }
    });

    // 2. Establish WebSocket Bio-Engine Connection
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/pose";
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
      setCombatCallout("READY • SQUAT DOWN");
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

        // Update kinematic readouts
        if (data.knee_angle !== undefined) {
          setKneeAngle(Math.round(data.knee_angle));
          kneeAngleRef.current = data.knee_angle;
        }

        if (data.purity !== undefined) {
          setFormPurity(Math.round(data.purity));
        }

        // Handle Hold Progress and Audio Ticks
        if (data.hold_progress !== undefined) {
          setHoldProgress(data.hold_progress);
          holdProgressRef.current = data.hold_progress;

          if (data.hold_progress > 0 && Date.now() - lastHoldAudioTickRef.current >= 280) {
            soundEngine.playHoldTick(data.hold_progress);
            lastHoldAudioTickRef.current = Date.now();
          }
        }

        // Handle Combat Banner Callout
        if (data.phase === "STUNNED" || data.status === "penalty") {
          setIsStunned(true);
          isStunnedRef.current = true;
          setCombatCallout(data.warning || "EGO LIFT DETECTED! STUNNED");
        } else if (data.status === "hit" || data.event === "HOLD_HIT") {
          setIsStunned(false);
          isStunnedRef.current = false;
          setIsCritical(true);
          setCombatCallout("CRITICAL HIT! RETURN TO STANDING (+100 DMG)");
        } else if (data.phase === "HOLDING") {
          setIsStunned(false);
          isStunnedRef.current = false;
          setIsCritical(false);
          setCombatCallout(`HOLD SQUAT (${data.hold_time.toFixed(1)}s / 1.5s)`);
        } else if (data.valgus) {
          setCombatCallout("KNEES CAVING INWARD - DRIVE KNEES OUT");
        } else {
          setIsStunned(false);
          isStunnedRef.current = false;
          setIsCritical(false);
          setCombatCallout(data.message || "READY • SQUAT DOWN");
        }

        // Handle Biomechanical Faults
        if (data.fault_detected || data.valgus) {
          faultsCountRef.current++;
        }

        // Handle Ego Lift Penalty Stun
        if (data.damage_taken && data.damage_taken > 0) {
          soundEngine.playStun();
          screenShakeRef.current = 15;
          setPlayerHp((prev) => {
            const nextHp = Math.max(0, prev - data.damage_taken);
            playerHpRef.current = nextHp;
            if (nextHp <= 0) {
              triggerMatchEnd("DEFEAT");
            }
            return nextHp;
          });
          const canvas = canvasRef.current;
          if (canvas) {
            spawnFloatingText(`-${data.damage_taken} HP STUN`, canvas.width / 2, canvas.height / 2 + 50, "#ff0055", 30);
          }
        }

        // Handle Rep Completion & Boss Damage Dispatch
        if (data.event === "REP_COMPLETE" || (data.event === "HOLD_HIT" && data.damage > 0)) {
          if (data.damage > 0) {
            soundEngine.playHit();
            screenShakeRef.current = 18;

            // Deplete Boss HP
            setBossHp((prev) => {
              const nextHp = Math.max(0, prev - data.damage);
              bossHpRef.current = nextHp;
              if (nextHp <= 0) {
                triggerMatchEnd("VICTORY");
              }
              return nextHp;
            });

            const canvas = canvasRef.current;
            if (canvas) {
              spawnHitParticles(canvas.width / 2, canvas.height * 0.65, 25, "#fae100");
              spawnFloatingText(`-100 CRIT!`, canvas.width / 2, canvas.height * 0.4, "#fae100", 34);
            }
          }

          if (data.event === "REP_COMPLETE") {
            setRepCount(data.rep_count);
            repCountRef.current = data.rep_count;

            // Record to local telemetry
            telemetryHistoryRef.current.push({
              repNumber: data.rep_count,
              kneeAngle: data.knee_angle,
              hipAngle: data.hip_angle,
              holdTime: data.hold_time,
              purity: data.purity,
              fault: data.fault_name || (data.valgus ? "VALGUS" : "CLEAN"),
              timestamp: new Date().toLocaleTimeString(),
            });
          }
        }
      } catch (err) {
        console.error("Packet processing error:", err);
      }
    };

    // 3. Zero-Flicker Hardware Video Pipeline
    const startCamera = async () => {
      try {
        let stream = streamRef.current;
        if (!stream) {
          setCameraStatus("INITIALIZING");
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
        setCameraStatus("ACTIVE");

        // Decoupled continuous render & pose processing loop
        const loop = async () => {
          if (!isRunning) return;

          // Render canvas pass
          renderFrame();

          // Non-blocking pose submission
          if (
            videoRef.current &&
            videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            !isProcessingPose.current &&
            poseInstance.current
          ) {
            isProcessingPose.current = true;
            poseInstance.current
              .send({ image: videoRef.current })
              .catch(() => {})
              .finally(() => {
                isProcessingPose.current = false;
              });
          }

          if (isRunning) {
            animFrameId.current = requestAnimationFrame(loop);
          }
        };

        animFrameId.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error("Camera access failed:", err);
        setCameraStatus("ERROR");
      }
    };

    startCamera();

    return () => {
      isRunning = false;
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try {
        pose.close();
      } catch {
        // noop
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [scriptReady, renderFrame, spawnFloatingText, spawnHitParticles, triggerMatchEnd]);

  // Visual Form Purity Color helper
  const purityColor = formPurity >= 90 ? "text-emerald-400" : formPurity >= 70 ? "text-amber-400" : "text-rose-500";

  return (
    <div className="relative w-screen h-screen bg-[#050811] text-white flex flex-col font-mono select-none overflow-hidden">
      {/* MediaPipe Pose Script */}
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      {/* Hidden Zero-Flicker Hardware Video Feed */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* ------------------------------------------------------------------- */}
      {/* 1. TOP BAR: ARCADE HUD TELEMETRY                                   */}
      {/* ------------------------------------------------------------------- */}
      <header className="relative z-20 flex items-center justify-between px-6 py-3 bg-[#0a0f1d]/90 border-b border-cyan-500/20 backdrop-blur-md">
        {/* Left: Player HP ($100 Max) */}
        <div className="flex items-center gap-4 w-72">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-lg shadow-[0_0_12px_rgba(6,182,212,0.25)]">
            🛡️
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs font-bold tracking-wider text-cyan-300 mb-1">
              <span>PLAYER HEALTH</span>
              <span>{playerHp} / 100 HP</span>
            </div>
            <div className="h-3 w-full bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-cyan-500/30">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  playerHp > 40
                    ? "bg-gradient-to-r from-cyan-500 to-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                    : "bg-gradient-to-r from-rose-600 to-amber-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.7)]"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, playerHp))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Center: Live Rep Counter & Kinematic Telemetry */}
        <div className="flex items-center gap-8">
          {/* Rep Counter */}
          <div className="text-center px-5 py-1 rounded-xl bg-black/50 border border-cyan-500/30 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <div className="text-[10px] text-cyan-400 font-semibold tracking-widest uppercase">Repetitions</div>
            <div className="text-3xl font-black text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
              {repCount.toString().padStart(2, "0")}
            </div>
          </div>

          {/* Form Purity Indicator */}
          <div className="text-center px-5 py-1 rounded-xl bg-black/50 border border-cyan-500/30">
            <div className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Form Purity</div>
            <div className={`text-2xl font-black ${purityColor} tracking-tight drop-shadow`}>
              {formPurity}%
            </div>
          </div>

          {/* Knee Angle Live */}
          <div className="text-center px-4 py-1 rounded-xl bg-black/50 border border-slate-700/50">
            <div className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Knee Angle</div>
            <div className="text-xl font-bold text-slate-200 tracking-tight">
              {kneeAngle}°
            </div>
          </div>
        </div>

        {/* Right: Boss HP ($500 Max) */}
        <div className="flex items-center gap-4 w-80 justify-end">
          <div className="flex-1 text-right">
            <div className="flex justify-between text-xs font-bold tracking-wider text-rose-400 mb-1">
              <span className="truncate">CYBER-COLOSSUS</span>
              <span>{bossHp} / 500 HP</span>
            </div>
            <div className="h-3 w-full bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-rose-500/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-rose-500 to-red-600 transition-all duration-300 shadow-[0_0_12px_rgba(244,63,94,0.6)]"
                style={{ width: `${Math.max(0, Math.min(100, (bossHp / 500) * 100))}%` }}
              />
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400 text-lg shadow-[0_0_12px_rgba(244,63,94,0.3)]">
            👾
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------- */}
      {/* 2. MAIN ARENA VIEWPORT (Single-Screen Experience)                  */}
      {/* ------------------------------------------------------------------- */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center p-4 bg-gradient-to-b from-[#050811] via-[#080d1a] to-[#04060d]">
        <div className="relative w-full max-w-5xl aspect-[4/3] max-h-[78vh] rounded-3xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_50px_rgba(0,240,255,0.12)] bg-black">
          {/* Hardware Render Canvas */}
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full h-full object-cover"
          />

          {/* Dynamic Center Combat Callout Banner */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
            <div
              className={`px-8 py-3 rounded-2xl border-2 backdrop-blur-md transition-all duration-200 uppercase font-black tracking-widest text-sm sm:text-base flex items-center gap-3 shadow-2xl ${
                isStunned
                  ? "bg-rose-950/90 border-rose-500 text-rose-300 shadow-[0_0_30px_rgba(244,63,94,0.6)] animate-bounce"
                  : isCritical
                  ? "bg-amber-950/90 border-amber-400 text-amber-200 shadow-[0_0_30px_rgba(251,191,36,0.6)]"
                  : holdProgress > 0
                  ? "bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_25px_rgba(6,182,212,0.5)]"
                  : "bg-slate-900/80 border-slate-700 text-slate-300 shadow-lg"
              }`}
            >
              {isStunned ? "⚠️" : isCritical ? "⚡" : holdProgress > 0 ? "⏱️" : "🎯"}
              <span>{combatCallout}</span>
            </div>

            {/* Hold progress bar under banner */}
            {holdProgress > 0 && (
              <div className="w-64 mx-auto mt-2 h-2 bg-slate-900/90 rounded-full overflow-hidden border border-cyan-400/40 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-300 transition-all duration-75 shadow-[0_0_10px_rgba(251,191,36,0.8)]"
                  style={{ width: `${Math.min(100, holdProgress * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Viewport Floating Status Overlays */}
          <div className="absolute bottom-4 left-6 z-20 flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 border border-slate-700">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
              <span>{wsConnected ? "BIO-ENGINE ONLINE" : "CONNECTING..."}</span>
            </div>
            <div className="px-3 py-1 rounded-full bg-black/60 border border-slate-700 text-cyan-300">
              CLINICAL SQUAT LOCKOUT (1.5s)
            </div>
          </div>

          {/* Quick HUD Action Buttons */}
          <div className="absolute bottom-4 right-6 z-20 flex items-center gap-3">
            <button
              onClick={handleToggleMute}
              className="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/90 border border-slate-700 hover:border-cyan-400 text-xs text-slate-300 transition-all cursor-pointer flex items-center gap-2"
              title="Toggle Audio"
            >
              <span>{isMuted ? "🔇 MUTED" : "🔊 AUDIO ON"}</span>
            </button>
            <button
              onClick={handleFightAgain}
              className="px-3 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 hover:border-cyan-400 text-xs text-cyan-300 font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>🔄 RESTART</span>
            </button>
          </div>
        </div>
      </main>

      {/* ------------------------------------------------------------------- */}
      {/* 3. POST-MATCH TELEMETRY MODAL                                       */}
      {/* ------------------------------------------------------------------- */}
      {matchOver && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-[#0a0f1e] border-2 border-cyan-500/40 rounded-3xl p-8 shadow-[0_0_60px_rgba(0,240,255,0.25)] flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            {/* Victory / Defeat Header */}
            <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center text-3xl shadow-xl bg-black/60 border border-slate-700">
              {matchResult === "VICTORY" ? "🏆" : "💀"}
            </div>

            <h2
              className={`text-2xl sm:text-3xl font-black uppercase tracking-wider mb-1 ${
                matchResult === "VICTORY" ? "text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]" : "text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.6)]"
              }`}
            >
              {matchResult === "VICTORY" ? "CYBER-COLOSSUS DESTROYED" : "SYSTEM OVERLOAD - DEFEATED"}
            </h2>
            <p className="text-xs text-slate-400 tracking-wide uppercase mb-6">
              Combat telemetry verified by 3D Biomechanical Engine
            </p>

            {/* 4-Stat Telemetry Matrix */}
            <div className="grid grid-cols-2 gap-3 w-full mb-6">
              <div className="p-4 rounded-2xl bg-black/40 border border-slate-800 flex flex-col items-center">
                <span className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Total Reps</span>
                <span className="text-3xl font-black text-cyan-300 font-mono">{matchStats.totalReps}</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-slate-800 flex flex-col items-center">
                <span className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Form Purity</span>
                <span className={`text-3xl font-black font-mono ${matchStats.avgPurity >= 85 ? "text-emerald-400" : "text-amber-400"}`}>
                  {matchStats.avgPurity}%
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-slate-800 flex flex-col items-center">
                <span className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Avg Hold Time</span>
                <span className="text-3xl font-black text-amber-300 font-mono">{matchStats.avgHoldTime}s</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/40 border border-slate-800 flex flex-col items-center">
                <span className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Bio Faults</span>
                <span className={`text-3xl font-black font-mono ${matchStats.totalFaults === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {matchStats.totalFaults}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={handleDownloadCsv}
                className="flex-1 py-3 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-400 text-slate-200 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>📥 DOWNLOAD TELEMETRY (.CSV)</span>
              </button>
              <button
                onClick={handleFightAgain}
                className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2"
              >
                <span>⚔️ FIGHT AGAIN</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
