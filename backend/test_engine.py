import time
import numpy as np
from main import (
    calculate_angle_3d,
    detect_orientation,
    check_frontal_valgus,
    check_knee_valgus,
    SquatEngine,
    PushUpEngine,
    OverheadPressEngine,
    RDLEngine,
    global_telemetry,
)

def test_phase5_multi_exercise_3d_engine():
    print("--- 1. Testing True 3D Angle & Orientation Calculations ---")
    # Standing 3D straight line
    angle_straight = calculate_angle_3d([0.5, 0.2, 0.0], [0.5, 0.5, 0.0], [0.5, 0.8, 0.0])
    assert abs(angle_straight - 180.0) < 1.0

    # 90-degree 3D right angle (e.g. knee flexed forward in Z or Y)
    angle_90 = calculate_angle_3d([0.5, 0.2, 0.0], [0.5, 0.5, 0.0], [0.5, 0.5, 0.3])
    assert abs(angle_90 - 90.0) < 1.0

    # Orientation: Front view (shoulder width > 0.15)
    orient_front = detect_orientation([0.4, 0.2, 0.0], [0.6, 0.2, 0.0], [0.45, 0.5, 0.0], [0.55, 0.5, 0.0])
    assert orient_front == "front"

    # Orientation: Side view (shoulder width <= 0.15)
    orient_side = detect_orientation([0.5, 0.2, 0.0], [0.55, 0.2, 0.1], [0.5, 0.5, 0.0], [0.52, 0.5, 0.1])
    assert orient_side == "side"

    print("--- 2. Testing Frontal Valgus & Frontal Squat Depth ---")
    # Normal alignment
    valgus_normal = check_frontal_valgus([0.4, 0.65], [0.6, 0.65], [0.38, 0.9], [0.62, 0.9])
    assert not valgus_normal

    # Caved knees
    valgus_caved = check_frontal_valgus([0.48, 0.65], [0.52, 0.65], [0.35, 0.9], [0.65, 0.9])
    assert valgus_caved

    # Squat Front View Depth Detection
    engine = SquatEngine(global_telemetry, difficulty="standard")
    # Front view with hip dropped to knee level
    res_front = engine.process(
        hip=[0.45, 0.68, 0.0],
        knee=[0.42, 0.70, 0.1],
        ankle=[0.42, 0.90, 0.0],
        shoulder=[0.45, 0.30, 0.0],
        right_hip=[0.55, 0.68, 0.0],
        left_shoulder=[0.40, 0.30, 0.0],
        right_shoulder=[0.60, 0.30, 0.0],
        left_knee=[0.42, 0.70, 0.1],
        right_knee=[0.58, 0.70, 0.1],
        left_ankle=[0.40, 0.90, 0.0],
        right_ankle=[0.60, 0.90, 0.0],
        now=100.0,
    )
    assert res_front["view_orientation"] == "front"
    assert res_front["phase"] == "HOLDING"

    print("--- 3. Testing Push-Up State Machine & Lumbar Sag Fault ---")
    push_engine = PushUpEngine(global_telemetry, difficulty="standard")
    sim_t = 200.0

    # Lockout position
    res_pu_lock = push_engine.process(
        shoulder=[0.2, 0.5, 0.0],
        elbow=[0.2, 0.65, 0.0],
        wrist=[0.2, 0.8, 0.0],
        hip=[0.5, 0.5, 0.0],
        ankle=[0.8, 0.5, 0.0],
        now=sim_t,
    )
    assert res_pu_lock["phase"] in ("STARTING", "LOCKOUT")

    # Bottom pushup with good plank (simulate 8 descent frames)
    for _ in range(8):
        sim_t += 0.1
        res_pu_bot = push_engine.process(
            shoulder=[0.2, 0.65, 0.0],
            elbow=[0.35, 0.65, 0.0],
            wrist=[0.35, 0.8, 0.0],
            hip=[0.5, 0.65, 0.0],
            ankle=[0.8, 0.65, 0.0],
            now=sim_t,
        )
    assert res_pu_bot["phase"] == "HOLDING"

    # Pushup with Lumbar Sag (hip dropped down)
    for _ in range(4):
        sim_t += 0.1
        res_pu_sag = push_engine.process(
            shoulder=[0.2, 0.65, 0.0],
            elbow=[0.35, 0.65, 0.0],
            wrist=[0.35, 0.8, 0.0],
            hip=[0.5, 0.85, 0.0],  # sagged hip
            ankle=[0.8, 0.65, 0.0],
            now=sim_t,
        )
    assert res_pu_sag["has_fault"]
    assert res_pu_sag["fault_type"] == "lumbar_sag"

    print("--- 4. Testing Overhead Press & Lumbar Arch Fault ---")
    ohp_engine = OverheadPressEngine(global_telemetry, difficulty="rehab")
    sim_t = 300.0
    for _ in range(5):
        sim_t += 0.1
        res_ohp_lock = ohp_engine.process(
            hip=[0.5, 0.6, 0.0],
            shoulder=[0.5, 0.35, 0.0],
            elbow=[0.5, 0.15, 0.0],
            knee=[0.5, 0.8, 0.0],
            now=sim_t,
        )
    assert res_ohp_lock["phase"] == "HOLDING"

    for _ in range(4):
        sim_t += 0.1
        res_ohp_arch = ohp_engine.process(
            hip=[0.4, 0.6, 0.0],       # hyperextended hip forward
            shoulder=[0.5, 0.35, 0.0],  # leaning backward
            elbow=[0.5, 0.15, 0.0],
            knee=[0.5, 0.8, 0.0],
            now=sim_t,
        )
    assert res_ohp_arch["has_fault"]
    assert res_ohp_arch["fault_type"] == "lumbar_arch"

    print("--- 5. Testing Romanian Deadlift (RDL) & Squatting the Hinge ---")
    rdl_engine = RDLEngine(global_telemetry, difficulty="standard")
    sim_t = 400.0
    for _ in range(5):
        sim_t += 0.1
        res_rdl_hinge = rdl_engine.process(
            shoulder=[0.75, 0.55, 0.0],
            hip=[0.5, 0.55, 0.0],
            knee=[0.5, 0.75, 0.0],
            ankle=[0.5, 0.95, 0.0],
            now=sim_t,
        )
    assert res_rdl_hinge["phase"] == "HOLDING"

    for _ in range(4):
        sim_t += 0.1
        res_rdl_squatted = rdl_engine.process(
            shoulder=[0.75, 0.55, 0.0],
            hip=[0.5, 0.55, 0.0],
            knee=[0.65, 0.65, 0.0],
            ankle=[0.5, 0.95, 0.0],
            now=sim_t,
        )
    assert res_rdl_squatted["has_fault"]
    assert res_rdl_squatted["fault_type"] == "squatting_the_hinge"

    print("--- 6. Testing Telemetry & Multi-Exercise CSV ---")
    global_telemetry.reset()
    global_telemetry.record_rep(1, 88.0, 1.6, False, "", time.time(), "squats")
    global_telemetry.record_rep(2, 85.0, 1.5, False, "", time.time(), "pushups")
    summary = global_telemetry.get_summary()
    assert summary["total_reps"] == 2
    assert summary["purity_score"] == 100.0

    csv_out = global_telemetry.generate_csv()
    assert "Rep_Index,Exercise,Min_Angle_Deg" in csv_out
    assert "pushups" in csv_out
    print("CSV Multi-Exercise Content Verified!")

    print("\n[OK] ALL PHASE 5 MULTI-EXERCISE 3D KINEMATICS TESTS PASSED!")

if __name__ == "__main__":
    test_phase5_multi_exercise_3d_engine()
