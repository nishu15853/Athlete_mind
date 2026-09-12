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
      const baseFreq = 300 + Math.min(1.0, progress) * 450;
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

      // Heavy sub-bass impact
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);

      // Cyber laser chime
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
      osc.frequency.setValueAtTime(80, now + 0.15);

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
}

const synth = new AudioSynth();

// ---------------------------------------------------------------------------
// Phase 2: "AI Must Matter" Main Component
// ---------------------------------------------------------------------------

export default function Phase2BioBountyPage() {
  const [scriptReady, setScriptReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Phase 2 Dynamic Game State
  const [repCount, setRepCount] = useState(0);
  const [formPurity, setFormPurity] = useState(100);
  const [kneeAngle, setKneeAngle] = useState(180);
  const [hipAngle, setHipAngle] = useState(180);
  const [holdProgress, setHoldProgress] = useState(0);

  // Combat Health & Banner State
  const [playerHp, setPlayerHp] = useState(100);
  const [bossHp, setBossHp] = useState(500);
  const [combatBanner, setCombatBanner] = useState("WAITING");
  const [combatBannerType, setCombatBannerType] = useState<"WAITING" | "HOLD" | "CRIT" | "EGO_LIFT" | "VALGUS">("WAITING");
  const [isStunned, setIsStunned] = useState(false);

  // DOM References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // High-Frequency State in Refs (preventing React re-render thrashing)
  const landmarksRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const poseInstanceRef = useRef<any>(null);
  const isProcessingPoseRef = useRef(false);
  const animFrameIdRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const screenShakeRef = useRef(0);
  const lastHoldTickTimeRef = useRef(0);

  // Mirrored Refs for 60fps canvas pass
  const kneeAngleRef = useRef(180);
  const holdProgressRef = useRef(0);
  const isStunnedRef = useRef(false);
  const isCriticalRef = useRef(false);

  // Spawn visual neon particles on critical hit
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
        maxLife: 28 + Math.random() * 15,
      });
    }
  }, []);

  // Spawn floating combat damage numbers
  const spawnFloatingText = useCallback((text: string, x: number, y: number, color = "#ffd700", fontSize = 28) => {
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
  const handleResetSession = useCallback(() => {
    setRepCount(0);
    setFormPurity(100);
    setKneeAngle(180);
    setHipAngle(180);
    setHoldProgress(0);
    setPlayerHp(100);
    setBossHp(500);
    setCombatBanner("READY • SQUAT DOWN");
    setCombatBannerType("WAITING");
    setIsStunned(false);

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

    // 1. Draw Mirrored Webcam Video with Screen Shake on Hit/Stun
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

      // Cyberpunk subtle vignette
      const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width * 0.7);
      grad.addColorStop(0, "rgba(5, 10, 20, 0.05)");
      grad.addColorStop(1, "rgba(5, 10, 20, 0.75)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = "#0a0e1a";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#00f0ff";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("OPTICAL SENSOR ACQUIRING TARGET...", width / 2, height / 2);
    }

    // 2. Corner Sci-Fi Tech Brackets
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 2;
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

    // 3. Draw Kinetic Laser Skeleton
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

      const baseSkeletonColor = isStunnedRef.current ? "#ff0055" : "#00f0ff";
      const legColor = isStunnedRef.current
        ? "#ff0055"
        : holdProgressRef.current > 0
        ? "#ffd700"
        : "#00f0ff";

      // Upper Body
      drawBone(lSh, rSh, baseSkeletonColor, 3.5);
      drawBone(lSh, lEl, baseSkeletonColor, 2.5);
      drawBone(lEl, lWr, baseSkeletonColor, 2.5);
      drawBone(rSh, rEl, baseSkeletonColor, 2.5);
      drawBone(rEl, rWr, baseSkeletonColor, 2.5);

      // Spine & Pelvis
      if (lSh && rSh && lHip && rHip) {
        const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
        const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
        drawBone(midSh, midHip, baseSkeletonColor, 4.0);
        drawBone(lHip, rHip, baseSkeletonColor, 4.0);
      }

      // Lower Kinetic Chain (Hips -> Knees -> Ankles)
      drawBone(lHip, lKnee, legColor, 4.5);
      drawBone(lKnee, lAnk, legColor, 4.5);
      drawBone(rHip, rKnee, legColor, 4.5);
      drawBone(rKnee, rAnk, legColor, 4.5);

      // Joint Halos
      const joints = [
        { pt: lSh, r: 5, col: baseSkeletonColor },
        { pt: rSh, r: 5, col: baseSkeletonColor },
        { pt: lHip, r: 6, col: baseSkeletonColor },
        { pt: rHip, r: 6, col: baseSkeletonColor },
        { pt: lKnee, r: 7, col: legColor },
        { pt: rKnee, r: 7, col: legColor },
        { pt: lAnk, r: 5, col: baseSkeletonColor },
        { pt: rAnk, r: 5, col: baseSkeletonColor },
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

      // Clinical Hold Arc around active knee
      const activeKnee = lKnee || rKnee;
      if (activeKnee && holdProgressRef.current > 0) {
        const radius = 30;
        const progress = Math.min(1.0, holdProgressRef.current);
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + Math.PI * 2 * progress;

        ctx.save();
        // Track background
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

        // Numeric degree readout
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
      p.vy += 0.1; // gravity
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

    // 5. Update & Render Floating Combat Numbers
    const texts = floatingTextsRef.current;
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.y -= 1.5;
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
      ctx.shadowBlur = 12;
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

          if (data.hold_progress > 0 && Date.now() - lastHoldTickTimeRef.current >= 280) {
            synth.playHoldTick(data.hold_progress);
            lastHoldTickTimeRef.current = Date.now();
          }
        }

        // Handle Ego Lift Stun Penalty (-25 HP)
        if (data.status === "penalty" || data.phase === "STUNNED" || (data.damage_taken && data.damage_taken > 0)) {
          setIsStunned(true);
          isStunnedRef.current = true;
          isCriticalRef.current = false;
          setCombatBanner("EGO LIFT DETECTED - STUNNED!");
          setCombatBannerType("EGO_LIFT");

          if (data.damage_taken && data.damage_taken > 0) {
            synth.playStun();
            screenShakeRef.current = 16;
            setPlayerHp((prev) => Math.max(0, prev - data.damage_taken!));
            const canvas = canvasRef.current;
            if (canvas) {
              spawnFloatingText(`-${data.damage_taken} HP STUN`, canvas.width / 2, canvas.height / 2 + 50, "#ff0055", 32);
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
            screenShakeRef.current = 14;
            setBossHp((prev) => Math.max(0, prev - data.damage!));
            const canvas = canvasRef.current;
            if (canvas) {
              spawnParticles(canvas.width / 2, canvas.height * 0.6, 28, "#ffd700");
              spawnFloatingText(`-100 CRIT!`, canvas.width / 2, canvas.height * 0.4, "#ffd700", 34);
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

  // Visual Form Purity Color Helper
  const purityColor = formPurity >= 90 ? "text-emerald-400" : formPurity >= 70 ? "text-amber-400" : "text-rose-500";

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
      {/* 1. TOP BAR: COMBAT HUD TELEMETRY                                   */}
      {/* ------------------------------------------------------------------- */}
      <header className="relative z-20 flex items-center justify-between px-6 py-3 bg-[#0a0f1d]/90 border-b border-cyan-500/20 backdrop-blur-md">
        {/* Left: Player HP (100 Max) */}
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

        {/* Center: Live Rep Counter & Form Purity */}
        <div className="flex items-center gap-8">
          {/* Rep Counter */}
          <div className="text-center px-5 py-1 rounded-xl bg-black/50 border border-cyan-500/30 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <div className="text-[10px] text-cyan-400 font-semibold tracking-widest uppercase">Repetitions</div>
            <div className="text-3xl font-black text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
              {repCount.toString().padStart(2, "0")}
            </div>
          </div>

          {/* Form Purity Metric */}
          <div className="text-center px-5 py-1 rounded-xl bg-black/50 border border-cyan-500/30">
            <div className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Form Purity</div>
            <div className={`text-2xl font-black ${purityColor} tracking-tight drop-shadow`}>
              {formPurity}%
            </div>
          </div>

          {/* Knee & Hip Angle Live */}
          <div className="text-center px-4 py-1 rounded-xl bg-black/50 border border-slate-700/50">
            <div className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Angles (Knee / Hip)</div>
            <div className="text-lg font-bold text-slate-200 tracking-tight font-mono">
              {kneeAngle}° / {hipAngle}°
            </div>
          </div>
        </div>

        {/* Right: Boss HP (500 Max) */}
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
              CLINICAL HOLD: 1.5s - 2.0s
            </div>
          </div>

          {/* Controls */}
          <div className="absolute bottom-4 right-6 z-20 flex items-center gap-3">
            <button
              onClick={handleToggleMute}
              className="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/90 border border-slate-700 hover:border-cyan-400 text-xs text-slate-300 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>{isMuted ? "🔇 MUTED" : "🔊 AUDIO"}</span>
            </button>
            <button
              onClick={handleResetSession}
              className="px-3 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 hover:border-cyan-400 text-xs text-cyan-300 font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>🔄 RESET</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
