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
  knee_angle: number;
  hip_angle: number;
  rep_count: number;
  hold_time?: number;
  hold_progress?: number;
  damage?: number;
  damage_taken?: number;
  purity?: number;
  knee_caved_in?: boolean;
  valgus?: boolean;
  weapon_overheated?: boolean;
  error?: string;
  message: string;
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

// ---------------------------------------------------------------------------
// Browser Audio Synthesizer (Zero External Dependencies)
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
      const baseFreq = 300 + Math.min(1.0, progress) * 480;
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio policy safe
    }
  }

  playCritHit() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Heavy sub-bass punch
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

      // Cyber laser ping
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
      osc.frequency.setValueAtTime(75, now + 0.18);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // noop
    }
  }

  playBossAttack() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Heavy mechanized blast
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
        gain.gain.setValueAtTime(0.2, start);
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

const synth = new AudioSynth();

// ---------------------------------------------------------------------------
// Phase 3: Cyberpunk Boss Battle Loop Main Component
// ---------------------------------------------------------------------------

export default function CyberpunkBossBattlePage() {
  const [scriptReady, setScriptReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // 1. Player State
  const [playerHp, setPlayerHp] = useState(100);
  const [overheatMeter, setOverheatMeter] = useState(0); // 0 to 100%
  const [stunTimer, setStunTimer] = useState(0); // seconds remaining
  const [isStunned, setIsStunned] = useState(false);

  // 2. Boss State ("Cyber-Colossus")
  const [bossHp, setBossHp] = useState(500);
  const [bossAttackTimer, setBossAttackTimer] = useState(10.0); // 10s idle countdown
  const isEnraged = bossHp > 0 && bossHp <= 250;
  const isBossDefeated = bossHp <= 0;
  const isPlayerDefeated = playerHp <= 0;

  // Kinematic Readouts
  const [repCount, setRepCount] = useState(0);
  const [formPurity, setFormPurity] = useState(100);
  const [kneeAngle, setKneeAngle] = useState(180);
  const [hipAngle, setHipAngle] = useState(180);
  const [holdProgress, setHoldProgress] = useState(0);

  // Combat Banner Callout
  const [combatBanner, setCombatBanner] = useState("WAITING");
  const [combatBannerType, setCombatBannerType] = useState<"WAITING" | "HOLD" | "CRIT" | "EGO_LIFT" | "VALGUS">("WAITING");

  // Game Flow Modals
  const [matchStatus, setMatchStatus] = useState<"ACTIVE" | "VICTORY" | "DEFEAT">("ACTIVE");
  const [battleStartTime, setBattleStartTime] = useState<number>(Date.now());
  const [egoLiftsCount, setEgoLiftsCount] = useState(0);

  // DOM References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Engine Refs (preventing React 60fps render-thrashing)
  const landmarksRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const poseInstanceRef = useRef<any>(null);
  const isProcessingPoseRef = useRef(false);
  const animFrameIdRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const screenShakeRef = useRef(0);
  const lastHoldTickTimeRef = useRef(0);

  // Fast access state mirrors for canvas render loop
  const kneeAngleRef = useRef(180);
  const holdProgressRef = useRef(0);
  const isStunnedRef = useRef(false);
  const isCriticalRef = useRef(false);
  const isEnragedRef = useRef(false);

  useEffect(() => {
    isEnragedRef.current = isEnraged;
  }, [isEnraged]);

  // Spawn visual neon particles
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

  // Spawn floating combat damage numbers
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

  // Reset Fight Session
  const handleResetCombat = useCallback(() => {
    setPlayerHp(100);
    setBossHp(500);
    setOverheatMeter(0);
    setStunTimer(0);
    setIsStunned(false);
    setRepCount(0);
    setFormPurity(100);
    setKneeAngle(180);
    setHipAngle(180);
    setHoldProgress(0);
    setBossAttackTimer(10.0);
    setCombatBanner("READY • SQUAT DOWN");
    setCombatBannerType("WAITING");
    setMatchStatus("ACTIVE");
    setBattleStartTime(Date.now());
    setEgoLiftsCount(0);

    kneeAngleRef.current = 180;
    holdProgressRef.current = 0;
    isStunnedRef.current = false;
    isCriticalRef.current = false;
    particlesRef.current = [];
    floatingTextsRef.current = [];

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: "reset" }));
    }
  }, []);

  const handleToggleMute = () => {
    synth.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // ---------------------------------------------------------------------------
  // Boss Attack & Overheat Cool-down Timer Loop
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (matchStatus !== "ACTIVE") return;

    const interval = setInterval(() => {
      // 1. Cool down overheat meter & stun timer if active
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

      // 2. Boss Attack Timer: counts down every 100ms if player is not holding squat
      if (holdProgressRef.current === 0) {
        setBossAttackTimer((prevTimer) => {
          if (prevTimer <= 0.1) {
            // Boss attacks! Deals 20 damage
            synth.playBossAttack();
            screenShakeRef.current = 22;

            setPlayerHp((hp) => {
              const nextHp = Math.max(0, hp - 20);
              if (nextHp <= 0) {
                setMatchStatus("DEFEAT");
                synth.playDefeat();
              }
              return nextHp;
            });

            const canvas = canvasRef.current;
            if (canvas) {
              spawnParticles(canvas.width / 2, canvas.height * 0.4, 35, "#ff0055");
              spawnFloatingText("-20 BOSS STRIKE!", canvas.width / 2, canvas.height / 2, "#ff0055", 34);
            }

            return 10.0; // Reset boss timer
          }
          return Math.max(0, Number((prevTimer - 0.1).toFixed(1)));
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [matchStatus, spawnParticles, spawnFloatingText]);

  // Check victory / defeat trigger
  useEffect(() => {
    if (bossHp <= 0 && matchStatus === "ACTIVE") {
      setMatchStatus("VICTORY");
      synth.playVictory();
    } else if (playerHp <= 0 && matchStatus === "ACTIVE") {
      setMatchStatus("DEFEAT");
      synth.playDefeat();
    }
  }, [bossHp, playerHp, matchStatus]);

  // ---------------------------------------------------------------------------
  // Canvas Render Loop (Decoupled, Zero-Flicker Hardware Pipeline)
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

      // Cyberpunk Ambient Arena Vignette
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

    // 2. Corner Sci-Fi Tech Brackets
    ctx.strokeStyle = isEnragedRef.current ? "rgba(255, 0, 85, 0.6)" : "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 2.5;
    const bSize = 22;
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(14, 14 + bSize);
    ctx.lineTo(14, 14);
    ctx.lineTo(14 + bSize, 14);
    ctx.stroke();
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(width - 14 - bSize, 14);
    ctx.lineTo(width - 14, 14);
    ctx.lineTo(width - 14, 14 + bSize);
    ctx.stroke();
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(14, height - 14 - bSize);
    ctx.lineTo(14, height - 14);
    ctx.lineTo(14 + bSize, height - 14);
    ctx.stroke();
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(width - 14 - bSize, height - 14);
    ctx.lineTo(width - 14, height - 14);
    ctx.lineTo(width - 14, height - 14 - bSize);
    ctx.stroke();

    // 3. Draw Kinetic Cyberpunk Laser Skeleton
    const landmarks = landmarksRef.current;
    if (landmarks && Array.isArray(landmarks) && landmarks.length >= 29) {
      const getPt = (idx: number) => {
        const pt = landmarks[idx];
        if (!pt || pt.visibility < 0.4) return null;
        return {
          x: (1.0 - pt.x) * width,
          y: pt.y * height,
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

      const drawBone = (p1: any, p2: any, color = "#00f0ff", lineWidth = 3.5) => {
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

      const baseColor = isStunnedRef.current ? "#ff0055" : "#00f0ff";
      const legColor = isStunnedRef.current
        ? "#ff0055"
        : holdProgressRef.current > 0
        ? "#ffd700"
        : "#00f0ff";

      // Upper Body
      drawBone(lSh, rSh, baseColor, 3.5);
      drawBone(lSh, lEl, baseColor, 2.5);
      drawBone(lEl, lWr, baseColor, 2.5);
      drawBone(rSh, rEl, baseColor, 2.5);
      drawBone(rEl, rWr, baseColor, 2.5);

      // Spine & Pelvis
      if (lSh && rSh && lHip && rHip) {
        const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
        const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
        drawBone(midSh, midHip, baseColor, 4.0);
        drawBone(lHip, rHip, baseColor, 4.0);
      }

      // Lower Kinetic Chain (Squat Tracking)
      drawBone(lHip, lKnee, legColor, 4.5);
      drawBone(lKnee, lAnk, legColor, 4.5);
      drawBone(rHip, rKnee, legColor, 4.5);
      drawBone(rKnee, rAnk, legColor, 4.5);

      // Joint Halos
      const joints = [
        { pt: lSh, r: 5, col: baseColor },
        { pt: rSh, r: 5, col: baseColor },
        { pt: lHip, r: 6, col: baseColor },
        { pt: rHip, r: 6, col: baseColor },
        { pt: lKnee, r: 7, col: legColor },
        { pt: rKnee, r: 7, col: legColor },
        { pt: lAnk, r: 5, col: baseColor },
        { pt: rAnk, r: 5, col: baseColor },
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

      // Interactive Clinical Hold Circle on Active Knee
      const activeKnee = lKnee || rKnee;
      if (activeKnee && holdProgressRef.current > 0) {
        const radius = 32;
        const progress = Math.min(1.0, holdProgressRef.current);
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + Math.PI * 2 * progress;

        ctx.save();
        // Track background circle
        ctx.beginPath();
        ctx.arc(activeKnee.x, activeKnee.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 4.5;
        ctx.stroke();

        // Glowing progress arc
        ctx.beginPath();
        ctx.arc(activeKnee.x, activeKnee.y, radius, startAngle, endAngle);
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 5.5;
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 14;
        ctx.stroke();

        // Angle readout
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(kneeAngleRef.current)}°`, activeKnee.x, activeKnee.y - radius - 6);
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

    // 5. Update & Render Floating Damage Numbers
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
  // Continuous MediaPipe Pose Loop & WebSocket Connection
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

    poseInstanceRef.current = pose;

    pose.onResults((results: any) => {
      if (!isRunning) return;
      if (results.poseLandmarks) {
        landmarksRef.current = results.poseLandmarks;

        // Stream Left & Right Hip, Knee, Ankle coordinates to backend WebSocket
        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          const lms = results.poseLandmarks;
          const payload = {
            left: {
              shoulder: [lms[11]?.x, lms[11]?.y, lms[11]?.z],
              hip: [lms[23]?.x, lms[23]?.y, lms[23]?.z],
              knee: [lms[25]?.x, lms[25]?.y, lms[25]?.z],
              ankle: [lms[27]?.x, lms[27]?.y, lms[27]?.z],
            },
            right: {
              shoulder: [lms[12]?.x, lms[12]?.y, lms[12]?.z],
              hip: [lms[24]?.x, lms[24]?.y, lms[24]?.z],
              knee: [lms[26]?.x, lms[26]?.y, lms[26]?.z],
              ankle: [lms[28]?.x, lms[28]?.y, lms[28]?.z],
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
      setCombatBanner("READY • SQUAT DOWN");
      setCombatBannerType("WAITING");
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

        // Update Kinematics
        if (data.knee_angle !== undefined) {
          setKneeAngle(Math.round(data.knee_angle));
          kneeAngleRef.current = data.knee_angle;
        }

        if (data.hip_angle !== undefined) {
          setHipAngle(Math.round(data.hip_angle));
        }

        if (data.rep_count !== undefined) {
          setRepCount(data.rep_count);
        }

        if (data.purity !== undefined) {
          setFormPurity(Math.round(data.purity));
        }

        // Handle Hold Progress & Audio Tick
        if (data.hold_progress !== undefined) {
          setHoldProgress(data.hold_progress);
          holdProgressRef.current = data.hold_progress;

          if (data.hold_progress > 0) {
            // Reset boss attack timer while user is actively performing a hold
            setBossAttackTimer(10.0);

            if (Date.now() - lastHoldTickTimeRef.current >= 280) {
              synth.playHoldTick(data.hold_progress);
              lastHoldTickTimeRef.current = Date.now();
            }
          }
        }

        // Handle Ego Lift Stun Penalty (-25 HP & Overheat 100%)
        if (data.status === "penalty" || data.phase === "STUNNED" || (data.damage_taken && data.damage_taken > 0)) {
          setIsStunned(true);
          isStunnedRef.current = true;
          isCriticalRef.current = false;
          setOverheatMeter(100);
          setStunTimer(3.0);
          setCombatBanner("EGO LIFT DETECTED - STUNNED!");
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
          isCriticalRef.current = true;
          setCombatBanner("CRITICAL HIT!");
          setCombatBannerType("CRIT");

          if (data.damage && data.damage > 0) {
            synth.playCritHit();
            screenShakeRef.current = 16;
            setBossHp((prev) => Math.max(0, prev - data.damage!));
            setBossAttackTimer(10.0); // Reset boss attack timer on landing hit

            const canvas = canvasRef.current;
            if (canvas) {
              spawnParticles(canvas.width / 2, canvas.height * 0.6, 30, "#ffd700");
              spawnFloatingText(`-100 CRIT!`, canvas.width / 2, canvas.height * 0.4, "#ffd700", 36);
            }
          }
        } else if (data.phase === "HOLDING") {
          setIsStunned(false);
          isStunnedRef.current = false;
          isCriticalRef.current = false;
          setCombatBanner(`HOLD SQUAT... (${(data.hold_time || 0).toFixed(1)}s / 1.5s)`);
          setCombatBannerType("HOLD");
        } else if (data.knee_caved_in || data.valgus) {
          setIsStunned(false);
          isStunnedRef.current = false;
          setCombatBanner("KNEES CAVING INWARD - DRIVE KNEES OUT");
          setCombatBannerType("VALGUS");
        } else {
          setIsStunned(false);
          isStunnedRef.current = false;
          isCriticalRef.current = false;
          setCombatBanner(data.message || "READY • SQUAT DOWN");
          setCombatBannerType("WAITING");
        }
      } catch (err) {
        console.error("Packet parse error:", err);
      }
    };

    // 3. Initialize Webcam Stream & Render Loop
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
        // noop
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [scriptReady, renderCanvasPass, spawnParticles, spawnFloatingText]);

  const purityColor = formPurity >= 90 ? "text-emerald-400" : formPurity >= 70 ? "text-amber-400" : "text-rose-500";
  const durationSeconds = Math.round((Date.now() - battleStartTime) / 1000);

  return (
    <div className="relative w-screen h-screen bg-[#050811] text-white flex flex-col font-mono select-none overflow-hidden">
      {/* MediaPipe Pose Script */}
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      {/* Hidden Hardware Camera Stream */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* ------------------------------------------------------------------- */}
      {/* 1. TOP BAR: DUAL HEALTH BARS & BOSS BATTLE HUD                     */}
      {/* ------------------------------------------------------------------- */}
      <header className="relative z-20 flex items-center justify-between px-6 py-3 bg-[#0a0f1d]/95 border-b border-cyan-500/20 backdrop-blur-md">
        {/* Left: Player HP & Overheat Meter */}
        <div className="flex items-center gap-4 w-80">
          <div className="w-11 h-11 rounded-2xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-xl shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            🛡️
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs font-bold tracking-wider text-cyan-300 mb-1">
              <span>PLAYER HEALTH</span>
              <span>{playerHp} / 100 HP</span>
            </div>
            {/* Player HP Bar */}
            <div className="h-3.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-cyan-500/30 mb-1.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  playerHp > 40
                    ? "bg-gradient-to-r from-cyan-500 to-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                    : "bg-gradient-to-r from-rose-600 to-amber-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.7)]"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, playerHp))}%` }}
              />
            </div>
            {/* Overheat / Stun Gauge */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold mb-0.5">
              <span>OVERHEAT</span>
              <span>{stunTimer > 0 ? `STUNNED (${stunTimer.toFixed(1)}s)` : `${Math.round(overheatMeter)}%`}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-700">
              <div
                className={`h-full transition-all duration-200 ${
                  overheatMeter > 70 ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" : "bg-amber-400"
                }`}
                style={{ width: `${Math.min(100, overheatMeter)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Center: Live Reps, Purity, Angles, & Boss Attack Timer */}
        <div className="flex items-center gap-6">
          {/* Rep Counter */}
          <div className="text-center px-4 py-1.5 rounded-xl bg-black/60 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <div className="text-[10px] text-cyan-400 font-semibold tracking-widest uppercase">Repetitions</div>
            <div className="text-3xl font-black text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
              {repCount.toString().padStart(2, "0")}
            </div>
          </div>

          {/* Form Purity Metric */}
          <div className="text-center px-4 py-1.5 rounded-xl bg-black/60 border border-cyan-500/30">
            <div className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Form Purity</div>
            <div className={`text-2xl font-black ${purityColor} tracking-tight drop-shadow`}>
              {formPurity}%
            </div>
          </div>

          {/* Angles Live */}
          <div className="text-center px-3.5 py-1.5 rounded-xl bg-black/60 border border-slate-700/50">
            <div className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Knee / Hip</div>
            <div className="text-base font-bold text-slate-200 tracking-tight font-mono">
              {kneeAngle}° / {hipAngle}°
            </div>
          </div>

          {/* Boss Attack Countdown Timer */}
          <div className="text-center px-4 py-1.5 rounded-xl bg-black/60 border border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
            <div className="text-[10px] text-rose-400 font-semibold tracking-widest uppercase">Boss Attack</div>
            <div className={`text-xl font-black font-mono tracking-tight ${bossAttackTimer <= 3.0 ? "text-rose-400 animate-ping" : "text-amber-300"}`}>
              {bossAttackTimer.toFixed(1)}s
            </div>
          </div>
        </div>

        {/* Right: Boss HP & Active Status Badge */}
        <div className="flex items-center gap-4 w-88 justify-end">
          <div className="flex-1 text-right">
            <div className="flex justify-between text-xs font-bold tracking-wider mb-1">
              <span className={isEnraged ? "text-rose-500 animate-pulse font-black" : "text-violet-400"}>
                {isEnraged ? "🔥 CYBER-COLOSSUS [ENRAGED]" : "CYBER-COLOSSUS"}
              </span>
              <span className="text-rose-300">{bossHp} / 500 HP</span>
            </div>
            {/* Boss HP Bar */}
            <div className="h-3.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-rose-500/40 mb-1.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isEnraged
                    ? "bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.9)]"
                    : "bg-gradient-to-r from-violet-600 to-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, (bossHp / 500) * 100))}%` }}
              />
            </div>
            {/* Boss Status Badge */}
            <div className="flex items-center justify-end gap-2 text-[10px] font-bold">
              <span className="text-slate-400">STATUS:</span>
              <span className={`px-2 py-0.5 rounded-full ${isEnraged ? "bg-rose-950 text-rose-300 border border-rose-500" : "bg-violet-950 text-violet-300 border border-violet-500"}`}>
                {isEnraged ? "ENRAGED" : bossAttackTimer <= 3.0 ? "CHARGING ATTACK" : "IDLE"}
              </span>
            </div>
          </div>
          <div className={`w-11 h-11 rounded-2xl bg-rose-950/80 border flex items-center justify-center text-xl shadow-lg ${isEnraged ? "border-rose-400 text-rose-300 shadow-[0_0_18px_rgba(244,63,94,0.6)] animate-bounce" : "border-rose-500/40 text-rose-400"}`}>
            👾
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------- */}
      {/* 2. MAIN ARENA VIEWPORT (Single-Canvas Pipeline)                     */}
      {/* ------------------------------------------------------------------- */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center p-4 bg-gradient-to-b from-[#050811] via-[#080d1a] to-[#04060d]">
        <div className="relative w-full max-w-5xl aspect-[4/3] max-h-[80vh] rounded-3xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_50px_rgba(0,240,255,0.12)] bg-black">
          {/* Hardware Render Canvas */}
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full h-full object-cover"
          />

          {/* Dynamic Center Combat Feedback Banner */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
            <div
              className={`px-8 py-3 rounded-2xl border-2 backdrop-blur-md transition-all duration-200 uppercase font-black tracking-widest text-sm sm:text-base flex items-center gap-3 shadow-2xl ${
                combatBannerType === "EGO_LIFT"
                  ? "bg-rose-950/90 border-rose-500 text-rose-300 shadow-[0_0_35px_rgba(244,63,94,0.7)] animate-bounce"
                  : combatBannerType === "CRIT"
                  ? "bg-emerald-950/90 border-emerald-400 text-emerald-200 shadow-[0_0_35px_rgba(52,211,153,0.7)] scale-105"
                  : combatBannerType === "HOLD"
                  ? "bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-[0_0_25px_rgba(6,182,212,0.5)]"
                  : combatBannerType === "VALGUS"
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
                  : combatBannerType === "VALGUS"
                  ? "⚡"
                  : "🎯"}
              </span>
              <span>{combatBanner}</span>
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

          {/* Viewport Corner Status Footer */}
          <div className="absolute bottom-4 left-6 z-20 flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 border border-slate-700">
              <span className={`w-2 h-2 rounded-full ${cameraActive ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span>{cameraActive ? "CAMERA ONLINE (640x480)" : "INITIALIZING CAMERA..."}</span>
            </div>
            <div className="px-3 py-1 rounded-full bg-black/60 border border-slate-700 text-cyan-300">
              CLINICAL HOLD: 1.5s
            </div>
          </div>

          {/* Quick HUD Controls */}
          <div className="absolute bottom-4 right-6 z-20 flex items-center gap-3">
            <button
              onClick={handleToggleMute}
              className="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/90 border border-slate-700 hover:border-cyan-400 text-xs text-slate-300 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>{isMuted ? "🔇 MUTED" : "🔊 AUDIO"}</span>
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
      {/* 3. GAME FLOW MODALS (Victory Screen & Defeat Screen)                */}
      {/* ------------------------------------------------------------------- */}

      {/* Victory Screen */}
      {matchStatus === "VICTORY" && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-[#0a101f] border-2 border-amber-400/50 rounded-3xl p-8 shadow-[0_0_60px_rgba(251,191,36,0.3)] flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-2xl mb-4 bg-amber-950/80 border border-amber-400/60 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(251,191,36,0.4)]">
              🏆
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-amber-300 uppercase tracking-wider mb-1 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]">
              CYBER-COLOSSUS DESTROYED!
            </h2>
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-6">
              Mechanized Target Neutralized • Pure Kinematic Form Verified
            </p>

            <div className="grid grid-cols-3 gap-3 w-full mb-6">
              <div className="p-3.5 rounded-2xl bg-black/50 border border-slate-800 flex flex-col items-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Total Reps</span>
                <span className="text-2xl font-black text-cyan-300 font-mono">{repCount}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 border border-slate-800 flex flex-col items-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Form Purity</span>
                <span className={`text-2xl font-black font-mono ${purityColor}`}>{formPurity}%</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 border border-slate-800 flex flex-col items-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Battle Time</span>
                <span className="text-2xl font-black text-amber-300 font-mono">{durationSeconds}s</span>
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={handleResetCombat}
                className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-black font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_20px_rgba(251,191,36,0.4)]"
              >
                ⚔️ NEXT TARGET / RESTART
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Defeat Screen */}
      {matchStatus === "DEFEAT" && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-[#14080e] border-2 border-rose-500/50 rounded-3xl p-8 shadow-[0_0_60px_rgba(244,63,94,0.3)] flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-2xl mb-4 bg-rose-950/80 border border-rose-500/60 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(244,63,94,0.4)]">
              💀
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-rose-400 uppercase tracking-wider mb-1 drop-shadow-[0_0_12px_rgba(244,63,94,0.6)]">
              SYSTEM OVERLOAD - DEFEATED
            </h2>
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-6">
              Critical Pilot Failure • Kinematic Fault Analysis
            </p>

            <div className="w-full mb-6 p-4 rounded-2xl bg-black/60 border border-rose-900/60 text-left text-xs space-y-2">
              <div className="text-rose-300 font-bold uppercase tracking-wider mb-2">Diagnostic Feedback:</div>
              <div className="flex items-center gap-2 text-slate-300">
                <span>⚠️</span>
                <span>Ego-Lift Penalties: <strong>{egoLiftsCount}</strong> rapid bounces recorded (-25 HP each)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span>⏱️</span>
                <span>Boss Idle Attacks: Idle time allowed Cyber-Colossus to land 20 DMG strikes</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span>🎯</span>
                <span>Recommendation: Hold squats below 90° for full 1.5s to deal damage and reset boss attacks</span>
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={handleResetCombat}
                className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_20px_rgba(244,63,94,0.5)]"
              >
                🔄 RETRY MISSION
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
