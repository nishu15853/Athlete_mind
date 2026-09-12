"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface PoseResults {
  poseLandmarks?: Landmark[];
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

interface EnginePayload {
  event?: string;
  status: string;
  phase: string;
  knee_angle?: number;
  hip_angle?: number;
  primary_angle?: number;
  valgus?: boolean;
  warning?: string;
  message?: string;
  coach_feedback?: string;
  error?: string;
  hold_progress: number;
  hold_time: number;
  rep_count: number;
  purity: number;
  damage: number;
  damage_taken: number;
  weapon_overheated?: boolean;
}

type Stage = "IDLE" | "CALIBRATING" | "ACTIVE" | "COMPLETED";
type Outcome = "VICTORY" | "DEFEAT" | null;

interface MatchStats {
  totalReps: number;
  purityScores: number[];
  holdTimes: number[];
  valgusWarnings: number;
  egoPenalties: number;
}

interface GameSnapshot {
  stage: Stage;
  outcome: Outcome;
  playerHp: number;
  bossHp: number;
  reps: number;
  purity: number;
  callout: string;
  holdProgress: number;
  holdTime: number;
  kneeAngle: number;
  valgus: boolean;
  wsConnected: boolean;
  calibrationSeconds: number;
  stats: MatchStats;
}

const PLAYER_MAX_HP = 100;
const BOSS_MAX_HP = 500;
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/pose";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const INITIAL_STATS: MatchStats = {
  totalReps: 0,
  purityScores: [],
  holdTimes: [],
  valgusWarnings: 0,
  egoPenalties: 0,
};

const INITIAL_GAME: GameSnapshot = {
  stage: "IDLE",
  outcome: null,
  playerHp: PLAYER_MAX_HP,
  bossHp: BOSS_MAX_HP,
  reps: 0,
  purity: 100,
  callout: "STAND IN FRAME TO BEGIN",
  holdProgress: 0,
  holdTime: 0,
  kneeAngle: 180,
  valgus: false,
  wsConnected: false,
  calibrationSeconds: 3,
  stats: { ...INITIAL_STATS },
};

const SKELETON: [number, number][] = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

class SoundFX {
  private ctx: AudioContext | null = null;

  private audio(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx?.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  tone(freq: number, type: OscillatorType, duration: number, gainVal = 0.22, delay = 0) {
    const ctx = this.audio();
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

  hit() {
    this.tone(523.25, "triangle", 0.16, 0.28);
    this.tone(784, "sine", 0.12, 0.16, 0.04);
  }

  holdTick() {
    this.tone(660, "sine", 0.05, 0.08);
  }

  penalty() {
    this.tone(130.81, "sawtooth", 0.45, 0.32);
  }

  victory() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, "triangle", 0.35, 0.22, i * 0.09));
  }

  defeat() {
    [440, 349, 277, 196].forEach((f, i) => this.tone(f, "sawtooth", 0.4, 0.24, i * 0.14));
  }

  calibrate() {
    this.tone(440, "sine", 0.1, 0.16);
  }
}

const sfx = new SoundFX();

function pack(lm?: Landmark) {
  return lm ? [lm.x, lm.y, lm.z ?? 0, lm.visibility ?? 1] : null;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  landmarks: Landmark[] | null,
  valgus: boolean,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  if (!landmarks?.length) return;

  ctx.lineWidth = 4;
  ctx.strokeStyle = valgus ? "rgba(239,68,68,0.9)" : "rgba(34,211,238,0.9)";
  ctx.fillStyle = valgus ? "#f87171" : "#22d3ee";

  for (const [a, b] of SKELETON) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo((1 - pa.x) * w, pa.y * h);
    ctx.lineTo((1 - pb.x) * w, pb.y * h);
    ctx.stroke();
  }

  for (const idx of [11, 12, 23, 24, 25, 26, 27, 28]) {
    const p = landmarks[idx];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc((1 - p.x) * w, p.y * h, idx === 25 || idx === 26 ? 8 : 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function localCsv(stats: MatchStats, purity: number) {
  const rows = [
    ["metric", "value"],
    ["total_reps", String(stats.totalReps)],
    ["form_purity_pct", String(purity.toFixed(1))],
    ["average_hold_time_s", String(avg(stats.holdTimes).toFixed(2))],
    ["valgus_warnings", String(stats.valgusWarnings)],
    ["ego_penalties", String(stats.egoPenalties)],
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

export default function Home() {
  const [scriptReady, setScriptReady] = useState(false);
  const [hud, setHud] = useState<GameSnapshot>(INITIAL_GAME);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const gameRef = useRef<GameSnapshot>({ ...INITIAL_GAME, stats: { ...INITIAL_STATS } });
  const poseBusyRef = useRef(false);
  const lastRepRef = useRef(0);
  const lastPenaltyAtRef = useRef(0);
  const lastHoldTickRef = useRef(0);
  const lastValgusRef = useRef(false);
  const hitAwardedRef = useRef(false);
  const matchClosedRef = useRef(false);
  const autoStartedRef = useRef(false);

  const publishHud = useCallback(() => {
    setHud({ ...gameRef.current, stats: { ...gameRef.current.stats } });
  }, []);

  const finishMatch = useCallback((outcome: "VICTORY" | "DEFEAT") => {
    if (matchClosedRef.current) return;
    matchClosedRef.current = true;
    const g = gameRef.current;
    g.stage = "COMPLETED";
    g.outcome = outcome;
    g.callout = outcome === "VICTORY" ? "TARGET ELIMINATED" : "MISSION FAILED";
    if (outcome === "VICTORY") sfx.victory();
    else sfx.defeat();
    publishHud();
  }, [publishHud]);

  const resetFight = useCallback(() => {
    matchClosedRef.current = false;
    lastRepRef.current = 0;
    lastPenaltyAtRef.current = 0;
    lastValgusRef.current = false;
    hitAwardedRef.current = false;
    autoStartedRef.current = true;
    gameRef.current = {
      ...INITIAL_GAME,
      stage: "CALIBRATING",
      calibrationSeconds: 3,
      callout: "CALIBRATING...",
      wsConnected: gameRef.current.wsConnected,
      stats: { ...INITIAL_STATS },
    };
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action: "reset" }));
    }
    sfx.calibrate();
    publishHud();
  }, [publishHud]);

  useEffect(() => {
    const id = window.setInterval(publishHud, 120);
    return () => window.clearInterval(id);
  }, [publishHud]);

  useEffect(() => {
    if (gameRef.current.stage !== "CALIBRATING") return;
    let sec = gameRef.current.calibrationSeconds;
    const id = window.setInterval(() => {
      sec -= 1;
      const g = gameRef.current;
      if (g.stage !== "CALIBRATING") return;
      g.calibrationSeconds = Math.max(0, sec);
      g.callout = sec > 0 ? "CALIBRATING..." : "ENGAGE";
      if (sec <= 0) {
        window.clearInterval(id);
        g.stage = "ACTIVE";
        g.playerHp = PLAYER_MAX_HP;
        g.bossHp = BOSS_MAX_HP;
        g.callout = "DESCEND TO PARALLEL";
        lastRepRef.current = 0;
        sfx.hit();
      }
      publishHud();
    }, 1000);
    return () => window.clearInterval(id);
  }, [hud.stage, publishHud]);

  const applyEngine = useCallback((data: EnginePayload) => {
    const g = gameRef.current;
    if (g.stage === "COMPLETED") return;

    g.kneeAngle = data.knee_angle ?? data.primary_angle ?? g.kneeAngle;
    g.holdProgress = data.hold_progress ?? 0;
    g.holdTime = data.hold_time ?? 0;
    g.purity = typeof data.purity === "number" ? data.purity : g.purity;
    g.valgus = Boolean(data.valgus);
    g.reps = data.rep_count ?? g.reps;

    if (g.stage === "CALIBRATING") {
      g.callout = "CALIBRATING...";
      lastRepRef.current = data.rep_count ?? 0;
      return;
    }

    if (g.stage === "IDLE") return;

    if (data.phase === "HOLDING" && (data.status === "TRACKING" || data.status === "HOLDING")) {
      g.callout = "HOLD SQUAT (1.5s)";
      const now = performance.now();
      if (now - lastHoldTickRef.current > 400 && data.hold_time < 1.5) {
        lastHoldTickRef.current = now;
        sfx.holdTick();
      }
    }

    const isHoldHit = (data.status === "hit" || data.event === "HOLD_HIT") && data.damage > 0;
    if (isHoldHit && !hitAwardedRef.current) {
      hitAwardedRef.current = true;
      g.bossHp = Math.max(0, g.bossHp - data.damage);
      g.callout = "CRITICAL HIT!";
      sfx.hit();
      if (g.bossHp <= 0) finishMatch("VICTORY");
    }

    if (data.event === "REP_COMPLETE" && data.rep_count > lastRepRef.current) {
      lastRepRef.current = data.rep_count;
      g.stats.totalReps = data.rep_count;
      g.stats.purityScores = [...g.stats.purityScores, data.purity];
      g.stats.holdTimes = [...g.stats.holdTimes, data.hold_time || 1.5];
      g.callout = "CRITICAL HIT!";
      if (!hitAwardedRef.current && data.damage > 0) {
        g.bossHp = Math.max(0, g.bossHp - data.damage);
        sfx.hit();
        if (g.bossHp <= 0) finishMatch("VICTORY");
      }
      hitAwardedRef.current = false;
    }

    if (data.valgus && !lastValgusRef.current) {
      g.stats.valgusWarnings += 1;
      g.callout = data.warning || "KNEES CAVING INWARD";
    }
    lastValgusRef.current = Boolean(data.valgus);

    if (data.status === "penalty") {
      const now = Date.now();
      if (now - lastPenaltyAtRef.current > 4000) {
        lastPenaltyAtRef.current = now;
        g.playerHp = Math.max(0, g.playerHp - (data.damage_taken || 25));
        g.stats.egoPenalties += 1;
        g.callout = "EGO LIFT DETECTED!";
        sfx.penalty();
        if (g.playerHp <= 0) finishMatch("DEFEAT");
      } else {
        g.callout = "EGO LIFT DETECTED!";
      }
    }
  }, [finishMatch]);

  useEffect(() => {
    if (!scriptReady || !window.Pose) return;

    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;
    socket.onopen = () => {
      gameRef.current.wsConnected = true;
      publishHud();
    };
    socket.onclose = () => {
      gameRef.current.wsConnected = false;
      publishHud();
    };
    socket.onerror = () => {
      gameRef.current.wsConnected = false;
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as EnginePayload;
        if (data.event === "SESSION_RESET") return;
        applyEngine(data);
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
      const lms = results.poseLandmarks ?? null;
      landmarksRef.current = lms;
      if (!lms) return;

      const lHip = lms[23];
      const rHip = lms[24];
      const hasBody = Boolean((lms[11] && lms[12]) || (lHip && rHip));
      if (!autoStartedRef.current && hasBody && gameRef.current.stage === "IDLE") {
        autoStartedRef.current = true;
        resetFight();
      }

      const leftVis = ((lHip?.visibility ?? 0) + (lms[25]?.visibility ?? 0) + (lms[27]?.visibility ?? 0)) / 3;
      const rightVis = ((rHip?.visibility ?? 0) + (lms[26]?.visibility ?? 0) + (lms[28]?.visibility ?? 0)) / 3;
      const curSide = rightVis > leftVis + 0.15 ? "RIGHT" : "LEFT";

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            exercise: "squat",
            difficulty: "standard",
            left: {
              shoulder: pack(lms[11]),
              hip: pack(lHip),
              knee: pack(lms[25]),
              ankle: pack(lms[27]),
            },
            right: {
              shoulder: pack(lms[12]),
              hip: pack(rHip),
              knee: pack(lms[26]),
              ankle: pack(lms[28]),
            },
            shoulder: pack(curSide === "RIGHT" ? lms[12] : lms[11]),
            hip: pack(curSide === "RIGHT" ? rHip : lHip),
            knee: pack(curSide === "RIGHT" ? lms[26] : lms[25]),
            ankle: pack(curSide === "RIGHT" ? lms[28] : lms[27]),
            right_hip: pack(curSide === "RIGHT" ? lHip : rHip),
          }),
        );
      }
    });

    let alive = true;
    let stream: MediaStream | null = null;
    let raf = 0;

    const loop = () => {
      if (!alive) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) drawScene(ctx, video, landmarksRef.current, gameRef.current.valgus);

        if (!poseBusyRef.current) {
          poseBusyRef.current = true;
          pose.send({ image: video }).catch(() => undefined).finally(() => {
            poseBusyRef.current = false;
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          raf = requestAnimationFrame(loop);
        }
      } catch (err) {
        console.error(err);
        setCameraError("Camera access failed. Allow video to fight.");
      }
    };

    void startCamera();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      try {
        void pose.close();
      } catch {
        /* noop */
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    };
  }, [scriptReady, applyEngine, publishHud, resetFight]);

  const downloadCsv = useCallback(async () => {
    const g = gameRef.current;
    const purity = g.stats.purityScores.length ? avg(g.stats.purityScores) : g.purity;
    try {
      const res = await fetch(`${API_URL}/api/export-report`);
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "athletemind-telemetry.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      const blob = new Blob([localCsv(g.stats, purity)], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "athletemind-telemetry.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const purityDisplay = hud.stats.purityScores.length ? avg(hud.stats.purityScores) : hud.purity;
  const avgHold = avg(hud.stats.holdTimes);
  const faults = hud.stats.valgusWarnings + hud.stats.egoPenalties;
  const playerPct = (hud.playerHp / PLAYER_MAX_HP) * 100;
  const bossPct = (hud.bossHp / BOSS_MAX_HP) * 100;

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />

      <main className="relative min-h-screen bg-slate-950 text-white font-sans overflow-hidden">
        <video ref={videoRef} className="hidden" playsInline muted autoPlay />

        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <canvas ref={canvasRef} className="h-full w-full object-cover" />
        </div>

        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-transparent to-slate-950/80 pointer-events-none" />

        <header className="absolute top-0 inset-x-0 z-10 p-4 sm:p-5 pointer-events-none">
          <div className="mx-auto max-w-5xl grid grid-cols-2 sm:grid-cols-4 gap-3">
            <HudMeter label="PLAYER HP" value={`${hud.playerHp} / ${PLAYER_MAX_HP}`} pct={playerPct} tone="cyan" />
            <HudMeter label="BOSS HP" value={`${hud.bossHp} / ${BOSS_MAX_HP}`} pct={bossPct} tone="rose" />
            <HudStat label="REPS" value={String(hud.reps)} />
            <HudStat label="FORM PURITY" value={`${Math.round(purityDisplay)}%`} />
          </div>
          <div className="mx-auto max-w-5xl mt-2 flex items-center justify-between text-[10px] font-mono tracking-widest uppercase text-cyan-200/70">
            <span>Bio-Bounty Hunter</span>
            <span className={hud.wsConnected ? "text-emerald-400" : "text-amber-400"}>
              {hud.wsConnected ? "ENGINE LINKED" : "ENGINE OFFLINE"}
            </span>
          </div>
        </header>

        <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-[120%] w-[min(92vw,640px)] pointer-events-none">
          <div
            className={`rounded-2xl border px-5 py-3 text-center font-black tracking-[0.18em] uppercase shadow-[0_0_40px_rgba(34,211,238,0.25)] ${
              hud.callout.includes("EGO")
                ? "bg-rose-600/90 border-rose-300 text-white"
                : hud.callout.includes("CRITICAL")
                  ? "bg-emerald-400/90 border-emerald-100 text-slate-950"
                  : "bg-slate-950/75 border-cyan-400/70 text-cyan-100"
            }`}
          >
            <div className="text-sm sm:text-xl">{hud.callout}</div>
            {hud.stage === "ACTIVE" && hud.holdProgress > 0 && (
              <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-cyan-300" style={{ width: `${Math.min(100, hud.holdProgress * 100)}%` }} />
              </div>
            )}
          </div>
        </div>

        {cameraError && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 rounded-xl bg-rose-600 px-4 py-2 text-sm font-mono">
            {cameraError}
          </div>
        )}

        {hud.stage === "IDLE" && (
          <button
            type="button"
            onClick={resetFight}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 rounded-full bg-cyan-400 text-slate-950 font-black tracking-widest uppercase px-8 py-3 pointer-events-auto"
          >
            Begin Fight
          </button>
        )}

        {hud.stage === "COMPLETED" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-4">
            <div className="w-full max-w-md rounded-3xl border border-cyan-400/40 bg-slate-900 p-6 shadow-[0_0_80px_rgba(34,211,238,0.2)]">
              <p className="text-xs font-mono tracking-[0.3em] uppercase text-cyan-300">Post-Match Telemetry</p>
              <h2 className={`mt-2 text-3xl font-black ${hud.outcome === "VICTORY" ? "text-emerald-400" : "text-rose-400"}`}>
                {hud.outcome === "VICTORY" ? "VICTORY" : "DEFEAT"}
              </h2>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <StatCell label="Total Reps" value={String(hud.stats.totalReps || hud.reps)} />
                <StatCell label="Form Purity" value={`${purityDisplay.toFixed(0)}%`} />
                <StatCell label="Avg Hold Time" value={`${avgHold.toFixed(2)}s`} />
                <StatCell label="Faults" value={String(faults)} />
              </dl>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void downloadCsv()}
                  className="rounded-xl border border-cyan-400/60 px-4 py-3 font-mono text-sm uppercase tracking-widest text-cyan-100"
                >
                  Download Telemetry (.CSV)
                </button>
                <button
                  type="button"
                  onClick={resetFight}
                  className="rounded-xl bg-cyan-400 px-4 py-3 font-black uppercase tracking-widest text-slate-950"
                >
                  Fight Again
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function HudMeter({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct: number;
  tone: "cyan" | "rose";
}) {
  const bar = tone === "cyan" ? "bg-cyan-400" : "bg-rose-500";
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-2.5 backdrop-blur-sm">
      <div className="flex items-center justify-between text-[10px] font-mono tracking-widest uppercase text-white/60">
        <span>{label}</span>
        <span className="text-white">{value}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-2.5 backdrop-blur-sm">
      <div className="text-[10px] font-mono tracking-widest uppercase text-white/60">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-800/80 px-3 py-2">
      <dt className="text-[10px] font-mono uppercase tracking-widest text-white/50">{label}</dt>
      <dd className="text-lg font-black">{value}</dd>
    </div>
  );
}
