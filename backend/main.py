import os
import io
import csv
import time
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

app = FastAPI(title="AthleteMind Phase 5 - 3D Multi-Exercise Biomechanics & Bio-Engine", version="5.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Biomechanical Kinematics Engine (True 3D Euclidean Vector Math)
# ---------------------------------------------------------------------------

def calculate_angle_3d(a: Any, b: Any, c: Any) -> float:
    """Calculates 3D Euclidean joint angle at vertex b using vector dot product:
    theta = arccos((u . v) / (||u|| ||v||))
    where u = a - b and v = c - b in 3D Euclidean space (x, y, z).
    """
    if a is None or b is None or c is None:
        return 180.0

    # Extract 3D or 2D coordinates
    a_arr = np.array(a[:3] if len(a) >= 3 else [a[0], a[1], 0.0], dtype=float)
    b_arr = np.array(b[:3] if len(b) >= 3 else [b[0], b[1], 0.0], dtype=float)
    c_arr = np.array(c[:3] if len(c) >= 3 else [c[0], c[1], 0.0], dtype=float)

    u = a_arr - b_arr
    v = c_arr - b_arr

    norm_u = float(np.linalg.norm(u))
    norm_v = float(np.linalg.norm(v))

    if norm_u < 1e-6 or norm_v < 1e-6:
        return 180.0

    cosine = float(np.dot(u, v) / (norm_u * norm_v))
    cosine = max(-1.0, min(1.0, cosine))
    angle = np.arccos(cosine) * 180.0 / np.pi
    return round(float(angle), 1)


calculate_angle = calculate_angle_3d


def detect_orientation(left_shoulder: Any, right_shoulder: Any, left_hip: Any, right_hip: Any) -> str:
    """Auto-Orientation Detection:
    Calculate horizontal shoulder width |x11 - x12| and hip width |x23 - x24|.
    If width > 0.15: user is facing camera (Front View / Coronal).
    If width <= 0.15: user is turned sideways (Side View / Sagittal).
    """
    sh_w = abs(float(left_shoulder[0]) - float(right_shoulder[0])) if (left_shoulder and right_shoulder) else 0.0
    hip_w = abs(float(left_hip[0]) - float(right_hip[0])) if (left_hip and right_hip) else 0.0
    width = max(sh_w, hip_w)
    return "front" if width > 0.15 else "side"


def check_knee_valgus(hip: Any, knee: Any, ankle: Any, side: str = "left", right_hip: Any = None) -> bool:
    """Knee valgus tracking: flags if knee collapses inward relative to hip & ankle."""
    if not (hip and knee and ankle):
        return False
    hx, hy = float(hip[0]), float(hip[1])
    kx, ky = float(knee[0]), float(knee[1])
    ax, ay = float(ankle[0]), float(ankle[1])

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
    """Frontal Valgus / Alignment Tracking:
    Compare |x_left_knee - x_right_knee| against |x_left_ankle - x_right_ankle|.
    If |x_left_knee - x_right_knee| < |x_left_ankle - x_right_ankle| * 0.75:
    Knees are caving inward.
    """
    if not (left_knee and right_knee and left_ankle and right_ankle):
        return False
    knee_sep = abs(float(left_knee[0]) - float(right_knee[0]))
    ankle_sep = abs(float(left_ankle[0]) - float(right_ankle[0]))
    return bool(ankle_sep >= 0.05 and knee_sep < (ankle_sep * 0.75))


# ---------------------------------------------------------------------------
# In-Memory Clinician Telemetry Store
# ---------------------------------------------------------------------------

class SessionTelemetryStore:
    """Maintains downsampled angle time-series, form deviation counts, and rep breakdown."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.session_start = time.time()
        self.last_sample_time = 0.0
        self.angle_trace: List[Dict[str, float]] = []  # 10Hz downsampled {timestamp, angle}
        self.rep_records: List[Dict[str, Any]] = []
        self.valgus_faults = 0
        self.depth_failures = 0
        self.ego_lifts = 0
        self.posture_faults = 0
        self.min_angle_achieved = 180.0
        self.active_exercise = "squats"

    def log_angle_sample(self, angle: float, now: float):
        if now - self.last_sample_time >= 0.1:  # 10Hz downsampling
            elapsed = round(now - self.session_start, 2)
            self.angle_trace.append({"timestamp": elapsed, "angle": round(angle, 1)})
            self.last_sample_time = now
            if angle < self.min_angle_achieved:
                self.min_angle_achieved = angle

    def record_valgus(self):
        self.valgus_faults += 1

    def record_depth_failure(self):
        self.depth_failures += 1

    def record_ego_lift(self):
        self.ego_lifts += 1

    def record_posture_fault(self):
        self.posture_faults += 1

    def record_rep(self, rep_idx: int, min_ang: float, hold_dur: float, had_fault: bool,
                   fault_name: str, now: float, exercise_name: str = "squats", target_hold: float = 1.5):
        verdict = "OPTIMAL"
        purity = 100.0
        faults: List[str] = []

        if had_fault:
            verdict = fault_name.upper() if fault_name else "FORM_FAULT"
            purity -= 35.0
            faults.append(fault_name.upper() if fault_name else "FORM_FAULT")

        if hold_dur < (target_hold - 0.1):
            verdict = "INCOMPLETE_HOLD"
            purity -= 20.0
            faults.append("FAST_HOLD")

        purity = round(max(0.0, purity), 1)

        self.rep_records.append({
            "rep_index": rep_idx,
            "exercise": exercise_name,
            "min_angle": round(min_ang, 1),
            "hold_duration": round(hold_dur, 2),
            "purity_score": purity,
            "quality_verdict": verdict,
            "faults": ", ".join(faults) if faults else "NONE",
            "timestamp": time.strftime("%H:%M:%S", time.localtime(now)),
        })

    def get_summary(self) -> Dict[str, Any]:
        total_reps = len(self.rep_records)
        mean_hold = (
            float(np.mean([r["hold_duration"] for r in self.rep_records]))
            if total_reps > 0 else 0.0
        )
        pure_reps = sum(1 for r in self.rep_records if r["quality_verdict"] == "OPTIMAL")
        purity_score = round((pure_reps / max(1, total_reps)) * 100.0, 1) if total_reps > 0 else 100.0

        return {
            "exercise": self.active_exercise,
            "total_reps": total_reps,
            "mean_bottom_hold_time": round(mean_hold, 2),
            "max_depth_angle": round(self.min_angle_achieved, 1) if self.min_angle_achieved < 180.0 else 90.0,
            "purity_score": purity_score,
            "biomechanical_fault_breakdown": {
                "valgus_faults": self.valgus_faults,
                "depth_failures": self.depth_failures,
                "ego_lifts": self.ego_lifts,
                "posture_faults": self.posture_faults,
            },
            "angle_trace": self.angle_trace[-200:],
            "reps": self.rep_records,
        }

    def generate_csv(self) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Rep_Index", "Exercise", "Min_Angle_Deg", "Hold_Duration_s", "Purity_Score_Pct", "Quality_Verdict", "Faults", "Timestamp"])

        for r in self.rep_records:
            writer.writerow([
                r["rep_index"],
                r.get("exercise", "squats"),
                r["min_angle"],
                r["hold_duration"],
                r["purity_score"],
                r["quality_verdict"],
                r["faults"],
                r["timestamp"],
            ])

        return output.getvalue()


global_telemetry = SessionTelemetryStore()


# ---------------------------------------------------------------------------
# Base Exercise Processor
# ---------------------------------------------------------------------------

class BaseExerciseEngine:
    """Base class for modular 3D kinematic exercise state machines."""

    def __init__(self, exercise_type: str, difficulty: str = "standard", telemetry: Optional[SessionTelemetryStore] = None):
        self.exercise_type = exercise_type
        self.difficulty = difficulty
        self.telemetry = telemetry or global_telemetry
        self.rep_count = 0
        self.phase = "STARTING"
        self.hold_start_time: Optional[float] = None
        self.hold_duration = 0.0
        self.rep_hit_awarded = False
        self.current_rep_min_angle = 180.0
        self.current_rep_had_fault = False
        self.current_rep_fault_name = ""

        # Stun & Ego-Lift
        self.is_stunned = False
        self.stun_until = 0.0
        self.weapon_overheated = False
        self.in_shallow_dip = False
        self.sloppy_dips: List[float] = []

        # Smoothing
        self.smooth_primary: Optional[float] = None
        self.smooth_secondary: Optional[float] = None

    def set_difficulty(self, difficulty: str):
        if difficulty in ("rehab", "standard", "athlete"):
            self.difficulty = difficulty

    def reset(self):
        self.rep_count = 0
        self.phase = "STARTING"
        self.hold_start_time = None
        self.hold_duration = 0.0
        self.rep_hit_awarded = False
        self.current_rep_min_angle = 180.0
        self.current_rep_had_fault = False
        self.current_rep_fault_name = ""
        self.is_stunned = False
        self.stun_until = 0.0
        self.weapon_overheated = False
        self.in_shallow_dip = False
        self.sloppy_dips.clear()
        self.smooth_primary = None
        self.smooth_secondary = None

    def _smooth_angles(self, raw_p: float, raw_s: float):
        if self.smooth_primary is None:
            self.smooth_primary = raw_p
            self.smooth_secondary = raw_s
        else:
            self.smooth_primary = round(0.75 * raw_p + 0.25 * self.smooth_primary, 1)
            self.smooth_secondary = round(0.75 * raw_s + 0.25 * self.smooth_secondary, 1)
        return self.smooth_primary, self.smooth_secondary

    def _build_base_payload(
        self,
        status: str,
        phase: str,
        primary_ang: float,
        primary_name: str,
        secondary_ang: float,
        secondary_name: str,
        hold_dur: float,
        target_hold: float,
        damage: int,
        damage_taken: int,
        has_fault: bool,
        fault_type: str,
        overheated: bool,
        message: str,
        audio_cue: str,
        event: str,
        active_joint_idx: int,
        fault_joint_indices: List[int],
        view_orientation: str = "side",
    ) -> Dict[str, Any]:
        purity = 100.0
        if has_fault:
            purity -= 35.0
        if overheated:
            purity -= 50.0
        purity = round(max(0.0, purity), 1)

        is_critical = status in ("hit", "CRITICAL HIT!") or damage >= 100

        return {
            "event": event,
            "exercise_type": self.exercise_type,
            "difficulty": self.difficulty,
            "view_orientation": view_orientation,
            "status": status,
            "phase": phase,
            "primary_angle": primary_ang,
            "primary_angle_name": primary_name,
            "secondary_angle": secondary_ang,
            "secondary_angle_name": secondary_name,
            # Backward compatibility aliases
            "knee_angle": primary_ang if self.exercise_type in ("squats", "rdl") else secondary_ang,
            "hip_angle": secondary_ang if self.exercise_type in ("squats", "pushups") else primary_ang,
            "rep_count": self.rep_count,
            "hold_time": round(hold_dur, 2),
            "hold_progress": round(min(1.0, hold_dur / target_hold), 2) if target_hold > 0 else 0.0,
            "hold_target": target_hold,
            "damage": damage,
            "damage_taken": damage_taken,
            "purity": purity,
            "has_fault": has_fault,
            "fault_type": fault_type,
            "valgus": bool(fault_type == "valgus"),
            "knee_caved_in": bool(fault_type == "valgus"),
            "warning": "KNEES CAVING INWARD - DRIVE KNEES OUT" if fault_type == "valgus" else "",
            "weapon_overheated": overheated,
            "error": fault_type.upper() if has_fault else "",
            "message": message,
            "audio_cue": audio_cue,
            "is_critical": is_critical,
            "active_joint_index": active_joint_idx,
            "fault_joint_indices": fault_joint_indices,
        }


# ---------------------------------------------------------------------------
# Exercise 1: Squat Processor (3D + Frontal / Sagittal Agnostic)
# ---------------------------------------------------------------------------

class SquatEngine(BaseExerciseEngine):
    """Squat Kinematics: 3D Hip(23) - Knee(25) - Ankle(27) + Medial Valgus & Frontal Depth."""

    def __init__(self, telemetry: Optional[SessionTelemetryStore] = None, difficulty: str = "standard"):
        super().__init__("squats", difficulty, telemetry)
        self.y_hip_standing: Optional[float] = None
        self.y_knee_standing: Optional[float] = None

    def reset(self):
        super().reset()
        self.y_hip_standing = None
        self.y_knee_standing = None

    def process(self, hip: Any, knee: Any, ankle: Any, shoulder: Any = None,
                now: Optional[float] = None, right_hip: Any = None,
                left_knee: Any = None, right_knee: Any = None,
                left_ankle: Any = None, right_ankle: Any = None,
                left_shoulder: Any = None, right_shoulder: Any = None,
                **kwargs) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        # Targets based on difficulty modifier
        if self.difficulty == "rehab":
            bottom_depth_max = 100.0
            bottom_depth_min = 60.0
            stand_min = 150.0
            target_hold = 1.0
        elif self.difficulty == "athlete":
            bottom_depth_max = 75.0
            bottom_depth_min = 55.0
            stand_min = 160.0
            target_hold = 2.0
        else:  # standard
            bottom_depth_max = 95.0
            bottom_depth_min = 70.0
            stand_min = 155.0
            target_hold = 1.5

        # Detect Front vs Side orientation
        view_mode = detect_orientation(left_shoulder, right_shoulder, hip, right_hip)

        # Handle Stun
        if self.is_stunned:
            if now >= self.stun_until:
                self.is_stunned = False
                self.weapon_overheated = False
                self.phase = "STANDING"
            else:
                return self._build_base_payload(
                    status="penalty",
                    phase="STUNNED",
                    primary_ang=self.smooth_primary or 180.0,
                    primary_name="Knee",
                    secondary_ang=self.smooth_secondary or 90.0,
                    secondary_name="Hip",
                    hold_dur=0.0,
                    target_hold=target_hold,
                    damage=0,
                    damage_taken=0,
                    has_fault=True,
                    fault_type="ego_lift",
                    overheated=True,
                    message="WEAPON OVERHEATED - STUNNED!",
                    audio_cue="Slow down, control your tempo",
                    event="FRAME",
                    active_joint_idx=25,
                    fault_joint_indices=[23, 25, 27],
                    view_orientation=view_mode,
                )

        # 3D Vector Joint Angle
        raw_knee = calculate_angle_3d(hip, knee, ankle)
        raw_hip = calculate_angle_3d(shoulder, hip, knee) if shoulder else calculate_angle_3d([float(hip[0]), float(hip[1]) - 0.4, 0.0], hip, knee)
        knee_ang, hip_ang = self._smooth_angles(raw_knee, raw_hip)

        self.telemetry.log_angle_sample(knee_ang, now)
        if knee_ang < self.current_rep_min_angle:
            self.current_rep_min_angle = knee_ang

        # Frontal Valgus Tracking
        valgus = False
        if left_knee and right_knee and left_ankle and right_ankle:
            valgus = check_frontal_valgus(left_knee, right_knee, left_ankle, right_ankle)
        else:
            valgus = check_knee_valgus(hip, knee, ankle, side="left", right_hip=right_hip)

        if valgus:
            self.current_rep_had_fault = True
            self.current_rep_fault_name = "knee_valgus"
            self.telemetry.record_valgus()

        # In Front View: knee flex projects along z-axis. Combine 3D angle with vertical hip drop level
        hip_y = float(hip[1])
        knee_y = float(knee[1])

        # Standing posture check & reference tracking
        is_standing = (knee_ang >= stand_min) and (hip_ang >= 140.0)
        if is_standing or self.y_hip_standing is None:
            self.y_hip_standing = hip_y
            self.y_knee_standing = knee_y

        # Depth Ratio = (y_hip - y_knee_standing) / (y_hip_standing - y_knee_standing)
        depth_ratio = 0.0
        if self.y_hip_standing is not None and self.y_knee_standing is not None:
            denom = self.y_hip_standing - self.y_knee_standing
            if abs(denom) > 1e-4:
                depth_ratio = abs((hip_y - self.y_knee_standing) / denom)

        # When y_hip drops to the horizontal level of y_knee, trigger squat bottom hold
        hip_at_knee_level = bool(hip_y >= knee_y - 0.05) or (depth_ratio <= 0.25 and depth_ratio > 0)

        if view_mode == "front":
            is_bottom_depth = (knee_ang <= bottom_depth_max or hip_at_knee_level) and not valgus
        else:
            is_bottom_depth = (bottom_depth_min <= knee_ang <= bottom_depth_max) and (hip_ang < 100.0) and not valgus

        # Anti Ego-Lift
        if raw_knee < 140.0 or knee_ang < 145.0:
            self.in_shallow_dip = True

        if self.in_shallow_dip and is_standing:
            if not self.rep_hit_awarded:
                self.telemetry.record_depth_failure()
                self.sloppy_dips.append(now)
                self.sloppy_dips = [t for t in self.sloppy_dips if now - t <= 3.0]
                if len(self.sloppy_dips) >= 2:
                    self.is_stunned = True
                    self.stun_until = now + 3.0
                    self.weapon_overheated = True
                    self.telemetry.record_ego_lift()
                    self.sloppy_dips.clear()
                    self.in_shallow_dip = False
                    return self._build_base_payload(
                        status="penalty",
                        phase="STUNNED",
                        primary_ang=knee_ang,
                        primary_name="Knee",
                        secondary_ang=hip_ang,
                        secondary_name="Hip",
                        hold_dur=0.0,
                        target_hold=target_hold,
                        damage=0,
                        damage_taken=25,
                        has_fault=True,
                        fault_type="ego_lift",
                        overheated=True,
                        message="EGO LIFT DETECTED - STUNNED! (-25 HP)",
                        audio_cue="Slow down, control your tempo",
                        event="EGO_LIFT",
                        active_joint_idx=25,
                        fault_joint_indices=[23, 25, 27],
                        view_orientation=view_mode,
                    )
            self.in_shallow_dip = False

        status = "TRACKING"
        damage = 0
        message = f"SQUAT DOWN ({view_mode.upper()} VIEW • TARGET < {int(bottom_depth_max)}°)"
        audio_cue = ""
        event = "FRAME"

        if is_bottom_depth:
            self.phase = "HOLDING"
            if self.hold_start_time is None:
                self.hold_start_time = now
            self.hold_duration = now - self.hold_start_time

            if self.hold_duration >= target_hold:
                status = "hit"
                damage = 100
                message = "CRITICAL HIT! STAND UP"
                audio_cue = "Critical hit! Stand up"
                event = "HOLD_HIT"
                self.rep_hit_awarded = True
            else:
                status = "HOLDING"
                message = f"HOLD SQUAT... ({self.hold_duration:.1f}s / {target_hold}s)"
        else:
            if now - (self.hold_start_time or 0) > 0.6:
                self.hold_start_time = None
                self.hold_duration = 0.0

            if is_standing:
                if self.rep_hit_awarded:
                    self.rep_count += 1
                    status = "CRITICAL HIT!"
                    damage = 100
                    event = "REP_COMPLETE"
                    message = f"REP {self.rep_count} COMPLETE! (+100 DMG)"
                    audio_cue = f"Rep {self.rep_count} complete!"

                    self.telemetry.record_rep(
                        rep_idx=self.rep_count,
                        min_ang=self.current_rep_min_angle,
                        hold_dur=max(target_hold, self.hold_duration),
                        had_fault=self.current_rep_had_fault,
                        fault_name=self.current_rep_fault_name,
                        now=now,
                        exercise_name="squats",
                        target_hold=target_hold,
                    )

                    self.rep_hit_awarded = False
                    self.current_rep_min_angle = 180.0
                    self.current_rep_had_fault = False
                    self.current_rep_fault_name = ""
                else:
                    status = "TRACKING"
                    message = "READY • SQUAT DOWN"
                    damage = 0
                self.phase = "STANDING"
            else:
                self.phase = "ASCENDING" if self.rep_hit_awarded else "DESCENDING"
                if valgus:
                    message = "KNEES CAVING INWARD - DRIVE KNEES OUT"
                    audio_cue = "Push your knees out"
                elif self.rep_hit_awarded:
                    message = "RETURN TO STANDING"
                else:
                    message = f"SQUAT TO {int(bottom_depth_max)}° ({int(knee_ang)}°)"

        fault_type = "valgus" if valgus else ""
        fault_joints = [25, 26] if valgus else []

        return self._build_base_payload(
            status=status,
            phase=self.phase,
            primary_ang=knee_ang,
            primary_name="Knee",
            secondary_ang=hip_ang,
            secondary_name="Hip",
            hold_dur=self.hold_duration,
            target_hold=target_hold,
            damage=damage,
            damage_taken=0,
            has_fault=valgus,
            fault_type=fault_type,
            overheated=False,
            message=message,
            audio_cue=audio_cue,
            event=event,
            active_joint_idx=25,
            fault_joint_indices=fault_joints,
            view_orientation=view_mode,
        )

    def process_frame(self, *args, **kwargs) -> Dict[str, Any]:
        """Test suite and backward compatibility adapter."""
        if kwargs:
            now = kwargs.get("now", time.time())
            hip = kwargs.get("hip", [0.5, 0.5, 0.0])
            knee = kwargs.get("knee", [0.5, 0.7, 0.0])
            ankle = kwargs.get("ankle", [0.5, 0.9, 0.0])
            shoulder = kwargs.get("shoulder", [0.5, 0.2, 0.0])
            right_hip = kwargs.get("right_hip")
            return self.process(hip, knee, ankle, shoulder=shoulder, now=now, right_hip=right_hip)
        if len(args) >= 3:
            return self.process(args[0], args[1], args[2])
        return self.process([0.5, 0.5, 0.0], [0.5, 0.7, 0.0], [0.5, 0.9, 0.0])


# ---------------------------------------------------------------------------
# Exercise 2: Push-up Processor (Upper Body Push & Core Plank)
# ---------------------------------------------------------------------------

class PushUpEngine(BaseExerciseEngine):
    """Push-ups: Shoulder(11) - Elbow(13) - Wrist(15) + Plank Trunk(11-23-27)."""

    def __init__(self, telemetry: Optional[SessionTelemetryStore] = None, difficulty: str = "standard"):
        super().__init__("pushups", difficulty, telemetry)

    def process(self, shoulder: Any, elbow: Any, wrist: Any, hip: Any = None,
                ankle: Any = None, now: Optional[float] = None, **kwargs) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        if self.difficulty == "rehab":
            bottom_elbow_max = 105.0
            lockout_min = 155.0
            target_hold = 1.0
        elif self.difficulty == "athlete":
            bottom_elbow_max = 80.0
            lockout_min = 170.0
            target_hold = 2.0
        else:  # standard
            bottom_elbow_max = 90.0
            lockout_min = 165.0
            target_hold = 1.5

        if self.is_stunned:
            if now >= self.stun_until:
                self.is_stunned = False
                self.weapon_overheated = False
                self.phase = "LOCKOUT"
            else:
                return self._build_base_payload(
                    status="penalty",
                    phase="STUNNED",
                    primary_ang=self.smooth_primary or 170.0,
                    primary_name="Elbow",
                    secondary_ang=self.smooth_secondary or 180.0,
                    secondary_name="Plank Core",
                    hold_dur=0.0,
                    target_hold=target_hold,
                    damage=0,
                    damage_taken=0,
                    has_fault=True,
                    fault_type="lumbar_sag",
                    overheated=True,
                    message="LUMBAR SAG DETECTED - STUNNED!",
                    audio_cue="Squeeze your core, don't sag your hips",
                    event="FRAME",
                    active_joint_idx=13,
                    fault_joint_indices=[11, 23, 27],
                )

        raw_elbow = calculate_angle_3d(shoulder, elbow, wrist)
        raw_plank = calculate_angle_3d(shoulder, hip, ankle) if (hip and ankle) else 180.0
        elbow_ang, plank_ang = self._smooth_angles(raw_elbow, raw_plank)

        self.telemetry.log_angle_sample(elbow_ang, now)
        if elbow_ang < self.current_rep_min_angle:
            self.current_rep_min_angle = elbow_ang

        # Plank integrity check
        lumbar_sag = abs(180.0 - plank_ang) > 20.0
        if lumbar_sag:
            self.current_rep_had_fault = True
            self.current_rep_fault_name = "lumbar_sag"
            self.telemetry.record_posture_fault()

        is_bottom = (elbow_ang <= bottom_elbow_max) and not lumbar_sag
        is_lockout = (elbow_ang >= lockout_min) and not lumbar_sag

        # Anti-Ego Lift
        if raw_elbow < 135.0 or elbow_ang < 140.0:
            self.in_shallow_dip = True

        if self.in_shallow_dip and is_lockout:
            if not self.rep_hit_awarded:
                self.telemetry.record_depth_failure()
                self.sloppy_dips.append(now)
                self.sloppy_dips = [t for t in self.sloppy_dips if now - t <= 3.0]
                if len(self.sloppy_dips) >= 2:
                    self.is_stunned = True
                    self.stun_until = now + 3.0
                    self.weapon_overheated = True
                    self.telemetry.record_ego_lift()
                    self.sloppy_dips.clear()
                    self.in_shallow_dip = False
                    return self._build_base_payload(
                        status="penalty",
                        phase="STUNNED",
                        primary_ang=elbow_ang,
                        primary_name="Elbow",
                        secondary_ang=plank_ang,
                        secondary_name="Plank Core",
                        hold_dur=0.0,
                        target_hold=target_hold,
                        damage=0,
                        damage_taken=25,
                        has_fault=True,
                        fault_type="ego_lift",
                        overheated=True,
                        message="SHALLOW PUSH-UPS DETECTED - STUNNED! (-25 HP)",
                        audio_cue="Chest to floor, slow down",
                        event="EGO_LIFT",
                        active_joint_idx=13,
                        fault_joint_indices=[11, 13, 15],
                    )
            self.in_shallow_dip = False

        status = "TRACKING"
        damage = 0
        message = f"LOWER CHEST (TARGET <= {int(bottom_elbow_max)}°)"
        audio_cue = ""
        event = "FRAME"

        if is_bottom:
            self.phase = "HOLDING"
            if self.hold_start_time is None:
                self.hold_start_time = now
            self.hold_duration = now - self.hold_start_time

            if self.hold_duration >= target_hold:
                status = "hit"
                damage = 100
                message = "CRITICAL HIT! PUSH TO LOCKOUT"
                audio_cue = "Critical hit! Push up to lockout"
                event = "HOLD_HIT"
                self.rep_hit_awarded = True
            else:
                status = "HOLDING"
                message = f"HOLD BOTTOM... ({self.hold_duration:.1f}s / {target_hold}s)"
        else:
            if now - (self.hold_start_time or 0) > 0.6:
                self.hold_start_time = None
                self.hold_duration = 0.0

            if is_lockout:
                if self.rep_hit_awarded:
                    self.rep_count += 1
                    status = "CRITICAL HIT!"
                    damage = 100
                    event = "REP_COMPLETE"
                    message = f"PUSH-UP {self.rep_count} COMPLETE! (+100 DMG)"
                    audio_cue = f"Push-up {self.rep_count} complete!"

                    self.telemetry.record_rep(
                        rep_idx=self.rep_count,
                        min_ang=self.current_rep_min_angle,
                        hold_dur=max(target_hold, self.hold_duration),
                        had_fault=self.current_rep_had_fault,
                        fault_name=self.current_rep_fault_name,
                        now=now,
                        exercise_name="pushups",
                        target_hold=target_hold,
                    )

                    self.rep_hit_awarded = False
                    self.current_rep_min_angle = 180.0
                    self.current_rep_had_fault = False
                    self.current_rep_fault_name = ""
                else:
                    status = "TRACKING"
                    message = "READY • LOWER CHEST"
                    damage = 0
                self.phase = "LOCKOUT"
            else:
                self.phase = "ASCENDING" if self.rep_hit_awarded else "DESCENDING"
                if lumbar_sag:
                    message = "LUMBAR SAG DETECTED - SQUEEZE YOUR CORE"
                    audio_cue = "Squeeze your core"
                elif self.rep_hit_awarded:
                    message = "PUSH ALL THE WAY UP TO LOCKOUT"
                else:
                    message = f"LOWER TO {int(bottom_elbow_max)}° ({int(elbow_ang)}°)"

        fault_type = "lumbar_sag" if lumbar_sag else ""
        fault_joints = [11, 23, 27] if lumbar_sag else []

        return self._build_base_payload(
            status=status,
            phase=self.phase,
            primary_ang=elbow_ang,
            primary_name="Elbow",
            secondary_ang=plank_ang,
            secondary_name="Plank Core",
            hold_dur=self.hold_duration,
            target_hold=target_hold,
            damage=damage,
            damage_taken=0,
            has_fault=lumbar_sag,
            fault_type=fault_type,
            overheated=False,
            message=message,
            audio_cue=audio_cue,
            event=event,
            active_joint_idx=13,
            fault_joint_indices=fault_joints,
        )


# ---------------------------------------------------------------------------
# Exercise 3: Overhead Press Processor (Scapular Plane / Vertical Push)
# ---------------------------------------------------------------------------

class OverheadPressEngine(BaseExerciseEngine):
    """Overhead Press: Hip(23) - Shoulder(11) - Elbow(13) + Lumbar Arch(11-23-25)."""

    def __init__(self, telemetry: Optional[SessionTelemetryStore] = None, difficulty: str = "standard"):
        super().__init__("overhead_press", difficulty, telemetry)

    def process(self, hip: Any, shoulder: Any, elbow: Any, knee: Any = None,
                wrist: Any = None, now: Optional[float] = None, **kwargs) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        if self.difficulty == "rehab":
            top_lockout_min = 150.0
            rack_position_max = 90.0
            target_hold = 1.0
        elif self.difficulty == "athlete":
            top_lockout_min = 170.0
            rack_position_max = 75.0
            target_hold = 2.0
        else:  # standard
            top_lockout_min = 165.0
            rack_position_max = 80.0
            target_hold = 1.5

        if self.is_stunned:
            if now >= self.stun_until:
                self.is_stunned = False
                self.weapon_overheated = False
                self.phase = "RACK"
            else:
                return self._build_base_payload(
                    status="penalty",
                    phase="STUNNED",
                    primary_ang=self.smooth_primary or 80.0,
                    primary_name="Shoulder",
                    secondary_ang=self.smooth_secondary or 180.0,
                    secondary_name="Lumbar Spine",
                    hold_dur=0.0,
                    target_hold=target_hold,
                    damage=0,
                    damage_taken=0,
                    has_fault=True,
                    fault_type="lumbar_arch",
                    overheated=True,
                    message="LUMBAR ARCH COMPENSATION DETECTED!",
                    audio_cue="Don't arch your back, brace your core",
                    event="FRAME",
                    active_joint_idx=11,
                    fault_joint_indices=[11, 23, 25],
                )

        raw_shoulder = calculate_angle_3d(hip, shoulder, elbow)
        raw_spine = calculate_angle_3d(shoulder, hip, knee) if knee else 180.0
        shoulder_ang, spine_ang = self._smooth_angles(raw_shoulder, raw_spine)

        self.telemetry.log_angle_sample(shoulder_ang, now)
        if shoulder_ang > self.current_rep_min_angle or self.current_rep_min_angle == 180.0:
            self.current_rep_min_angle = shoulder_ang

        lumbar_arch = abs(180.0 - spine_ang) > 20.0
        if lumbar_arch:
            self.current_rep_had_fault = True
            self.current_rep_fault_name = "lumbar_arch"
            self.telemetry.record_posture_fault()

        is_top_lockout = (shoulder_ang >= top_lockout_min) and not lumbar_arch
        is_rack = (shoulder_ang <= rack_position_max) and not lumbar_arch

        # Anti-Ego Lift
        if raw_shoulder > 115.0 or shoulder_ang > 120.0:
            self.in_shallow_dip = True

        if self.in_shallow_dip and is_rack:
            if not self.rep_hit_awarded:
                self.telemetry.record_depth_failure()
                self.sloppy_dips.append(now)
                self.sloppy_dips = [t for t in self.sloppy_dips if now - t <= 3.0]
                if len(self.sloppy_dips) >= 2:
                    self.is_stunned = True
                    self.stun_until = now + 3.0
                    self.weapon_overheated = True
                    self.telemetry.record_ego_lift()
                    self.sloppy_dips.clear()
                    self.in_shallow_dip = False
                    return self._build_base_payload(
                        status="penalty",
                        phase="STUNNED",
                        primary_ang=shoulder_ang,
                        primary_name="Shoulder",
                        secondary_ang=spine_ang,
                        secondary_name="Lumbar Spine",
                        hold_dur=0.0,
                        target_hold=target_hold,
                        damage=0,
                        damage_taken=25,
                        has_fault=True,
                        fault_type="ego_lift",
                        overheated=True,
                        message="INCOMPLETE PRESS DETECTED - STUNNED! (-25 HP)",
                        audio_cue="Lock out overhead, slow down",
                        event="EGO_LIFT",
                        active_joint_idx=11,
                        fault_joint_indices=[23, 11, 13],
                    )
            self.in_shallow_dip = False

        status = "TRACKING"
        damage = 0
        message = f"PRESS OVERHEAD (TARGET >= {int(top_lockout_min)}°)"
        audio_cue = ""
        event = "FRAME"

        if is_top_lockout:
            self.phase = "HOLDING"
            if self.hold_start_time is None:
                self.hold_start_time = now
            self.hold_duration = now - self.hold_start_time

            if self.hold_duration >= target_hold:
                status = "hit"
                damage = 100
                message = "CRITICAL HIT! LOWER TO RACK"
                audio_cue = "Critical hit! Lower to shoulders"
                event = "HOLD_HIT"
                self.rep_hit_awarded = True
            else:
                status = "HOLDING"
                message = f"HOLD OVERHEAD... ({self.hold_duration:.1f}s / {target_hold}s)"
        else:
            if now - (self.hold_start_time or 0) > 0.6:
                self.hold_start_time = None
                self.hold_duration = 0.0

            if is_rack:
                if self.rep_hit_awarded:
                    self.rep_count += 1
                    status = "CRITICAL HIT!"
                    damage = 100
                    event = "REP_COMPLETE"
                    message = f"PRESS {self.rep_count} COMPLETE! (+100 DMG)"
                    audio_cue = f"Overhead press {self.rep_count} complete!"

                    self.telemetry.record_rep(
                        rep_idx=self.rep_count,
                        min_ang=self.current_rep_min_angle,
                        hold_dur=max(target_hold, self.hold_duration),
                        had_fault=self.current_rep_had_fault,
                        fault_name=self.current_rep_fault_name,
                        now=now,
                        exercise_name="overhead_press",
                        target_hold=target_hold,
                    )

                    self.rep_hit_awarded = False
                    self.current_rep_min_angle = 180.0
                    self.current_rep_had_fault = False
                    self.current_rep_fault_name = ""
                else:
                    status = "TRACKING"
                    message = "READY • PRESS OVERHEAD"
                    damage = 0
                self.phase = "RACK"
            else:
                self.phase = "ASCENDING" if not self.rep_hit_awarded else "DESCENDING"
                if lumbar_arch:
                    message = "DON'T ARCH YOUR BACK - SQUEEZE CORE"
                    audio_cue = "Don't arch your back"
                elif self.rep_hit_awarded:
                    message = "LOWER WEIGHT TO SHOULDERS"
                else:
                    message = f"DRIVE TO {int(top_lockout_min)}° ({int(shoulder_ang)}°)"

        fault_type = "lumbar_arch" if lumbar_arch else ""
        fault_joints = [11, 23, 25] if lumbar_arch else []

        return self._build_base_payload(
            status=status,
            phase=self.phase,
            primary_ang=shoulder_ang,
            primary_name="Shoulder",
            secondary_ang=spine_ang,
            secondary_name="Lumbar Spine",
            hold_dur=self.hold_duration,
            target_hold=target_hold,
            damage=damage,
            damage_taken=0,
            has_fault=lumbar_arch,
            fault_type=fault_type,
            overheated=False,
            message=message,
            audio_cue=audio_cue,
            event=event,
            active_joint_idx=11,
            fault_joint_indices=fault_joints,
        )


# ---------------------------------------------------------------------------
# Exercise 4: Romanian Deadlift (RDL) / Hip Hinge Processor
# ---------------------------------------------------------------------------

class RDLEngine(BaseExerciseEngine):
    """Romanian Deadlifts: Shoulder(11) - Hip(23) - Knee(25) + Knee Flexion(23-25-27)."""

    def __init__(self, telemetry: Optional[SessionTelemetryStore] = None, difficulty: str = "standard"):
        super().__init__("rdl", difficulty, telemetry)

    def process(self, shoulder: Any, hip: Any, knee: Any, ankle: Any = None,
                now: Optional[float] = None, **kwargs) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        if self.difficulty == "rehab":
            hinge_flex_max = 95.0
            hinge_flex_min = 60.0
            stand_min = 155.0
            knee_min = 140.0
            target_hold = 1.0
        elif self.difficulty == "athlete":
            hinge_flex_max = 75.0
            hinge_flex_min = 55.0
            stand_min = 165.0
            knee_min = 140.0
            target_hold = 2.0
        else:  # standard
            hinge_flex_max = 90.0
            hinge_flex_min = 70.0
            stand_min = 160.0
            knee_min = 135.0
            target_hold = 1.5

        if self.is_stunned:
            if now >= self.stun_until:
                self.is_stunned = False
                self.weapon_overheated = False
                self.phase = "STANDING"
            else:
                return self._build_base_payload(
                    status="penalty",
                    phase="STUNNED",
                    primary_ang=self.smooth_primary or 180.0,
                    primary_name="Hip Hinge",
                    secondary_ang=self.smooth_secondary or 160.0,
                    secondary_name="Knee Bend",
                    hold_dur=0.0,
                    target_hold=target_hold,
                    damage=0,
                    damage_taken=0,
                    has_fault=True,
                    fault_type="squatting_the_hinge",
                    overheated=True,
                    message="SQUATTING THE HINGE DETECTED!",
                    audio_cue="Don't squat the hinge, push hips back",
                    event="FRAME",
                    active_joint_idx=23,
                    fault_joint_indices=[23, 25, 27],
                )

        raw_hip = calculate_angle_3d(shoulder, hip, knee)
        raw_knee = calculate_angle_3d(hip, knee, ankle) if ankle else 165.0
        hip_ang, knee_ang = self._smooth_angles(raw_hip, raw_knee)

        self.telemetry.log_angle_sample(hip_ang, now)
        if hip_ang < self.current_rep_min_angle:
            self.current_rep_min_angle = hip_ang

        # Check if squatting the hinge
        squatting_hinge = (hip_ang < 120.0) and (knee_ang < knee_min)
        if squatting_hinge:
            self.current_rep_had_fault = True
            self.current_rep_fault_name = "squatting_the_hinge"
            self.telemetry.record_posture_fault()

        is_hinge_depth = (hinge_flex_min <= hip_ang <= hinge_flex_max) and not squatting_hinge
        is_standing = (hip_ang >= stand_min) and not squatting_hinge

        # Anti-Ego Lift
        if raw_hip < 135.0 or hip_ang < 140.0:
            self.in_shallow_dip = True

        if self.in_shallow_dip and is_standing:
            if not self.rep_hit_awarded:
                self.telemetry.record_depth_failure()
                self.sloppy_dips.append(now)
                self.sloppy_dips = [t for t in self.sloppy_dips if now - t <= 3.0]
                if len(self.sloppy_dips) >= 2:
                    self.is_stunned = True
                    self.stun_until = now + 3.0
                    self.weapon_overheated = True
                    self.telemetry.record_ego_lift()
                    self.sloppy_dips.clear()
                    self.in_shallow_dip = False
                    return self._build_base_payload(
                        status="penalty",
                        phase="STUNNED",
                        primary_ang=hip_ang,
                        primary_name="Hip Hinge",
                        secondary_ang=knee_ang,
                        secondary_name="Knee Bend",
                        hold_dur=0.0,
                        target_hold=target_hold,
                        damage=0,
                        damage_taken=25,
                        has_fault=True,
                        fault_type="ego_lift",
                        overheated=True,
                        message="INCOMPLETE HINGE DETECTED - STUNNED! (-25 HP)",
                        audio_cue="Hinge deeper at your hips, slow down",
                        event="EGO_LIFT",
                        active_joint_idx=23,
                        fault_joint_indices=[11, 23, 25],
                    )
            self.in_shallow_dip = False

        status = "TRACKING"
        damage = 0
        message = f"HINGE AT HIPS (TARGET <= {int(hinge_flex_max)}°)"
        audio_cue = ""
        event = "FRAME"

        if is_hinge_depth:
            self.phase = "HOLDING"
            if self.hold_start_time is None:
                self.hold_start_time = now
            self.hold_duration = now - self.hold_start_time

            if self.hold_duration >= target_hold:
                status = "hit"
                damage = 100
                message = "CRITICAL HIT! STAND & SQUEEZE GLUTES"
                audio_cue = "Critical hit! Stand up and squeeze glutes"
                event = "HOLD_HIT"
                self.rep_hit_awarded = True
            else:
                status = "HOLDING"
                message = f"HOLD HINGE... ({self.hold_duration:.1f}s / {target_hold}s)"
        else:
            if now - (self.hold_start_time or 0) > 0.6:
                self.hold_start_time = None
                self.hold_duration = 0.0

            if is_standing:
                if self.rep_hit_awarded:
                    self.rep_count += 1
                    status = "CRITICAL HIT!"
                    damage = 100
                    event = "REP_COMPLETE"
                    message = f"RDL {self.rep_count} COMPLETE! (+100 DMG)"
                    audio_cue = f"RDL rep {self.rep_count} complete!"

                    self.telemetry.record_rep(
                        rep_idx=self.rep_count,
                        min_ang=self.current_rep_min_angle,
                        hold_dur=max(target_hold, self.hold_duration),
                        had_fault=self.current_rep_had_fault,
                        fault_name=self.current_rep_fault_name,
                        now=now,
                        exercise_name="rdl",
                        target_hold=target_hold,
                    )

                    self.rep_hit_awarded = False
                    self.current_rep_min_angle = 180.0
                    self.current_rep_had_fault = False
                    self.current_rep_fault_name = ""
                else:
                    status = "TRACKING"
                    message = "READY • HINGE AT HIPS"
                    damage = 0
                self.phase = "STANDING"
            else:
                self.phase = "ASCENDING" if self.rep_hit_awarded else "DESCENDING"
                if squatting_hinge:
                    message = "DON'T SQUAT THE HINGE - PUSH HIPS BACK"
                    audio_cue = "Don't squat the hinge, push hips back"
                elif self.rep_hit_awarded:
                    message = "RETURN TO STANDING"
                else:
                    message = f"HINGE TO {int(hinge_flex_max)}° ({int(hip_ang)}°)"

        fault_type = "squatting_the_hinge" if squatting_hinge else ""
        fault_joints = [23, 25, 27] if squatting_hinge else []

        return self._build_base_payload(
            status=status,
            phase=self.phase,
            primary_ang=hip_ang,
            primary_name="Hip Hinge",
            secondary_ang=knee_ang,
            secondary_name="Knee Bend",
            hold_dur=self.hold_duration,
            target_hold=target_hold,
            damage=damage,
            damage_taken=0,
            has_fault=squatting_hinge,
            fault_type=fault_type,
            overheated=False,
            message=message,
            audio_cue=audio_cue,
            event=event,
            active_joint_idx=23,
            fault_joint_indices=fault_joints,
        )


def create_exercise_engine(exercise_type: str, difficulty: str = "standard", telemetry: Optional[SessionTelemetryStore] = None) -> BaseExerciseEngine:
    """Factory function for instantiating exercise processors."""
    ex = exercise_type.lower()
    if ex in ("pushups", "pushup", "push_ups", "push_up"):
        return PushUpEngine(telemetry, difficulty)
    elif ex in ("overhead_press", "overhead", "ohp", "shoulder_press"):
        return OverheadPressEngine(telemetry, difficulty)
    elif ex in ("rdl", "romanian_deadlift", "hip_hinge"):
        return RDLEngine(telemetry, difficulty)
    return SquatEngine(telemetry, difficulty)


# ---------------------------------------------------------------------------
# Phase 5 REST API Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {"status": "ok", "service": "AthleteMind Phase 5 Multi-Exercise Bio-Engine", "version": "5.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/session-summary")
def get_session_summary():
    """Returns aggregated statistics for clinician debrief."""
    return global_telemetry.get_summary()


@app.get("/api/export-report")
@app.post("/api/export-report")
def export_telemetry_csv():
    """Generates downloadable CSV medical export."""
    csv_content = global_telemetry.generate_csv()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=athletemind_clinical_telemetry.csv"},
    )


@app.post("/api/session-reset")
def reset_session_telemetry():
    """Clears all in-memory telemetry for a fresh clinical workout session."""
    global_telemetry.reset()
    return {"status": "cleared", "total_reps": 0}


# ---------------------------------------------------------------------------
# WebSocket Endpoint: Stream Landmarks & Broadcast Live Status
# ---------------------------------------------------------------------------

@app.websocket("/ws/pose")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    current_exercise = "squats"
    current_difficulty = "standard"
    engine: BaseExerciseEngine = SquatEngine(global_telemetry, difficulty=current_difficulty)

    try:
        while True:
            data = await websocket.receive_json()

            # Handle reset action
            if data.get("action") == "reset":
                engine.reset()
                global_telemetry.reset()
                await websocket.send_json({
                    "event": "SESSION_RESET",
                    "status": "RESET_COMPLETE",
                    "rep_count": 0,
                    "knee_angle": 180.0,
                    "hip_angle": 180.0,
                    "primary_angle": 180.0,
                    "secondary_angle": 180.0,
                    "message": "READY • COMMENCE EXERCISE",
                    "damage": 0,
                    "damage_taken": 0,
                    "purity": 100.0,
                    "audio_cue": "Session reset",
                })
                continue

            # Handle switching exercise or difficulty mode
            if data.get("action") == "set_exercise":
                new_ex = data.get("exercise_type", current_exercise)
                new_diff = data.get("difficulty", current_difficulty)
                current_exercise = new_ex
                current_difficulty = new_diff
                global_telemetry.active_exercise = current_exercise
                engine = create_exercise_engine(current_exercise, current_difficulty, global_telemetry)
                await websocket.send_json({
                    "event": "EXERCISE_CHANGED",
                    "exercise_type": current_exercise,
                    "difficulty": current_difficulty,
                    "status": "TRACKING",
                    "message": f"SWITCHED TO {current_exercise.upper()} ({current_difficulty.upper()})",
                    "audio_cue": f"Ready for {current_exercise}",
                })
                continue

            # Check if dynamic exercise/difficulty sent inline with coordinates
            inline_ex = data.get("exercise_type")
            inline_diff = data.get("difficulty")
            if inline_ex and inline_ex != current_exercise:
                current_exercise = inline_ex
                global_telemetry.active_exercise = current_exercise
                engine = create_exercise_engine(current_exercise, current_difficulty, global_telemetry)
            if inline_diff and inline_diff != current_difficulty:
                current_difficulty = inline_diff
                engine.set_difficulty(current_difficulty)

            left = data.get("left", {})
            right = data.get("right", {})

            l_sh = left.get("shoulder") or data.get("shoulder")
            r_sh = right.get("shoulder")
            l_el = left.get("elbow") or data.get("elbow")
            r_el = right.get("elbow")
            l_wr = left.get("wrist") or data.get("wrist")
            r_wr = right.get("wrist")
            l_hip = left.get("hip") or data.get("hip")
            r_hip = right.get("hip")
            l_kn = left.get("knee") or data.get("knee")
            r_kn = right.get("knee")
            l_ak = left.get("ankle") or data.get("ankle")
            r_ak = right.get("ankle")

            # Determine side with highest visibility
            def get_vis(pt):
                return float(pt[3]) if (pt and len(pt) >= 4) else 1.0

            l_vis = (get_vis(l_sh) + get_vis(l_hip) + get_vis(l_kn)) / 3.0
            r_vis = (get_vis(r_sh) + get_vis(r_hip) + get_vis(r_kn)) / 3.0

            if r_vis > l_vis + 0.15 and (r_sh and r_hip and r_kn):
                active_shoulder = r_sh
                active_elbow = r_el or l_el
                active_wrist = r_wr or l_wr
                active_hip = r_hip
                active_knee = r_kn
                active_ankle = r_ak or l_ak
            else:
                active_shoulder = l_sh or r_sh
                active_elbow = l_el or r_el
                active_wrist = l_wr or r_wr
                active_hip = l_hip or r_hip
                active_knee = l_kn or r_kn
                active_ankle = l_ak or r_ak

            now = time.time()

            # Route to the appropriate exercise kinematic state machine
            if current_exercise == "pushups":
                if active_shoulder and active_elbow and active_wrist:
                    payload = engine.process(
                        shoulder=active_shoulder,
                        elbow=active_elbow,
                        wrist=active_wrist,
                        hip=active_hip,
                        ankle=active_ankle,
                        now=now,
                    )
                    await websocket.send_json(payload)
                else:
                    await websocket.send_json({
                        "event": "FRAME",
                        "status": "TRACKING",
                        "phase": "CALIBRATING",
                        "exercise_type": current_exercise,
                        "primary_angle": 180.0,
                        "primary_angle_name": "Elbow",
                        "secondary_angle": 180.0,
                        "secondary_angle_name": "Plank Core",
                        "knee_angle": 180.0,
                        "hip_angle": 180.0,
                        "rep_count": engine.rep_count,
                        "message": "POSITION UPPER BODY IN VIEW (SHOULDER/ELBOW/WRIST)",
                        "damage": 0,
                        "damage_taken": 0,
                        "purity": 100.0,
                        "active_joint_index": 13,
                        "fault_joint_indices": [],
                    })
            elif current_exercise == "overhead_press":
                if active_hip and active_shoulder and active_elbow:
                    payload = engine.process(
                        hip=active_hip,
                        shoulder=active_shoulder,
                        elbow=active_elbow,
                        knee=active_knee,
                        wrist=active_wrist,
                        now=now,
                    )
                    await websocket.send_json(payload)
                else:
                    await websocket.send_json({
                        "event": "FRAME",
                        "status": "TRACKING",
                        "phase": "CALIBRATING",
                        "exercise_type": current_exercise,
                        "primary_angle": 80.0,
                        "primary_angle_name": "Shoulder",
                        "secondary_angle": 180.0,
                        "secondary_angle_name": "Lumbar Spine",
                        "knee_angle": 180.0,
                        "hip_angle": 80.0,
                        "rep_count": engine.rep_count,
                        "message": "STAND WITH TORSO & ARMS IN CAMERA VIEW",
                        "damage": 0,
                        "damage_taken": 0,
                        "purity": 100.0,
                        "active_joint_index": 11,
                        "fault_joint_indices": [],
                    })
            elif current_exercise == "rdl":
                if active_shoulder and active_hip and active_knee:
                    payload = engine.process(
                        shoulder=active_shoulder,
                        hip=active_hip,
                        knee=active_knee,
                        ankle=active_ankle,
                        now=now,
                    )
                    await websocket.send_json(payload)
                else:
                    await websocket.send_json({
                        "event": "FRAME",
                        "status": "TRACKING",
                        "phase": "CALIBRATING",
                        "exercise_type": current_exercise,
                        "primary_angle": 180.0,
                        "primary_angle_name": "Hip Hinge",
                        "secondary_angle": 165.0,
                        "secondary_angle_name": "Knee Bend",
                        "knee_angle": 165.0,
                        "hip_angle": 180.0,
                        "rep_count": engine.rep_count,
                        "message": "POSITION SIDE PROFILE IN VIEW (SHOULDER/HIP/KNEE)",
                        "damage": 0,
                        "damage_taken": 0,
                        "purity": 100.0,
                        "active_joint_index": 23,
                        "fault_joint_indices": [],
                    })
            else:  # squats default
                if active_hip and active_knee and active_ankle:
                    payload = engine.process(
                        hip=active_hip,
                        knee=active_knee,
                        ankle=active_ankle,
                        shoulder=active_shoulder,
                        now=now,
                        right_hip=r_hip,
                        left_knee=l_kn,
                        right_knee=r_kn,
                        left_ankle=l_ak,
                        right_ankle=r_ak,
                        left_shoulder=l_sh,
                        right_shoulder=r_sh,
                    )
                    await websocket.send_json(payload)
                else:
                    await websocket.send_json({
                        "event": "FRAME",
                        "status": "TRACKING",
                        "phase": "CALIBRATING",
                        "exercise_type": "squats",
                        "primary_angle": 180.0,
                        "primary_angle_name": "Knee",
                        "secondary_angle": 180.0,
                        "secondary_angle_name": "Hip",
                        "knee_angle": 180.0,
                        "hip_angle": 180.0,
                        "rep_count": engine.rep_count,
                        "message": "POSITION FULL BODY IN CAMERA VIEW",
                        "damage": 0,
                        "damage_taken": 0,
                        "purity": 100.0,
                        "active_joint_index": 25,
                        "fault_joint_indices": [],
                    })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ERROR] WebSocket: {e}")