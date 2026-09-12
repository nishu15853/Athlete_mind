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
  hip_angle?: number;
  rep_count: number;
  message: string;
  damage?: number;
  hold_progress?: number;
  purity?: number;
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

  playCritHit() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Punchy sub-bass sweep
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.25);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);

      // Sci-fi high ping
      const ping = this.ctx.createOscillator();
      const pingGain = this.ctx.createGain();
      ping.type = "sine";
      ping.frequency.setValueAtTime(880, now);
      ping.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

      pingGain.gain.setValueAtTime(0.15, now);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      ping.connect(pingGain);
      pingGain.connect(this.ctx.destination);
      ping.start(now);
      ping.stop(now + 0.15);
    } catch {
      // Audio policy safe
    }
  }
}

const synth = new AudioSynth();

// ---------------------------------------------------------------------------
// Phase 1: The Bio-Engine Main Component
// ---------------------------------------------------------------------------

export default function Phase1BioEnginePage() {
  const [scriptReady, setScriptReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Live Kinematic Telemetry
  const [kneeAngle, setKneeAngle] = useState(180);
  const [repCount, setRepCount] = useState(0);
  const [status, setStatus] = useState<string>("TRACKING");
  const [message, setMessage] = useState<string>("INITIALIZING CAMERA FEED...");
  const [isCritical, setIsCritical] = useState<boolean>(false);

  // DOM References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Engine Refs (preventing React re-render bottlenecks)
  const landmarksRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const poseInstanceRef = useRef<any>(null);
  const isProcessingPoseRef = useRef(false);
  const animFrameIdRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const kneeAngleRef = useRef(180);
  const isCriticalRef = useRef(false);

  // Spawn visual neon particles on critical hit
  const spawnParticles = useCallback((cx: number, cy: number, count = 25, color = "#00f0ff") => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2.0 + Math.random() * 4.5;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: 2.5 + Math.random() * 2.5,
        alpha: 1.0,
        life: 0,
        maxLife: 25 + Math.random() * 15,
      });
    }
  }, []);

  // Reset Session Reps
  const handleResetSession = useCallback(() => {
    setRepCount(0);
    setKneeAngle(180);
    setStatus("TRACKING");
    setMessage("READY • SQUAT DOWN");
    setIsCritical(false);
    kneeAngleRef.current = 180;
    isCriticalRef.current = false;
    particlesRef.current = [];

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: "reset" }));
    }
  }, []);

  const handleToggleMute = () => {
    synth.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // ---------------------------------------------------------------------------
  // Canvas Render Loop (Decoupled, Zero-Flicker)
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

    // 1. Draw Mirrored Webcam Video
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      ctx.save();
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
    const bSize = 20;
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

    // 3. Draw Kinetic Skeleton (Left Hip, Knee, Ankle + Upper Body)
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

      const lHip = getPt(23);
      const rHip = getPt(24);
      const lKnee = getPt(25);
      const rKnee = getPt(26);
      const lAnk = getPt(27);
      const rAnk = getPt(28);
      const lSh = getPt(11);
      const rSh = getPt(12);

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

      const boneColor = isCriticalRef.current ? "#ffd700" : "#00f0ff";

      // Draw Spine & Torso
      if (lSh && rSh && lHip && rHip) {
        drawBone(lSh, rSh, "#00f0ff", 3);
        const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
        const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
        drawBone(midSh, midHip, "#00f0ff", 3.5);
        drawBone(lHip, rHip, "#00f0ff", 3.5);
      }

      // Draw Lower Kinetic Chain (Hip -> Knee -> Ankle)
      drawBone(lHip, lKnee, boneColor, 4.5);
      drawBone(lKnee, lAnk, boneColor, 4.5);
      drawBone(rHip, rKnee, boneColor, 4.5);
      drawBone(rKnee, rAnk, boneColor, 4.5);

      // Draw Joint Halos
      const joints = [
        { pt: lSh, r: 5, col: "#00f0ff" },
        { pt: rSh, r: 5, col: "#00f0ff" },
        { pt: lHip, r: 6, col: "#00f0ff" },
        { pt: rHip, r: 6, col: "#00f0ff" },
        { pt: lKnee, r: 7, col: boneColor },
        { pt: rKnee, r: 7, col: boneColor },
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

      // Joint Angle Readout on Active Knee
      const activeKnee = lKnee || rKnee;
      if (activeKnee) {
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.shadowColor = boneColor;
        ctx.shadowBlur = 8;
        ctx.fillText(`${Math.round(kneeAngleRef.current)}°`, activeKnee.x, activeKnee.y - 18);
        ctx.restore();
      }
    }

    // 4. Update & Render Particles
    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
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

        // Stream Left Hip (23), Knee (25), Ankle (27) to backend WebSocket
        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          const lms = results.poseLandmarks;
          const payload = {
            left: {
              hip: [lms[23]?.x, lms[23]?.y, lms[23]?.z],
              knee: [lms[25]?.x, lms[25]?.y, lms[25]?.z],
              ankle: [lms[27]?.x, lms[27]?.y, lms[27]?.z],
            },
            right: {
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
      setMessage("READY • SQUAT DOWN");
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

        // Update Knee Angle
        if (data.knee_angle !== undefined) {
          setKneeAngle(Math.round(data.knee_angle));
          kneeAngleRef.current = data.knee_angle;
        }

        // Update Rep Count
        if (data.rep_count !== undefined) {
          setRepCount(data.rep_count);
        }

        // Update Form Status & Banner
        if (data.status) {
          setStatus(data.status);
          const crit = data.status === "CRITICAL HIT!";
          setIsCritical(crit);
          isCriticalRef.current = crit;

          if (crit && data.event === "HOLD_HIT") {
            synth.playCritHit();
            const canvas = canvasRef.current;
            if (canvas) {
              spawnParticles(canvas.width / 2, canvas.height * 0.6, 30, "#ffd700");
            }
          }
        }

        if (data.message) {
          setMessage(data.message);
        }
      } catch (err) {
        console.error("Packet parse error:", err);
      }
    };

    // 3. Initialize Webcam Stream & Non-blocking Render Loop
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

          // Render canvas pass
          renderCanvasPass();

          // Non-blocking pose submission
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
  }, [scriptReady, renderCanvasPass, spawnParticles]);

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
      {/* 1. TOP BAR: BIO-ENGINE TELEMETRY HEADER                            */}
      {/* ------------------------------------------------------------------- */}
      <header className="relative z-20 flex items-center justify-between px-6 py-3 bg-[#0a0f1d]/90 border-b border-cyan-500/20 backdrop-blur-md">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-lg shadow-[0_0_12px_rgba(6,182,212,0.25)]">
            ⚡
          </div>
          <div>
            <div className="text-sm font-black tracking-widest text-cyan-300">ATHLETEMIND</div>
            <div className="text-[10px] text-slate-400 font-semibold tracking-wider">PHASE 1 • THE BIO-ENGINE</div>
          </div>
        </div>

        {/* Center: Live Kinetic Readouts */}
        <div className="flex items-center gap-6">
          {/* Rep Counter */}
          <div className="text-center px-5 py-1 rounded-xl bg-black/50 border border-cyan-500/30 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <div className="text-[10px] text-cyan-400 font-semibold tracking-widest uppercase">Repetitions</div>
            <div className="text-3xl font-black text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
              {repCount.toString().padStart(2, "0")}
            </div>
          </div>

          {/* Knee Angle Live */}
          <div className="text-center px-4 py-1 rounded-xl bg-black/50 border border-slate-700/50">
            <div className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Knee Angle</div>
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {kneeAngle}°
            </div>
          </div>

          {/* Form Status Badge */}
          <div className="text-center px-4 py-1 rounded-xl bg-black/50 border border-slate-700/50">
            <div className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">Engine Status</div>
            <div className={`text-base font-black tracking-wide ${isCritical ? "text-amber-300 animate-pulse" : "text-cyan-400"}`}>
              {status}
            </div>
          </div>
        </div>

        {/* Right: Controls & Network Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 border border-slate-700 text-xs">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
            <span className="text-slate-300 font-bold">{wsConnected ? "ENGINE ONLINE" : "OFFLINE"}</span>
          </div>

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
      </header>

      {/* ------------------------------------------------------------------- */}
      {/* 2. MAIN ARENA VIEWPORT (Single-Canvas Pipeline)                     */}
      {/* ------------------------------------------------------------------- */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center p-4 bg-gradient-to-b from-[#050811] via-[#080d1a] to-[#04060d]">
        <div className="relative w-full max-w-5xl aspect-[4/3] max-h-[80vh] rounded-3xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_50px_rgba(0,240,255,0.12)] bg-black">
          {/* Decoupled Canvas Video & Skeleton Render Surface */}
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full h-full object-cover"
          />

          {/* Dynamic Floating Combat Callout Banner */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
            <div
              className={`px-8 py-3 rounded-2xl border-2 backdrop-blur-md transition-all duration-200 uppercase font-black tracking-widest text-sm sm:text-base flex items-center gap-3 shadow-2xl ${
                isCritical
                  ? "bg-amber-950/90 border-amber-400 text-amber-200 shadow-[0_0_35px_rgba(251,191,36,0.7)] scale-105"
                  : "bg-slate-900/80 border-cyan-500/40 text-cyan-300 shadow-lg"
              }`}
            >
              <span>{isCritical ? "💥" : "🎯"}</span>
              <span>{message}</span>
            </div>
          </div>

          {/* Viewport Corner Status Footer */}
          <div className="absolute bottom-4 left-6 z-20 flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 border border-slate-700">
              <span className={`w-2 h-2 rounded-full ${cameraActive ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span>{cameraActive ? "CAMERA ACTIVE (640x480)" : "WAITING FOR CAMERA..."}</span>
            </div>
            <div className="px-3 py-1 rounded-full bg-black/60 border border-slate-700 text-cyan-300">
              ARCTAN2 BIO-KINEMATICS
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
