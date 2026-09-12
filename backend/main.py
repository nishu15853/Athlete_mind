import csv
import io
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

app = FastAPI(title="AthleteMind Bio-Bounty Hunter", version="5.0")

allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "*")
if allowed_origins_raw.strip() == "*":
    allow_origins = ["*"]
    allow_credentials = False
else:
    allow_origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

HOLD_TARGET_S = 1.5
HOLD_KNEE_MAX = 90.0
STAND_KNEE_MIN = 150.0
HIT_DAMAGE = 100
EGO_PENALTY_HP = 25
EGO_WINDOW_S = 3.0
EGO_BOUNCE_COUNT = 2
STUN_DURATION_S = 3.5
HOLD_GRACE_S = 0.35


@app.get("/")
def read_root():
    return {"status": "ok", "service": "AthleteMind Bio-Bounty Hunter v5.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


def to_vec3(pt: Any) -> Optional[np.ndarray]:
    if pt is None:
        return None
    arr = np.asarray(pt, dtype=float)
    if arr.size == 2:
        return np.array([arr[0], arr[1], 0.0], dtype=float)
    return arr[:3].astype(float)


def calculate_angle_3d(a: Any, b: Any, c: Any) -> float:
    """3D Euclidean interior angle at vertex b."""
    va, vb, vc = to_vec3(a), to_vec3(b), to_vec3(c)
    if va is None or vb is None or vc is None:
        return 180.0

    u, v = va - vb, vc - vb
    norm_u, norm_v = np.linalg.norm(u), np.linalg.norm(v)
    if norm_u < 1e-6 or norm_v < 1e-6:
        return 180.0

    cosine = np.clip(np.dot(u, v) / (norm_u * norm_v), -1.0, 1.0)
    return round(float(np.degrees(np.arccos(cosine))), 1)


calculate_angle = calculate_angle_3d


def detect_orientation(landmarks: Dict[str, Any]) -> str:
    if "left" in landmarks and "right" in landmarks:
        ls, rs = landmarks["left"].get("shoulder"), landmarks["right"].get("shoulder")
        lh, rh = landmarks["left"].get("hip"), landmarks["right"].get("hip")
    else:
        ls, rs = landmarks.get("shoulder"), landmarks.get("right_shoulder")
        lh, rh = landmarks.get("hip"), landmarks.get("right_hip")

    sw = abs(ls[0] - rs[0]) if (ls and rs) else 0.0
    hw = abs(lh[0] - rh[0]) if (lh and rh) else 0.0
    return "FRONT" if (sw > 0.15 or hw > 0.15) else "SIDE"


def get_dominant_side(landmarks: Dict[str, Any]) -> str:
    if "left" in landmarks and "right" in landmarks:
        def mean_vis(chain: Dict[str, Any]) -> float:
            scores = [pt[3] for pt in chain.values() if pt is not None and len(pt) >= 4]
            return float(np.mean(scores)) if scores else 1.0
        return "RIGHT" if mean_vis(landmarks["right"]) > mean_vis(landmarks["left"]) + 0.15 else "LEFT"
    return "LEFT"


def check_frontal_valgus(left_knee: Any, right_knee: Any, left_ankle: Any, right_ankle: Any) -> bool:
    if not (left_knee and right_knee and left_ankle and right_ankle):
        return False
    knee_sep, ankle_sep = abs(left_knee[0] - right_knee[0]), abs(left_ankle[0] - right_ankle[0])
    return bool(ankle_sep >= 0.05 and knee_sep < (ankle_sep * 0.75))


def check_knee_valgus(
    hip: List[float],
    knee: List[float],
    ankle: List[float],
    right_hip: Optional[List[float]] = None,
) -> bool:
    if not right_hip or abs(hip[0] - right_hip[0]) < 0.07:
        return False
    hx, hy = hip[0], hip[1]
    kx, ky = knee[0], knee[1]
    ax, ay = ankle[0], ankle[1]
    mid_x = (hx + right_hip[0]) / 2.0
    dy = ay - hy
    if abs(dy) < 1e-4:
        return False
    expected_kx = hx + ((ky - hy) / dy) * (ax - hx)
    inward = (expected_kx - kx) if hx > mid_x else (kx - expected_kx)
    return bool(inward > 0.045)


def normalize_landmarks(data: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any], Dict[str, Any]]:
    if "left" in data and "right" in data:
        return detect_orientation(data), get_dominant_side(data), data["left"], data["right"]

    left = {k: data.get(k) for k in ("shoulder", "elbow", "wrist", "hip", "knee", "ankle", "ear")}
    right = {
        "shoulder": data.get("right_shoulder"),
        "elbow": data.get("right_elbow"),
        "wrist": data.get("right_wrist"),
        "hip": data.get("right_hip"),
        "knee": data.get("right_knee"),
        "ankle": data.get("right_ankle"),
        "ear": data.get("right_ear"),
    }
    return detect_orientation({"left": left, "right": right}), "LEFT", left, right


class TelemetryBuffer:
    def __init__(self):
        self.reset()

    def reset(self):
        self.started_at = time.time()
        self.reps: List[Dict[str, Any]] = []
        self.faults: List[str] = []
        self.purity_samples: List[float] = []
        self.hold_times: List[float] = []

    def log_fault(self, name: str):
        self.faults.append(name)

    def log_hold_hit(self, knee: float, hip: float, duration: float, purity: float, valgus: bool):
        self.reps.append({
            "rep": len(self.reps) + 1,
            "knee_angle": round(knee, 1),
            "hip_angle": round(hip, 1),
            "hold_duration": round(duration, 2),
            "purity": round(purity, 1),
            "valgus": bool(valgus),
            "t": round(time.time() - self.started_at, 2),
        })
        self.hold_times.append(duration)
        self.purity_samples.append(purity)
        if valgus:
            self.log_fault("KNEE_VALGUS")

    def summary(self) -> Dict[str, Any]:
        purity = round(float(np.mean(self.purity_samples)), 1) if self.purity_samples else 100.0
        avg_hold = round(float(np.mean(self.hold_times)), 2) if self.hold_times else 0.0
        return {
            "total_reps": len(self.reps),
            "form_purity": purity,
            "average_hold_time": avg_hold,
            "biomechanical_faults": list(self.faults),
            "fault_count": len(self.faults),
            "reps": self.reps,
        }

    def to_csv(self) -> str:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["rep", "knee_angle", "hip_angle", "hold_duration_s", "purity", "valgus", "elapsed_s"])
        for row in self.reps:
            writer.writerow([
                row["rep"],
                row["knee_angle"],
                row["hip_angle"],
                row["hold_duration"],
                row["purity"],
                row["valgus"],
                row["t"],
            ])
        writer.writerow([])
        summary = self.summary()
        writer.writerow(["total_reps", summary["total_reps"]])
        writer.writerow(["form_purity", summary["form_purity"]])
        writer.writerow(["average_hold_time", summary["average_hold_time"]])
        writer.writerow(["fault_count", summary["fault_count"]])
        writer.writerow(["faults", ";".join(summary["biomechanical_faults"])])
        return buf.getvalue()


telemetry = TelemetryBuffer()


class SquatEngine:
    def __init__(self):
        self.phase = "STANDING"
        self.rep_count = 0
        self.hold_start_time: Optional[float] = None
        self.last_valid_hold_time = 0.0
        self.hold_duration = 0.0
        self.rep_hit_awarded = False
        self.hit_emitted = False
        self.smooth_primary: Optional[float] = None
        self.smooth_secondary: Optional[float] = None
        self.is_stunned = False
        self.stun_until = 0.0
        self.in_shallow_dip = False
        self.sloppy_dips: List[float] = []
        self.last_valgus = False
        self.telemetry = telemetry

    def reset(self):
        self.__init__()

    def process(self, landmarks: Dict[str, Any], now: Optional[float] = None) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        orientation, dom_side, left, right = normalize_landmarks(landmarks)
        active = right if (dom_side == "RIGHT" and right.get("hip")) else left

        l_h, l_k, l_a = left.get("hip"), left.get("knee"), left.get("ankle")
        r_h, r_k, r_a = right.get("hip"), right.get("knee"), right.get("ankle")
        l_s, r_s = left.get("shoulder"), right.get("shoulder")

        valgus = False
        warning = ""
        voice_cue = ""
        v_drop = 0.16
        symmetry = 98.0

        if orientation == "FRONT":
            if not ((l_h and l_k and l_a) or (r_h and r_k and r_a)):
                return {}
            l_k_ang = calculate_angle_3d(l_h, l_k, l_a) if (l_h and l_k and l_a) else None
            r_k_ang = calculate_angle_3d(r_h, r_k, r_a) if (r_h and r_k and r_a) else None
            raw_primary = (l_k_ang + r_k_ang) / 2.0 if (l_k_ang and r_k_ang) else (l_k_ang or r_k_ang)
            if l_k_ang and r_k_ang:
                symmetry = max(0.0, min(100.0, 100.0 - abs(l_k_ang - r_k_ang) * 1.5))
            l_h_ang = calculate_angle_3d(l_s, l_h, l_k) if (l_s and l_h and l_k) else 90.0
            r_h_ang = calculate_angle_3d(r_s, r_h, r_k) if (r_s and r_h and r_k) else 90.0
            raw_secondary = (l_h_ang + r_h_ang) / 2.0
            v_drop = float(np.mean([p[1] for p in (l_k, r_k) if p]) - np.mean([p[1] for p in (l_h, r_h) if p]))
            if check_frontal_valgus(l_k, r_k, l_a, r_a):
                valgus = True
                warning = "KNEES CAVING INWARD - DRIVE KNEES OUT"
                voice_cue = "Push your knees out!"
        else:
            h, k, a, s = active.get("hip"), active.get("knee"), active.get("ankle"), active.get("shoulder")
            if not (h and k and a):
                return {}
            raw_primary = calculate_angle_3d(h, k, a)
            raw_secondary = calculate_angle_3d(s, h, k) if s else calculate_angle_3d([h[0], h[1] - 0.5, 0.0], h, k)
            v_drop = k[1] - h[1]
            if check_knee_valgus(h, k, a, right_hip=right.get("hip")):
                valgus = True
                warning = "KNEE VALGUS DETECTED"

        if self.is_stunned:
            if now >= self.stun_until:
                self.is_stunned = False
                self.phase = "STANDING"
            else:
                return self._payload(
                    self.smooth_primary or 180.0,
                    self.smooth_secondary or 90.0,
                    orientation,
                    dom_side,
                    "penalty",
                    "STUNNED",
                    True,
                    "EGO LIFT",
                    False,
                    "EGO LIFT DETECTED",
                    "Slow down! Weapon overheated.",
                    0.0,
                    0,
                    EGO_PENALTY_HP,
                    "EGO LIFT DETECTED! STUNNED (-25 HP)",
                    True,
                    symmetry,
                    "STUN",
                )

        if self.smooth_primary is None:
            self.smooth_primary, self.smooth_secondary = raw_primary, raw_secondary
        else:
            self.smooth_primary = round(0.75 * raw_primary + 0.25 * self.smooth_primary, 1)
            self.smooth_secondary = round(0.75 * raw_secondary + 0.25 * self.smooth_secondary, 1)

        pri_ang, sec_ang = self.smooth_primary, self.smooth_secondary
        hold_knee, stand_knee = raw_primary, raw_primary

        if orientation == "FRONT":
            # Webcam foreshortening: true 90° is rare from the front, so depth also uses hip-knee drop.
            is_target_hold = ((hold_knee <= HOLD_KNEE_MAX) or (v_drop <= 0.10 and hold_knee <= 125.0)) and not valgus
            is_reset_position = stand_knee >= STAND_KNEE_MIN or v_drop >= 0.16
        else:
            is_target_hold = hold_knee <= HOLD_KNEE_MAX and not valgus
            is_reset_position = stand_knee >= STAND_KNEE_MIN

        if hold_knee < 140.0:
            self.in_shallow_dip = True
        if self.in_shallow_dip and is_reset_position:
            if not self.rep_hit_awarded:
                self.sloppy_dips.append(now)
                self.sloppy_dips = [t for t in self.sloppy_dips if now - t <= EGO_WINDOW_S]
                if len(self.sloppy_dips) >= EGO_BOUNCE_COUNT:
                    self.is_stunned = True
                    self.stun_until = now + STUN_DURATION_S
                    self.sloppy_dips.clear()
                    self.in_shallow_dip = False
                    self.telemetry.log_fault("EGO_LIFT")
                    return self._payload(
                        pri_ang,
                        sec_ang,
                        orientation,
                        dom_side,
                        "penalty",
                        "STUNNED",
                    True,
                    "EGO LIFT",
                    False,
                    "EGO LIFT DETECTED",
                    "Slow down! Don't bounce!",
                        0.0,
                        0,
                        EGO_PENALTY_HP,
                        "EGO LIFT DETECTED! STUNNED (-25 HP)",
                        True,
                        symmetry,
                        "EGO_LIFT",
                    )
            self.in_shallow_dip = False

        status, damage, feedback = "TRACKING", 0, "IN POSITION"
        event = "FRAME"
        dmg_taken = 0

        if is_target_hold:
            self.phase = "HOLDING"
            self.last_valid_hold_time = now
            if self.hold_start_time is None:
                self.hold_start_time = now
            self.hold_duration = now - self.hold_start_time

            if self.hold_duration >= HOLD_TARGET_S:
                self.rep_hit_awarded = True
                if not self.hit_emitted:
                    self.hit_emitted = True
                    status, damage = "hit", HIT_DAMAGE
                    event = "HOLD_HIT"
                    voice_cue = voice_cue or "Critical hit! Stand up!"
                    feedback = f"CRITICAL HIT! RETURN TO COMPLETE REP (+{HIT_DAMAGE} DMG)"
                    purity = round(max(0.0, min(100.0, 100.0 - (35.0 if valgus else 0.0))), 2)
                    self.telemetry.log_hold_hit(pri_ang, sec_ang, self.hold_duration, purity, valgus)
                else:
                    feedback = "CRITICAL HIT! STAND TO LOCK THE REP"
            else:
                feedback = f"HOLD SQUAT ({self.hold_duration:.1f}s / {HOLD_TARGET_S:.1f}s)"
        else:
            if now - self.last_valid_hold_time >= HOLD_GRACE_S:
                self.hold_start_time, self.hold_duration = None, 0.0
                self.hit_emitted = False

            if is_reset_position:
                if self.rep_hit_awarded:
                    self.rep_count += 1
                    self.rep_hit_awarded = False
                    self.hit_emitted = False
                    status = "CRITICAL HIT!"
                    damage = HIT_DAMAGE
                    event = "REP_COMPLETE"
                    voice_cue = "Rep completed! Good form."
                    feedback = f"REP {self.rep_count} COMPLETE! (+{HIT_DAMAGE} DMG)"
                else:
                    feedback = "READY • DESCEND TO PARALLEL"
                    event = "FRAME"
                    damage = 0
                self.phase = "STANDING"
            else:
                self.phase = "ASCENDING" if self.rep_hit_awarded else "DESCENDING"
                feedback = warning or ("RETURN TO STAND" if self.rep_hit_awarded else f"REACH DEPTH ({int(pri_ang)}°)")

        if valgus and not self.last_valgus:
            self.telemetry.log_fault("KNEE_VALGUS")
        self.last_valgus = valgus

        return self._payload(
            pri_ang,
            sec_ang,
            orientation,
            dom_side,
            status,
            self.phase,
            valgus,
            "VALGUS" if valgus else "",
            valgus,
            warning,
            voice_cue,
            self.hold_duration,
            damage,
            dmg_taken,
            feedback,
            False,
            symmetry,
            event,
        )

    def _payload(
        self,
        pri: float,
        sec: float,
        ori: str,
        dom: str,
        status: str,
        phase: str,
        fault: bool,
        fault_nm: str,
        valgus: bool,
        warning: str,
        voice_cue: str,
        hold_dur: float,
        damage: int,
        dmg_taken: int,
        feedback: str,
        overheated: bool,
        symmetry: float,
        event: str,
    ) -> Dict[str, Any]:
        purity = round(max(0.0, min(100.0, 100.0 - (35.0 if fault else 0.0))), 2)
        return {
            "event": event,
            "exercise": "squat",
            "orientation": ori,
            "dominant_side": dom if ori == "SIDE" else "BILATERAL",
            "status": status,
            "phase": phase,
            "primary_angle": pri,
            "primary_label": "KNEE",
            "secondary_angle": sec,
            "secondary_label": "HIP",
            "knee_angle": round(pri, 1),
            "hip_angle": round(sec, 1),
            "message": feedback,
            "error": warning,
            "fault_detected": fault,
            "fault_name": fault_nm,
            "valgus": bool(valgus),
            "warning": warning,
            "voice_cue": voice_cue,
            "hold_progress": round(min(1.0, hold_dur / HOLD_TARGET_S), 2),
            "hold_time": round(hold_dur, 2),
            "rep_count": self.rep_count,
            "purity": purity,
            "symmetry": round(symmetry, 1),
            "damage": int(damage),
            "damage_taken": dmg_taken,
            "coach_feedback": feedback,
            "weapon_overheated": overheated,
            "is_critical": bool(status == "CRITICAL HIT!" or damage >= 80),
        }

    def process_frame(self, *args, **kwargs) -> Dict[str, Any]:
        if kwargs and ("shoulder" in kwargs or "hip" in kwargs or "left" in kwargs):
            now = kwargs.get("now", time.time())
            payload = {k: v for k, v in kwargs.items() if k != "now"}
            return self.process(payload, now)
        if len(args) >= 3 and isinstance(args[2], dict):
            return self.process(args[2], args[3] if len(args) > 3 else time.time())
        return self.process({}, time.time())


class ExerciseSession:
    def __init__(self):
        self.engine = SquatEngine()

    def reset(self):
        telemetry.reset()
        self.engine = SquatEngine()

    def process_frame(
        self,
        exercise: str,
        difficulty: str,
        landmarks: Dict[str, Any],
        now: Optional[float] = None,
    ) -> Dict[str, Any]:
        del exercise, difficulty
        if now is None:
            now = time.time()
        return self.engine.process(landmarks, now)


@app.get("/api/session-summary")
def session_summary():
    return JSONResponse(telemetry.summary())


@app.get("/api/export-report")
def export_report():
    csv_body = telemetry.to_csv()
    return Response(
        content=csv_body,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=athletemind-telemetry.csv"},
    )


@app.websocket("/ws/pose")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = ExerciseSession()
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("action") == "reset":
                session.reset()
                await websocket.send_json({"event": "SESSION_RESET", "status": "RESET_COMPLETE"})
                continue

            payload = session.process_frame(
                data.get("exercise", "squat"),
                data.get("difficulty", "standard"),
                data,
                time.time(),
            )
            if payload:
                await websocket.send_json(payload)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ERROR] WebSocket: {e}")
