import os
import io
import csv
import time
from typing import Optional, List, Dict, Any, Tuple
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

app = FastAPI(title="AthleteMind Bio-Engine", version="5.0")

# Production CORS & Dynamic Origin configuration
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

# ---------------------------------------------------------------------------
# Global Telemetry Buffer
# ---------------------------------------------------------------------------
telemetry_buffer: List[Dict[str, Any]] = []


@app.get("/")
def read_root():
    return {"status": "ok", "service": "AthleteMind Arcade Bio-Engine v5.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/session-summary")
def get_session_summary():
    """Returns aggregated summary metrics for post-match review."""
    if not telemetry_buffer:
        return {
            "total_reps": 0,
            "avg_form_purity": 100.0,
            "avg_hold_duration": 0.0,
            "total_faults": 0,
            "reps": [],
        }

    total_reps = len(telemetry_buffer)
    avg_purity = round(float(np.mean([r["purity"] for r in telemetry_buffer])), 1)
    avg_hold = round(float(np.mean([r["hold_time"] for r in telemetry_buffer])), 2)
    total_faults = sum(1 for r in telemetry_buffer if r.get("fault_detected", False))

    return {
        "total_reps": total_reps,
        "avg_form_purity": avg_purity,
        "avg_hold_duration": avg_hold,
        "total_faults": total_faults,
        "reps": telemetry_buffer,
    }


@app.get("/api/export-report")
def export_telemetry_csv():
    """Generates downloadable CSV telemetry report of match repetitions."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Rep", "Knee_Angle_Deg", "Hip_Angle_Deg", "Hold_Duration_s", "Purity_Pct", "Faults", "Timestamp"])

    for item in telemetry_buffer:
        writer.writerow([
            item.get("rep_number", 0),
            item.get("knee_angle", 0.0),
            item.get("hip_angle", 0.0),
            item.get("hold_time", 0.0),
            item.get("purity", 100.0),
            item.get("fault_name", "NONE") or "NONE",
            item.get("timestamp", ""),
        ])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=athletemind_telemetry.csv"},
    )


@app.post("/api/session-reset")
def reset_session_telemetry():
    """Clears telemetry buffer for a fresh fight."""
    telemetry_buffer.clear()
    return {"status": "cleared", "total_reps": 0}


# ---------------------------------------------------------------------------
# 3D Vector Kinematics & Spatial Helpers
# ---------------------------------------------------------------------------

def to_vec3(pt: Any) -> Optional[np.ndarray]:
    """Converts coordinate tuples/lists ([x,y], [x,y,z], [x,y,z,v]) to 3D float vector."""
    if pt is None:
        return None
    arr = np.asarray(pt, dtype=float)
    if arr.size == 2:
        return np.array([arr[0], arr[1], 0.0], dtype=float)
    return arr[:3].astype(float)


def calculate_angle_3d(a: Any, b: Any, c: Any) -> float:
    """Vectorized 3D Euclidean interior angle at vertex b: theta = arccos((u . v) / (||u|| * ||v||))."""
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
    """Classifies orientation into 'FRONT' (Coronal) or 'SIDE' (Sagittal) via shoulder/hip width."""
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
    """Determines dominant side (LEFT vs RIGHT) in sagittal profile based on visibility scores."""
    if "left" in landmarks and "right" in landmarks:
        def mean_vis(chain: Dict[str, Any]) -> float:
            scores = [pt[3] for pt in chain.values() if pt is not None and len(pt) >= 4]
            return float(np.mean(scores)) if scores else 1.0
        return "RIGHT" if mean_vis(landmarks["right"]) > mean_vis(landmarks["left"]) + 0.15 else "LEFT"
    return "LEFT"


def check_frontal_valgus(left_knee: Any, right_knee: Any, left_ankle: Any, right_ankle: Any) -> bool:
    """Detects coronal medial knee collapse: |x_lk - x_rk| < |x_la - x_ra| * 0.75."""
    if not (left_knee and right_knee and left_ankle and right_ankle):
        return False
    knee_sep = abs(left_knee[0] - right_knee[0])
    ankle_sep = abs(left_ankle[0] - right_ankle[0])
    return bool(ankle_sep >= 0.05 and knee_sep < (ankle_sep * 0.75))


def check_knee_valgus(hip: List[float], knee: List[float], ankle: List[float],
                      right_hip: Optional[List[float]] = None) -> bool:
    """Legacy 2D single-side knee valgus calculation."""
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
    """Normalizes bilateral {left: {...}, right: {...}} and flat landmark payloads."""
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


# ---------------------------------------------------------------------------
# Squat Biomechanical Engine
# ---------------------------------------------------------------------------

class SquatEngine:
    """High-performance arcade squat kinematics engine with hold verification and anti-ego-lifting."""

    def __init__(self, exercise: str = "squat"):
        self.exercise = "squat"
        self.phase = "STANDING"
        self.rep_count = 0
        self.hold_start_time: Optional[float] = None
        self.last_valid_hold_time = 0.0
        self.hold_duration = 0.0
        self.rep_hit_awarded = False
        self.smooth_primary: Optional[float] = None
        self.smooth_secondary: Optional[float] = None

        # Anti-Ego-Lift Tracking
        self.is_stunned = False
        self.stun_until = 0.0
        self.in_shallow_dip = False
        self.sloppy_dips: List[float] = []

    def reset(self):
        self.phase = "STANDING"
        self.rep_count = 0
        self.hold_start_time = None
        self.last_valid_hold_time = 0.0
        self.hold_duration = 0.0
        self.rep_hit_awarded = False
        self.smooth_primary = None
        self.smooth_secondary = None
        self.is_stunned = False
        self.stun_until = 0.0
        self.in_shallow_dip = False
        self.sloppy_dips.clear()

    def process(self, landmarks: Dict[str, Any], difficulty: str = "standard", now: Optional[float] = None,
                rom_calibration: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        orientation, dom_side, left, right = normalize_landmarks(landmarks)
        active = right if (dom_side == "RIGHT" and right.get("hip")) else left

        # Handle Stun State
        if self.is_stunned:
            if now >= self.stun_until:
                self.is_stunned = False
                self.phase = "STANDING"
            else:
                return self._build_payload(
                    pri=self.smooth_primary or 180.0,
                    sec=self.smooth_secondary or 90.0,
                    ori=orientation,
                    dom=dom_side,
                    status="penalty",
                    phase="STUNNED",
                    fault=True,
                    fault_nm="EGO LIFT",
                    valgus=False,
                    warning="WEAPON OVERHEATED - STUNNED",
                    voice_cue="Slow down! Weapon overheated.",
                    hold_dur=0.0,
                    damage=0,
                    dmg_taken=25,
                    feedback="EGO LIFT DETECTED! STUNNED (-25 HP)",
                    overheated=True,
                    hold_target=1.5,
                    event="EGO_LIFT",
                )

        valgus = False
        fault_detected = False
        fault_name = ""
        warning = ""
        voice_cue = ""
        symmetry = 98.0

        l_h, l_k, l_a = left.get("hip"), left.get("knee"), left.get("ankle")
        r_h, r_k, r_a = right.get("hip"), right.get("knee"), right.get("ankle")
        l_s, r_s = left.get("shoulder"), right.get("shoulder")

        if orientation == "FRONT":
            if not ((l_h and l_k and l_a) or (r_h and r_k and r_a)):
                return {}
            l_k_ang = calculate_angle_3d(l_h, l_k, l_a) if (l_h and l_k and l_a) else None
            r_k_ang = calculate_angle_3d(r_h, r_k, r_a) if (r_h and r_k and r_a) else None
            raw_primary = (l_k_ang + r_k_ang) / 2.0 if (l_k_ang and r_k_ang) else (l_k_ang or r_k_ang)  # type: ignore
            if l_k_ang and r_k_ang:
                symmetry = max(0.0, min(100.0, 100.0 - abs(l_k_ang - r_k_ang) * 1.5))
            l_h_ang = calculate_angle_3d(l_s, l_h, l_k) if (l_s and l_h and l_k) else 90.0
            r_h_ang = calculate_angle_3d(r_s, r_h, r_k) if (r_s and r_h and r_k) else 90.0
            raw_secondary = (l_h_ang + r_h_ang) / 2.0
            v_drop = np.mean([p[1] for p in (l_k, r_k) if p]) - np.mean([p[1] for p in (l_h, r_h) if p])

            if check_frontal_valgus(l_k, r_k, l_a, r_a):
                valgus = fault_detected = True
                fault_name = "VALGUS"
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
                valgus = fault_detected = True
                fault_name = "VALGUS"
                warning = "KNEE VALGUS DETECTED"

        # Squat Hold Thresholds: knee < 90° for >= 1.5s (entry window up to 105° with EMA)
        t_min, t_max, hip_max = (75.0, 110.0, 105.0) if difficulty == "rehab" else (60.0, 90.0, 90.0) if difficulty == "athlete" else (60.0, 105.0, 95.0)
        hold_target = 1.5 if difficulty != "rehab" else 1.0
        stand_thresh = 148.0

        if rom_calibration and "squat_min" in rom_calibration:
            calib_min = float(rom_calibration["squat_min"])
            if 40.0 <= calib_min <= 135.0:
                t_max = min(110.0, max(75.0, calib_min + 8.0))

        # Exponential Moving Average Smoothing
        if self.smooth_primary is None:
            self.smooth_primary, self.smooth_secondary = raw_primary, raw_secondary
        else:
            self.smooth_primary = round(0.75 * raw_primary + 0.25 * self.smooth_primary, 1)
            self.smooth_secondary = round(0.75 * raw_secondary + 0.25 * self.smooth_secondary, 1)

        pri_ang, sec_ang = self.smooth_primary, self.smooth_secondary

        # Target Hold Condition: Knee angle < 90 degrees sustained, no knee valgus collapse
        if orientation == "FRONT":
            is_target_hold = (((t_min <= pri_ang <= t_max) or (v_drop <= 0.10 and pri_ang <= 125.0)) and not valgus)
            is_reset_position = (pri_ang >= stand_thresh or v_drop >= 0.16)
        else:
            is_target_hold = (t_min <= pri_ang <= t_max and sec_ang <= hip_max and not valgus)
            is_reset_position = (pri_ang >= stand_thresh)

        # Anti-Ego-Lift Engine: Flag rapid incomplete reps (> 2 shallow bounces under 3.0s)
        if pri_ang < 140.0:
            self.in_shallow_dip = True
        if self.in_shallow_dip and is_reset_position:
            if not self.rep_hit_awarded:
                self.sloppy_dips.append(now)
                self.sloppy_dips = [t for t in self.sloppy_dips if now - t <= 3.0]
                if len(self.sloppy_dips) >= 2:
                    self.is_stunned, self.stun_until = True, now + 3.5
                    self.sloppy_dips.clear()
                    self.in_shallow_dip = False
                    return self._build_payload(
                        pri=pri_ang,
                        sec=sec_ang,
                        ori=orientation,
                        dom=dom_side,
                        status="penalty",
                        phase="STUNNED",
                        fault=True,
                        fault_nm="EGO LIFT",
                        valgus=False,
                        warning="EGO LIFT DETECTED",
                        voice_cue="Slow down! Don't bounce!",
                        hold_dur=0.0,
                        damage=0,
                        dmg_taken=25,
                        feedback="EGO LIFT DETECTED! STUNNED (-25 HP)",
                        overheated=True,
                        hold_target=hold_target,
                        event="EGO_LIFT",
                    )
            self.in_shallow_dip = False

        # State Machine Transitions
        status, damage, feedback = "TRACKING", 0, "IN POSITION"
        event = "FRAME"

        if is_target_hold:
            self.phase = "HOLDING"
            self.last_valid_hold_time = now
            if self.hold_start_time is None:
                self.hold_start_time = now
            self.hold_duration = now - self.hold_start_time

            # Hold threshold check: sustained for >= 1.5 seconds
            if self.hold_duration >= hold_target:
                status, damage = "hit", 100
                event = "HOLD_HIT"
                self.rep_hit_awarded = True
                feedback = "CRITICAL HIT! RETURN TO COMPLETE REP (+100 DMG)"
            else:
                feedback = f"HOLD SQUAT ({self.hold_duration:.1f}s / {hold_target:.1f}s)"
        else:
            if now - self.last_valid_hold_time >= 0.8:
                self.hold_start_time, self.hold_duration = None, 0.0

            if is_reset_position:
                if self.rep_hit_awarded:
                    self.rep_count += 1
                    self.rep_hit_awarded = False
                    status = "CRITICAL HIT!"
                    damage = 100
                    event = "REP_COMPLETE"
                    voice_cue = "Rep completed! Excellent form."
                    feedback = f"REP {self.rep_count} COMPLETE! (+100 DMG)"

                    # Log to global telemetry buffer
                    telemetry_buffer.append({
                        "rep_number": self.rep_count,
                        "knee_angle": pri_ang,
                        "hip_angle": sec_ang,
                        "hold_time": round(self.hold_duration, 2),
                        "purity": round(max(0.0, min(100.0, 100.0 - (35.0 if fault_detected else 0.0))), 1),
                        "fault_detected": fault_detected,
                        "fault_name": fault_name,
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
                    })
                else:
                    feedback = "READY • SQUAT DOWN"
                    event = "FRAME"
                    damage = 0
                self.phase = "STANDING"
            else:
                self.phase = "ASCENDING" if self.rep_hit_awarded else "DESCENDING"
                feedback = warning or ("RETURN TO STANDING" if self.rep_hit_awarded else f"SQUAT TO 90° ({int(pri_ang)}°)")

        return self._build_payload(
            pri=pri_ang,
            sec=sec_ang,
            ori=orientation,
            dom=dom_side,
            status=status,
            phase=self.phase,
            fault=fault_detected or valgus,
            fault_nm=fault_name,
            valgus=valgus,
            warning=warning,
            voice_cue=voice_cue,
            hold_dur=self.hold_duration,
            damage=damage,
            dmg_taken=0,
            feedback=feedback,
            overheated=False,
            hold_target=hold_target,
            symmetry=symmetry,
            event=event,
        )

    def _build_payload(self, pri: float, sec: float, ori: str, dom: str,
                       status: str, phase: str, fault: bool, fault_nm: str, valgus: bool,
                       warning: str, voice_cue: str, hold_dur: float, damage: int, dmg_taken: int,
                       feedback: str, overheated: bool, hold_target: float, symmetry: float = 98.0,
                       event: str = "FRAME") -> Dict[str, Any]:
        purity = round(max(0.0, min(100.0, 100.0 - (35.0 if fault else 0.0))), 2)
        is_critical = bool(status in ("hit", "CRITICAL HIT!") or damage >= 100)
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
            "valgus": valgus,
            "warning": warning,
            "voice_cue": voice_cue,
            "hold_progress": round(min(1.0, hold_dur / max(0.1, hold_target)), 2),
            "hold_time": round(hold_dur, 2),
            "rep_count": self.rep_count,
            "purity": purity,
            "symmetry": round(symmetry, 1),
            "damage": int(damage),
            "damage_taken": dmg_taken,
            "coach_feedback": feedback,
            "weapon_overheated": overheated,
            "is_critical": is_critical,
        }

    def process_frame(self, *args, **kwargs) -> Dict[str, Any]:
        """Backward compatibility adapter for test suites."""
        if kwargs and "shoulder" in kwargs:
            now = kwargs.get("now", time.time())
            return self.process(kwargs, "standard", now)
        if len(args) >= 3:
            return self.process(args[2], args[1] if len(args) > 1 else "standard", args[3] if len(args) > 3 else time.time())
        return self.process({}, "standard", time.time())


# ---------------------------------------------------------------------------
# Exercise Session Dispatcher & WebSocket Lifecycle
# ---------------------------------------------------------------------------

class ExerciseSession:
    """Manages active squat engine per WebSocket client connection."""
    def __init__(self):
        self.engine = SquatEngine()
        self.rom_calibration: Dict[str, float] = {}

    def reset(self):
        self.engine.reset()
        telemetry_buffer.clear()

    def process_frame(self, exercise: str, difficulty: str, landmarks: Dict[str, Any], now: Optional[float] = None) -> Dict[str, Any]:
        if now is None:
            now = time.time()
        rom_calibration = landmarks.get("rom_calibration") or self.rom_calibration
        return self.engine.process(landmarks, difficulty, now, rom_calibration=rom_calibration)


@app.websocket("/ws/pose")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = ExerciseSession()
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "reset":
                session.reset()
                await websocket.send_json({"event": "SESSION_RESET", "status": "RESET_COMPLETE"})
                continue

            if action == "calibrate_rom":
                if "rom_calibration" in data and isinstance(data["rom_calibration"], dict):
                    session.rom_calibration.update(data["rom_calibration"])
                await websocket.send_json({
                    "event": "ROM_CALIBRATED",
                    "status": "CALIBRATION_STORED",
                    "rom_calibration": session.rom_calibration,
                })
                continue

            payload = session.process_frame(
                "squat",
                data.get("difficulty", "standard"),
                data,
                time.time()
            )
            if payload:
                await websocket.send_json(payload)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ERROR] WebSocket: {e}")