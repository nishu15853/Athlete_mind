import os
import time
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

app = FastAPI(title="AthleteMind Phase 2 - Bio-Bounty Hunter Kinematics", version="2.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "AthleteMind Phase 2 Bio-Engine", "version": "2.0.0"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# ---------------------------------------------------------------------------
# Biomechanical Kinematics Engine (NumPy + arctan2)
# ---------------------------------------------------------------------------

def calculate_angle(a: Any, b: Any, c: Any) -> float:
    """Calculates planar joint angle at vertex b using np.arctan2.
    a: [x, y] or [x, y, z] (First Joint, e.g., Hip or Shoulder)
    b: [x, y] or [x, y, z] (Mid Joint / Vertex, e.g., Knee or Hip)
    c: [x, y] or [x, y, z] (End Joint, e.g., Ankle or Knee)
    """
    if a is None or b is None or c is None:
        return 180.0

    a_arr = np.array(a[:2], dtype=float)
    b_arr = np.array(b[:2], dtype=float)
    c_arr = np.array(c[:2], dtype=float)

    radians = np.arctan2(c_arr[1] - b_arr[1], c_arr[0] - b_arr[0]) - np.arctan2(
        a_arr[1] - b_arr[1], a_arr[0] - b_arr[0]
    )
    angle = np.abs(radians * 180.0 / np.pi)
    if angle > 180.0:
        angle = 360.0 - angle
    return round(float(angle), 1)


calculate_angle_3d = calculate_angle


def check_knee_valgus(hip: Any, knee: Any, ankle: Any, side: str = "left", right_hip: Any = None) -> bool:
    """Knee valgus tracking: flags if knee collapses inward relative to hip & ankle."""
    if not (hip and knee and ankle):
        return False
    hx, hy = float(hip[0]), float(hip[1])
    kx, ky = float(knee[0]), float(knee[1])
    ax, ay = float(ankle[0]), float(ankle[1])

    # If both hips are available, calculate deviation towards central midline
    if right_hip:
        rx = float(right_hip[0])
        mid_x = (hx + rx) / 2.0
        dy = ay - hy
        if abs(dy) < 1e-4:
            return False
        expected_kx = hx + ((ky - hy) / dy) * (ax - hx)
        inward = (expected_kx - kx) if hx > mid_x else (kx - expected_kx)
        return bool(inward > 0.04)

    return False


def check_frontal_valgus(left_knee: Any, right_knee: Any, left_ankle: Any, right_ankle: Any) -> bool:
    """Coronal medial knee collapse check."""
    if not (left_knee and right_knee and left_ankle and right_ankle):
        return False
    knee_sep = abs(float(left_knee[0]) - float(right_knee[0]))
    ankle_sep = abs(float(left_ankle[0]) - float(right_ankle[0]))
    return bool(ankle_sep >= 0.05 and knee_sep < (ankle_sep * 0.75))


class SquatEngine:
    """Phase 2 Bio-Bounty Hunter Kinematics Engine.
    - Clinical Hold Verification (Hip < 90°, Knee 70°-95° for >= 1.5s -> 100 DMG).
    - Knee Valgus Tracking ('knee_caved_in').
    - Anti-Ego-Lift Engine (> 2 rapid sloppy bounces under 3s -> 25 HP penalty, weapon overheated).
    """

    def __init__(self):
        self.rep_count = 0
        self.phase = "STANDING"
        self.hold_start_time: Optional[float] = None
        self.hold_duration = 0.0
        self.rep_hit_awarded = False

        # Ego-Lift Tracking
        self.is_stunned = False
        self.stun_until = 0.0
        self.weapon_overheated = False
        self.in_shallow_dip = False
        self.sloppy_dips: List[float] = []

        # Smoothing
        self.smooth_knee: Optional[float] = None
        self.smooth_hip: Optional[float] = None

    def reset(self):
        self.rep_count = 0
        self.phase = "STANDING"
        self.hold_start_time = None
        self.hold_duration = 0.0
        self.rep_hit_awarded = False
        self.is_stunned = False
        self.stun_until = 0.0
        self.weapon_overheated = False
        self.in_shallow_dip = False
        self.sloppy_dips.clear()
        self.smooth_knee = None
        self.smooth_hip = None

    def process(self, hip: Any, knee: Any, ankle: Any, shoulder: Any = None,
                now: Optional[float] = None, right_hip: Any = None,
                left_knee: Any = None, right_knee: Any = None,
                left_ankle: Any = None, right_ankle: Any = None) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        # Handle Stun State
        if self.is_stunned:
            if now >= self.stun_until:
                self.is_stunned = False
                self.weapon_overheated = False
                self.phase = "STANDING"
            else:
                return self._build_payload(
                    status="penalty",
                    phase="STUNNED",
                    knee_angle=self.smooth_knee or 180.0,
                    hip_angle=self.smooth_hip or 90.0,
                    hold_dur=0.0,
                    damage=0,
                    damage_taken=0,
                    valgus=False,
                    overheated=True,
                    error="EGO LIFT DETECTED - STUNNED!",
                    message="WEAPON OVERHEATED - STUNNED!",
                    event="FRAME"
                )

        # 1. Compute Raw Angles
        raw_knee = calculate_angle(hip, knee, ankle)
        if shoulder:
            raw_hip = calculate_angle(shoulder, hip, knee)
        else:
            # Approximate vertical spine datum
            raw_hip = calculate_angle([float(hip[0]), float(hip[1]) - 0.4], hip, knee)

        # EMA Smoothing
        if self.smooth_knee is None:
            self.smooth_knee = raw_knee
            self.smooth_hip = raw_hip
        else:
            self.smooth_knee = round(0.75 * raw_knee + 0.25 * self.smooth_knee, 1)
            self.smooth_hip = round(0.75 * raw_hip + 0.25 * self.smooth_hip, 1)

        knee_ang = self.smooth_knee
        hip_ang = self.smooth_hip

        # 2. Check Knee Valgus
        valgus = False
        if left_knee and right_knee and left_ankle and right_ankle:
            valgus = check_frontal_valgus(left_knee, right_knee, left_ankle, right_ankle)
        else:
            valgus = check_knee_valgus(hip, knee, ankle, side="left", right_hip=right_hip)

        # 3. Biomechanical Thresholds:
        # Valid bottom depth: Hip < 90° and Knee between 70° and 95°
        is_bottom_depth = (70.0 <= knee_ang <= 95.0) and (hip_ang < 90.0) and not valgus
        is_standing_upright = (knee_ang >= 155.0) and (hip_ang >= 140.0)

        # 4. Anti-Ego-Lift Engine:
        # Flag rapid incomplete reps (> 2 shallow bounces under 3s without hitting full depth)
        if raw_knee < 140.0 or knee_ang < 145.0:
            self.in_shallow_dip = True

        if self.in_shallow_dip and is_standing_upright:
            if not self.rep_hit_awarded:
                self.sloppy_dips.append(now)
                self.sloppy_dips = [t for t in self.sloppy_dips if now - t <= 3.0]
                if len(self.sloppy_dips) >= 2:
                    self.is_stunned = True
                    self.stun_until = now + 3.0
                    self.weapon_overheated = True
                    self.sloppy_dips.clear()
                    self.in_shallow_dip = False
                    return self._build_payload(
                        status="penalty",
                        phase="STUNNED",
                        knee_angle=knee_ang,
                        hip_angle=hip_ang,
                        hold_dur=0.0,
                        damage=0,
                        damage_taken=25,
                        valgus=valgus,
                        overheated=True,
                        error="EGO LIFT DETECTED - STUNNED!",
                        message="EGO LIFT DETECTED - STUNNED! (-25 HP)",
                        event="EGO_LIFT"
                    )
            self.in_shallow_dip = False

        # 5. Form Duration & Quality Lock (Clinical Hold: >= 1.5s)
        status = "TRACKING"
        damage = 0
        message = "READY • SQUAT DOWN"
        event = "FRAME"

        if is_bottom_depth:
            self.phase = "HOLDING"
            if self.hold_start_time is None:
                self.hold_start_time = now
            self.hold_duration = now - self.hold_start_time

            if self.hold_duration >= 1.5:
                status = "hit"
                damage = 100
                message = "CRITICAL HIT!"
                event = "HOLD_HIT"
                self.rep_hit_awarded = True
            else:
                status = "HOLDING"
                message = f"HOLD SQUAT... ({self.hold_duration:.1f}s / 1.5s)"
        else:
            if now - (self.hold_start_time or 0) > 0.6:
                self.hold_start_time = None
                self.hold_duration = 0.0

            if is_standing_upright:
                if self.rep_hit_awarded:
                    self.rep_count += 1
                    self.rep_hit_awarded = False
                    status = "CRITICAL HIT!"
                    damage = 100
                    event = "REP_COMPLETE"
                    message = f"REP {self.rep_count} COMPLETE! (+100 DMG)"
                else:
                    status = "TRACKING"
                    message = "READY • SQUAT DOWN"
                    damage = 0
                self.phase = "STANDING"
            else:
                self.phase = "ASCENDING" if self.rep_hit_awarded else "DESCENDING"
                if valgus:
                    message = "KNEES CAVING INWARD - DRIVE KNEES OUT"
                elif self.rep_hit_awarded:
                    message = "RETURN TO STANDING"
                else:
                    message = f"SQUAT TO 90° ({int(knee_ang)}°)"

        return self._build_payload(
            status=status,
            phase=self.phase,
            knee_angle=knee_ang,
            hip_angle=hip_ang,
            hold_dur=self.hold_duration,
            damage=damage,
            damage_taken=0,
            valgus=valgus,
            overheated=False,
            error="KNEES CAVED IN" if valgus else "",
            message=message,
            event=event
        )

    def _build_payload(self, status: str, phase: str, knee_angle: float, hip_angle: float,
                       hold_dur: float, damage: int, damage_taken: int, valgus: bool,
                       overheated: bool, error: str, message: str, event: str) -> Dict[str, Any]:
        purity = 100.0
        if valgus:
            purity -= 35.0
        if overheated:
            purity -= 50.0
        purity = round(max(0.0, purity), 1)

        is_critical = status in ("hit", "CRITICAL HIT!") or damage >= 100

        return {
            "event": event,
            "status": status,
            "phase": phase,
            "knee_angle": knee_angle,
            "hip_angle": hip_angle,
            "rep_count": self.rep_count,
            "hold_time": round(hold_dur, 2),
            "hold_progress": round(min(1.0, hold_dur / 1.5), 2),
            "damage": damage,
            "damage_taken": damage_taken,
            "purity": purity,
            "knee_caved_in": valgus,
            "valgus": valgus,
            "weapon_overheated": overheated,
            "error": error,
            "message": message,
            "is_critical": is_critical,
        }

    def process_frame(self, *args, **kwargs) -> Dict[str, Any]:
        """Test suite and backward compatibility adapter."""
        if kwargs:
            now = kwargs.get("now", time.time())
            hip = kwargs.get("hip", [0.5, 0.5])
            knee = kwargs.get("knee", [0.5, 0.7])
            ankle = kwargs.get("ankle", [0.5, 0.9])
            shoulder = kwargs.get("shoulder", [0.5, 0.2])
            right_hip = kwargs.get("right_hip")
            return self.process(hip, knee, ankle, shoulder=shoulder, now=now, right_hip=right_hip)
        if len(args) >= 3:
            return self.process(args[0], args[1], args[2])
        return self.process([0.5, 0.5], [0.5, 0.7], [0.5, 0.9])


# ---------------------------------------------------------------------------
# WebSocket Endpoint: Stream Landmarks & Broadcast Live Status
# ---------------------------------------------------------------------------

@app.websocket("/ws/pose")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    engine = SquatEngine()
    try:
        while True:
            data = await websocket.receive_json()

            if data.get("action") == "reset":
                engine.reset()
                await websocket.send_json({
                    "event": "SESSION_RESET",
                    "status": "RESET_COMPLETE",
                    "rep_count": 0,
                    "knee_angle": 180.0,
                    "hip_angle": 180.0,
                    "message": "READY • SQUAT DOWN",
                    "damage": 0,
                    "damage_taken": 0,
                    "purity": 100.0,
                })
                continue

            # Extract left and right landmarks
            left = data.get("left", {})
            right = data.get("right", {})

            l_hip = left.get("hip") or data.get("hip")
            l_knee = left.get("knee") or data.get("knee")
            l_ankle = left.get("ankle") or data.get("ankle")
            l_shoulder = left.get("shoulder") or data.get("shoulder")

            r_hip = right.get("hip")
            r_knee = right.get("knee")
            r_ankle = right.get("ankle")

            # Prioritize dominant visible side
            active_hip = l_hip or r_hip
            active_knee = l_knee or r_knee
            active_ankle = l_ankle or r_ankle
            active_shoulder = l_shoulder or right.get("shoulder")

            if active_hip and active_knee and active_ankle:
                payload = engine.process(
                    hip=active_hip,
                    knee=active_knee,
                    ankle=active_ankle,
                    shoulder=active_shoulder,
                    now=time.time(),
                    right_hip=r_hip,
                    left_knee=l_knee,
                    right_knee=r_knee,
                    left_ankle=l_ankle,
                    right_ankle=r_ankle,
                )
                await websocket.send_json(payload)
            else:
                await websocket.send_json({
                    "event": "FRAME",
                    "status": "TRACKING",
                    "phase": "CALIBRATING",
                    "knee_angle": 180.0,
                    "hip_angle": 180.0,
                    "rep_count": engine.rep_count,
                    "message": "POSITION YOURSELF IN FRONT OF CAMERA",
                    "damage": 0,
                    "damage_taken": 0,
                    "purity": 100.0,
                })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ERROR] WebSocket: {e}")