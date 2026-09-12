import os
import time
from typing import Optional, List, Dict, Any, Tuple
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

app = FastAPI(title="AthleteMind 3D Orientation-Agnostic Bio-Engine", version="4.1")

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

@app.get("/")
def read_root():
    return {"status": "ok", "service": "AthleteMind 3D Bio-Engine v4.1"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}


# ---------------------------------------------------------------------------
# 3D Vector Kinematics & Spatial Helpers
# ---------------------------------------------------------------------------

def to_vec3(pt: Any) -> Optional[np.ndarray]:
    """Converts a coordinate list/tuple of [x, y], [x, y, z], or [x, y, z, v] to a 3D float array."""
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
    knee_sep, ankle_sep = abs(left_knee[0] - right_knee[0]), abs(left_ankle[0] - right_ankle[0])
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
# Unified Biomechanical Exercise Engine
# ---------------------------------------------------------------------------

class ExerciseEngine:
    """Unified, high-performance engine for Squat, Push-up, Overhead Press, and RDL."""

    def __init__(self, exercise: str = "squat"):
        self.exercise = exercise
        self.phase = "STANDING" if exercise in ("squat", "rdl") else "PLANK" if exercise == "pushup" else "RACK"
        self.rep_count = 0
        self.hold_start_time: Optional[float] = None
        self.last_valid_hold_time = 0.0
        self.hold_duration = 0.0
        self.rep_hit_awarded = False
        self.ohp_rack_entered = False
        self.smooth_primary: Optional[float] = None
        self.smooth_secondary: Optional[float] = None

        # Ego-lift tracking (squats)
        self.is_stunned = False
        self.stun_until = 0.0
        self.in_shallow_dip = False
        self.sloppy_dips: List[float] = []

    def process(self, landmarks: Dict[str, Any], difficulty: str = "standard", now: Optional[float] = None,
                rom_calibration: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        orientation, dom_side, left, right = normalize_landmarks(landmarks)
        active = right if (dom_side == "RIGHT" and right.get("hip")) else left

        # 1. Compute Raw Angles & Faults per Exercise
        valgus, fault_detected, fault_name, warning, voice_cue = False, False, "", "", ""
        damage_base = 100
        primary_label, secondary_label = "KNEE", "HIP"
        is_target_hold, is_reset_position = False, False
        symmetry = 98.0

        if self.exercise == "squat":
            primary_label, secondary_label, damage_base = "KNEE", "HIP", 100
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

            # Thresholds
            t_min, t_max, hip_max = (75.0, 110.0, 105.0) if difficulty == "rehab" else (60.0, 90.0, 90.0) if difficulty == "athlete" else (65.0, 105.0, 95.0)
            hold_target, stand_thresh = (1.0, 145.0) if difficulty == "rehab" else (1.8, 155.0) if difficulty == "athlete" else (1.2, 148.0)

            # Dynamic Personalized ROM Calibration
            if rom_calibration and "squat_min" in rom_calibration:
                calib_min = float(rom_calibration["squat_min"])
                if 40.0 <= calib_min <= 135.0:
                    t_max = min(120.0, max(75.0, calib_min + 8.0))
                    t_min = max(40.0, calib_min - 15.0)

            # Stun check
            if self.is_stunned:
                if now >= self.stun_until:
                    self.is_stunned = False
                    self.phase = "STANDING"
                else:
                    return self._build_payload(self.smooth_primary or 180.0, self.smooth_secondary or 90.0, primary_label, secondary_label,
                                               orientation, dom_side, "penalty", "STUNNED", True, "EGO LIFT", False,
                                               "WEAPON OVERHEATED - STUNNED", "Slow down! Weapon overheated.", 0.0, 0, 25,
                                               "SLOPPY REPS PENALIZED! WAIT FOR STUN TO EXPIRE", True, hold_target, symmetry)

        elif self.exercise == "pushup":
            primary_label, secondary_label, damage_base = "ELBOW", "CORE LINE", 90
            sh, el, wr = active.get("shoulder"), active.get("elbow"), active.get("wrist")
            hip, ankle = active.get("hip"), active.get("ankle")
            l_sh, l_el, l_wr = left.get("shoulder"), left.get("elbow"), left.get("wrist")
            r_sh, r_el, r_wr = right.get("shoulder"), right.get("elbow"), right.get("wrist")
            if l_sh and l_el and l_wr and r_sh and r_el and r_wr:
                l_ang = calculate_angle_3d(l_sh, l_el, l_wr)
                r_ang = calculate_angle_3d(r_sh, r_el, r_wr)
                symmetry = max(0.0, min(100.0, 100.0 - abs(l_ang - r_ang) * 1.5))
            if not (sh and el and wr):
                return {}
            raw_primary = calculate_angle_3d(sh, el, wr)
            raw_secondary = calculate_angle_3d(sh, hip, ankle) if (hip and ankle) else 180.0
            fault_detected = abs(180.0 - raw_secondary) > 20.0
            if fault_detected:
                fault_name, warning, voice_cue = "LUMBAR SAG", "LUMBAR SAG DETECTED", "Squeeze your core! Don't sag."

            t_max, stand_thresh, hold_target = (105.0, 145.0, 0.6) if difficulty == "rehab" else (85.0, 160.0, 1.2) if difficulty == "athlete" else (95.0, 150.0, 0.8)
            t_min, hip_max, v_drop = 0.0, 180.0, 0.0

            # Dynamic Personalized ROM Calibration for Push-ups
            if rom_calibration and "pushup_min" in rom_calibration:
                calib_min = float(rom_calibration["pushup_min"])
                if 40.0 <= calib_min <= 130.0:
                    t_max = min(120.0, max(75.0, calib_min + 8.0))

        elif self.exercise == "overhead_press":
            primary_label, secondary_label, damage_base = "ELBOW", "SPINE", 100
            l_sh, l_el, l_wr = left.get("shoulder"), left.get("elbow"), left.get("wrist")
            r_sh, r_el, r_wr = right.get("shoulder"), right.get("elbow"), right.get("wrist")
            l_ear, r_ear = left.get("ear"), right.get("ear")

            # Bilateral Joint Angle & Symmetry
            l_ang = calculate_angle_3d(l_sh, l_el, l_wr) if (l_sh and l_el and l_wr) else None
            r_ang = calculate_angle_3d(r_sh, r_el, r_wr) if (r_sh and r_el and r_wr) else None

            if l_ang is not None and r_ang is not None:
                raw_primary = (l_ang + r_ang) / 2.0
                symmetry = max(0.0, min(100.0, 100.0 - abs(l_ang - r_ang) * 1.5))
            else:
                raw_primary = l_ang if l_ang is not None else (r_ang if r_ang is not None else 180.0)
                symmetry = 98.0

            raw_secondary = 180.0

            # Vertical Reference Datums (Ears, Shoulders, Wrists)
            left_sh_y = l_sh[1] if l_sh else 0.4
            right_sh_y = r_sh[1] if r_sh else 0.4
            sh_y = (left_sh_y + right_sh_y) / 2.0

            ear_candidates = [e[1] for e in (l_ear, r_ear) if e]
            ear_y = min(ear_candidates) if ear_candidates else (sh_y - 0.12)

            wrist_candidates = [w[1] for w in (l_wr, r_wr) if w]
            wr_y = min(wrist_candidates) if wrist_candidates else 0.5

            if orientation != "FRONT":
                act_sh, act_hp, act_kn = active.get("shoulder"), active.get("hip"), active.get("knee")
                if act_sh and act_hp and act_kn:
                    raw_secondary = calculate_angle_3d(act_sh, act_hp, act_kn)
                    fault_detected = raw_secondary < 145.0
                    if fault_detected:
                        fault_name, warning, voice_cue = "LUMBAR ARCH", "LUMBAR ARCH DETECTED", "Ribcage down! Don't arch your back."

            # Dynamic thresholds
            rack_elbow_thresh = 110.0 if difficulty == "rehab" else 95.0 if difficulty == "athlete" else 100.0
            lockout_elbow_thresh = 145.0 if difficulty == "rehab" else 160.0 if difficulty == "athlete" else 150.0
            hold_target = 0.5 if difficulty == "rehab" else 1.0 if difficulty == "athlete" else 0.6

            # Dynamic Personalized ROM Calibration for Overhead Press Lockout
            if rom_calibration and "ohp_max" in rom_calibration:
                calib_max = float(rom_calibration["ohp_max"])
                if 130.0 <= calib_max <= 180.0:
                    lockout_elbow_thresh = min(160.0, max(135.0, calib_max - 5.0))

            # Dual-Condition State Machine with Hysteresis Separation:
            # Condition 1 (Bottom / Rack Position): Wrists near shoulder height with elbows flexed < 100°
            in_rack_zone = (wr_y >= sh_y - 0.10) or (raw_primary <= rack_elbow_thresh)

            # Condition 2 (Top / Lockout Position):
            # Wrists ascend significantly above ears (wr_y < ear_y + 0.04) with elbows extending >= 150°/160°
            wrists_above_ears = bool(wr_y < ear_y + 0.04)
            in_lockout_zone = bool(wrists_above_ears and (raw_primary >= lockout_elbow_thresh) and not fault_detected)

            is_target_hold = in_lockout_zone
            is_reset_position = bool(in_rack_zone)

            t_min, t_max, stand_thresh, hip_max, v_drop = 0.0, rack_elbow_thresh, lockout_elbow_thresh, 180.0, 0.0

        else:  # rdl
            primary_label, secondary_label, damage_base = "HIP HINGE", "KNEE", 110
            sh, hp, kn, an = active.get("shoulder"), active.get("hip"), active.get("knee"), active.get("ankle")
            if not (sh and hp and kn):
                return {}
            raw_primary = calculate_angle_3d(sh, hp, kn)
            raw_secondary = calculate_angle_3d(hp, kn, an) if an else 165.0
            fault_detected = raw_secondary < 135.0
            if fault_detected:
                fault_name, warning, voice_cue = "SQUATTING HINGE", "SQUATTING HINGE DETECTED", "Hinge at your hips, don't squat!"

            t_min, t_max = (75.0, 110.0) if difficulty == "rehab" else (60.0, 90.0) if difficulty == "athlete" else (68.0, 100.0)
            stand_thresh, hold_target = (145.0, 1.0) if difficulty == "rehab" else (155.0, 1.8) if difficulty == "athlete" else (148.0, 1.2)
            hip_max, v_drop = 180.0, 0.0

        # 2. EMA Smoothing
        if self.smooth_primary is None:
            self.smooth_primary, self.smooth_secondary = raw_primary, raw_secondary
        else:
            self.smooth_primary = round(0.75 * raw_primary + 0.25 * self.smooth_primary, 1)
            self.smooth_secondary = round(0.75 * raw_secondary + 0.25 * self.smooth_secondary, 1)

        pri_ang, sec_ang = self.smooth_primary, self.smooth_secondary

        # 3. State Conditions
        if self.exercise == "squat":
            if orientation == "FRONT":
                is_target_hold = (((t_min <= pri_ang <= t_max) or (v_drop <= 0.10 and pri_ang <= 125.0)) and not valgus)
                is_reset_position = (pri_ang >= stand_thresh or v_drop >= 0.16)
            else:
                is_target_hold = (t_min <= pri_ang <= t_max and sec_ang <= hip_max and not valgus)
                is_reset_position = (pri_ang >= stand_thresh)

            # Rapid bounce ego-lift
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
                        return self._build_payload(pri_ang, sec_ang, primary_label, secondary_label, orientation, dom_side,
                                                   "penalty", "STUNNED", True, "EGO LIFT", False, "EGO LIFT DETECTED",
                                                   "Slow down! Don't bounce!", 0.0, 0, 25, "EGO LIFT DETECTED! STUNNED (-25 HP)", True, hold_target, symmetry)
                self.in_shallow_dip = False

        elif self.exercise == "pushup":
            is_target_hold = (pri_ang <= t_max and not fault_detected)
            is_reset_position = (pri_ang >= stand_thresh)
        elif self.exercise == "overhead_press":
            # State condition already computed via dual-condition hysteresis above
            pass
        else:  # rdl
            is_target_hold = (t_min <= pri_ang <= t_max and not fault_detected)
            is_reset_position = (pri_ang >= stand_thresh)

        # 4. State Machine Transition: Hold vs Reset vs Transition
        status, damage, feedback = "TRACKING", 0, "IN POSITION"
        event = "FRAME"

        if is_target_hold:
            self.phase = "HOLDING" if self.exercise == "squat" else "BOTTOM_HOLD" if self.exercise == "pushup" else "LOCKOUT" if self.exercise == "overhead_press" else "HINGE_HOLD"
            self.last_valid_hold_time = now
            if self.hold_start_time is None:
                self.hold_start_time = now
            self.hold_duration = now - self.hold_start_time

            # Award rep completion flag if held for at least a solid pause or full target
            min_hold = min(0.35, hold_target)
            if self.hold_duration >= min_hold:
                self.rep_hit_awarded = True

            if self.hold_duration >= hold_target:
                status, damage = "hit", damage_base
                event = "HOLD_HIT"
                voice_cue = voice_cue or ("Critical hit! Stand up!" if self.exercise in ("squat", "rdl") else "Push up to lockout!" if self.exercise == "pushup" else "Lockout held! Lower to rack.")
                feedback = f"CRITICAL HIT! RETURN TO COMPLETE REP (+{damage_base} DMG)"
            else:
                feedback = f"HOLD POSITION... ({self.hold_duration:.1f}s / {hold_target:.1f}s)"
        else:
            if now - self.last_valid_hold_time >= 0.8:
                self.hold_start_time, self.hold_duration = None, 0.0

            if is_reset_position:
                if self.rep_hit_awarded:
                    self.rep_count += 1
                    self.rep_hit_awarded = False
                    self.ohp_rack_entered = True  # Primed at rack for next repetition
                    status = "CRITICAL HIT!"
                    damage = 100
                    event = "REP_COMPLETE"
                    voice_cue = "Rep completed! Good form."
                    feedback = f"REP {self.rep_count} COMPLETE! (+100 DMG)"
                else:
                    feedback = "READY • BEGIN REPETITION"
                    event = "FRAME"
                    damage = 0
                self.phase = "STANDING" if self.exercise in ("squat", "rdl") else "LOCKOUT" if self.exercise == "pushup" else "RACK"
            else:
                self.phase = "ASCENDING" if self.rep_hit_awarded else "DESCENDING" if self.exercise in ("squat", "pushup") else "PRESSING" if self.exercise == "overhead_press" else "HINGING"
                feedback = warning or ("RETURN TO START" if self.rep_hit_awarded else f"REACH TARGET DEPTH ({int(pri_ang)}°)")

        return self._build_payload(pri_ang, sec_ang, primary_label, secondary_label, orientation, dom_side,
                                   status, self.phase, fault_detected or valgus, fault_name, valgus,
                                   warning, voice_cue, self.hold_duration, damage, 0, feedback, False, hold_target, symmetry, event)

    def _build_payload(self, pri: float, sec: float, pri_lbl: str, sec_lbl: str, ori: str, dom: str,
                       status: str, phase: str, fault: bool, fault_nm: str, valgus: bool,
                       warning: str, voice_cue: str, hold_dur: float, damage: int, dmg_taken: int,
                       feedback: str, overheated: bool, hold_target: float, symmetry: float = 98.0,
                       event: str = "FRAME") -> Dict[str, Any]:
        purity = round(max(0.0, min(100.0, 100.0 - (35.0 if fault else 0.0))), 2)
        current_knee = pri if self.exercise == "squat" else sec if self.exercise == "rdl" else 180.0
        is_critical = bool(status == "CRITICAL HIT!" or damage >= 80)
        return {
            "event": event,
            "exercise": self.exercise,
            "orientation": ori,
            "dominant_side": dom if ori == "SIDE" else "BILATERAL",
            "status": status,
            "phase": phase,
            "primary_angle": pri,
            "primary_label": pri_lbl,
            "secondary_angle": sec,
            "secondary_label": sec_lbl,
            # Backward compatibility aliases
            "knee_angle": round(current_knee, 1),
            "hip_angle": round(sec if self.exercise == "squat" else pri if self.exercise == "rdl" else 90.0, 1),
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
        """Backward compatibility adapter for phase 2/3 test suites."""
        if kwargs and "shoulder" in kwargs:
            now = kwargs.get("now", time.time())
            return self.process(kwargs, "standard", now)
        if len(args) >= 3:
            return self.process(args[2], args[1] if len(args) > 1 else "standard", args[3] if len(args) > 3 else time.time())
        return self.process({}, "standard", time.time())


# ---------------------------------------------------------------------------
# Exercise Classes & Multi-Exercise Session Dispatcher
# ---------------------------------------------------------------------------

class SquatEngine(ExerciseEngine):
    def __init__(self):
        super().__init__("squat")

class PushupEngine(ExerciseEngine):
    def __init__(self):
        super().__init__("pushup")

class OverheadPressEngine(ExerciseEngine):
    def __init__(self):
        super().__init__("overhead_press")

class RDLEngine(ExerciseEngine):
    def __init__(self):
        super().__init__("rdl")


class CircuitEngine:
    """Manages rotating multi-exercise Bounty Circuit encounter across 3 sequential phases:
    Phase 1: Armor Shred (5 Deep Squats)
    Phase 2: Shield Breaker (5 Overhead Presses)
    Phase 3: Core Finisher (5 Push-ups)
    """
    def __init__(self):
        self.reset()

    def reset(self):
        self.phase_index = 1
        self.phase_targets = {
            1: {
                "exercise": "squat",
                "target_reps": 5,
                "name": "ARMOR SHRED",
                "next": "overhead_press",
                "banner": "ARMOR BROKEN — SWITCH TO OVERHEAD PRESS!",
            },
            2: {
                "exercise": "overhead_press",
                "target_reps": 5,
                "name": "SHIELD BREAKER",
                "next": "pushup",
                "banner": "SHIELDS DOWN — DROP AND FINISH WITH PUSH-UPS!",
            },
            3: {
                "exercise": "pushup",
                "target_reps": 5,
                "name": "CORE FINISHER",
                "next": "COMPLETE",
                "banner": "CIRCUIT COMPLETE — CYBER-COLOSSUS DESTROYED!",
            },
        }
        self.engines = {
            "squat": SquatEngine(),
            "overhead_press": OverheadPressEngine(),
            "pushup": PushupEngine(),
        }

    def process(self, landmarks: Dict[str, Any], difficulty: str = "standard", now: Optional[float] = None,
                rom_calibration: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        if now is None:
            now = time.time()

        phase_cfg = self.phase_targets.get(self.phase_index, self.phase_targets[1])
        active_ex = phase_cfg["exercise"]
        engine = self.engines[active_ex]

        payload = engine.process(landmarks, difficulty, now, rom_calibration=rom_calibration)
        if not payload:
            return {}

        current_phase_reps = engine.rep_count
        target_reps = phase_cfg["target_reps"]
        circuit_event = payload.get("event", "FRAME")
        circuit_banner = ""

        if circuit_event == "REP_COMPLETE":
            if current_phase_reps >= target_reps:
                if self.phase_index < 3:
                    circuit_banner = phase_cfg["banner"]
                    self.phase_index += 1
                    next_cfg = self.phase_targets[self.phase_index]
                    circuit_event = "CIRCUIT_PHASE_ADVANCE"
                    payload["event"] = circuit_event
                    payload["next_exercise"] = next_cfg["exercise"]
                    payload["voice_cue"] = circuit_banner
                    payload["coach_feedback"] = circuit_banner
                    payload["message"] = circuit_banner
                else:
                    circuit_banner = phase_cfg["banner"]
                    circuit_event = "CIRCUIT_COMPLETE"
                    payload["event"] = circuit_event
                    payload["next_exercise"] = "COMPLETE"
                    payload["voice_cue"] = "Circuit complete! Target eliminated!"
                    payload["coach_feedback"] = "CIRCUIT COMPLETE! BOSS ELIMINATED"
                    payload["message"] = "CIRCUIT COMPLETE!"

        total_reps = sum(eng.rep_count for eng in self.engines.values())
        payload["circuit_mode"] = True
        payload["circuit_phase"] = self.phase_index
        payload["circuit_phase_name"] = phase_cfg["name"]
        payload["circuit_phase_reps"] = min(target_reps, current_phase_reps)
        payload["circuit_target_reps"] = target_reps
        payload["circuit_total_reps"] = total_reps
        payload["circuit_banner"] = circuit_banner
        payload["exercise"] = active_ex

        return payload


class ExerciseSession:
    """Manages active exercise engines and circuit sessions per WebSocket connection."""
    def __init__(self):
        self.rom_calibration: Dict[str, float] = {}
        self.engines = {
            "squat": SquatEngine(),
            "pushup": PushupEngine(),
            "overhead_press": OverheadPressEngine(),
            "rdl": RDLEngine(),
            "circuit": CircuitEngine(),
        }

    def reset(self):
        self.engines = {
            "squat": SquatEngine(),
            "pushup": PushupEngine(),
            "overhead_press": OverheadPressEngine(),
            "rdl": RDLEngine(),
            "circuit": CircuitEngine(),
        }

    def process_frame(self, exercise: str, difficulty: str, landmarks: Dict[str, Any], now: Optional[float] = None) -> Dict[str, Any]:
        if now is None:
            now = time.time()
        engine = self.engines.get(exercise, self.engines["squat"])
        rom_calibration = landmarks.get("rom_calibration") or self.rom_calibration
        return engine.process(landmarks, difficulty, now, rom_calibration=rom_calibration)


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

            if data.get("action") == "calibrate_rom":
                if "rom_calibration" in data and isinstance(data["rom_calibration"], dict):
                    session.rom_calibration.update(data["rom_calibration"])
                await websocket.send_json({
                    "event": "ROM_CALIBRATED",
                    "status": "CALIBRATION_STORED",
                    "rom_calibration": session.rom_calibration
                })
                continue

            if "rom_calibration" in data and isinstance(data["rom_calibration"], dict):
                session.rom_calibration.update(data["rom_calibration"])

            payload = session.process_frame(
                data.get("exercise", "squat"),
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