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
    BossCombatEngine,
    global_telemetry,
)

def test_phase5_multi_exercise_3d_engine():
    print("--- 1. Testing True 3D Angle & Orientation Calculations ---")
    angle_straight = calculate_angle_3d([0.5, 0.2, 0.0], [0.5, 0.5, 0.0], [0.5, 0.8, 0.0])
    assert abs(angle_straight - 180.0) < 1.0

    angle_90 = calculate_angle_3d([0.5, 0.2, 0.0], [0.5, 0.5, 0.0], [0.5, 0.5, 0.3])
    assert abs(angle_90 - 90.0) < 1.0

    orient_front = detect_orientation([0.4, 0.2, 0.0], [0.6, 0.2, 0.0], [0.45, 0.5, 0.0], [0.55, 0.5, 0.0])
    assert orient_front == "front"

    orient_side = detect_orientation([0.5, 0.2, 0.0], [0.55, 0.2, 0.1], [0.5, 0.5, 0.0], [0.52, 0.5, 0.1])
    assert orient_side == "side"

    print("--- 2. Testing Frontal Valgus & Frontal Squat Depth ---")
    valgus_normal = check_frontal_valgus([0.4, 0.65], [0.6, 0.65], [0.38, 0.9], [0.62, 0.9])
    assert not valgus_normal

    valgus_caved = check_frontal_valgus([0.48, 0.65], [0.52, 0.65], [0.35, 0.9], [0.65, 0.9])
    assert valgus_caved

    engine = SquatEngine(global_telemetry, difficulty="standard")
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

    res_pu_lock = push_engine.process(
        shoulder=[0.2, 0.5, 0.0],
        elbow=[0.2, 0.65, 0.0],
        wrist=[0.2, 0.8, 0.0],
        hip=[0.5, 0.5, 0.0],
        ankle=[0.8, 0.5, 0.0],
        now=sim_t,
    )
    assert res_pu_lock["phase"] in ("STARTING", "LOCKOUT")

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

    for _ in range(4):
        sim_t += 0.1
        res_pu_sag = push_engine.process(
            shoulder=[0.2, 0.65, 0.0],
            elbow=[0.35, 0.65, 0.0],
            wrist=[0.35, 0.8, 0.0],
            hip=[0.5, 0.85, 0.0],
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
            hip=[0.4, 0.6, 0.0],
            shoulder=[0.5, 0.35, 0.0],
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


def test_phase6_boss_combat_and_parrying():
    print("\n--- 7. Testing Phase 6 Boss Combat & Kinetic Multipliers ---")
    combat = BossCombatEngine()
    sim_time = 1000.0

    # Test Initial Standard State
    status = combat.update(sim_time, is_holding=False, rep_count=0, had_fault=False, is_critical=False)
    assert status["boss_hp"] == 500
    assert status["boss_state"] == "STANDARD"
    assert status["combo_multiplier"] == 1.0

    # Test Kinetic Combo Multiplier: 1 rep -> 1.0x (100 dmg)
    sim_time += 1.0
    status_r1 = combat.update(sim_time, is_holding=False, rep_count=1, had_fault=False, is_critical=True)
    assert status_r1["combo_streak"] == 1
    assert status_r1["combo_multiplier"] == 1.0
    assert status_r1["combat_damage_dealt"] == 100
    assert status_r1["boss_hp"] == 400

    # Rep 2 -> 1.5x (150 dmg)
    sim_time += 1.0
    status_r2 = combat.update(sim_time, is_holding=False, rep_count=2, had_fault=False, is_critical=True)
    assert status_r2["combo_streak"] == 2
    assert status_r2["combo_multiplier"] == 1.5
    assert status_r2["combat_damage_dealt"] == 150
    assert status_r2["boss_hp"] == 250
    # At 250 HP (<= 50%), state transitions to ENRAGED
    assert status_r2["boss_state"] == "ENRAGED"

    # Rep 3 -> 2.0x (200 dmg)
    sim_time += 1.0
    status_r3 = combat.update(sim_time, is_holding=False, rep_count=3, had_fault=False, is_critical=True)
    assert status_r3["combo_streak"] == 3
    assert status_r3["combo_multiplier"] == 2.0
    assert status_r3["combat_damage_dealt"] == 200
    assert status_r3["boss_hp"] == 50

    # Rep 4+ -> 3.0x (300 dmg, "HYPER OVERDRIVE")
    sim_time += 1.0
    status_r4 = combat.update(sim_time, is_holding=False, rep_count=4, had_fault=False, is_critical=True)
    assert status_r4["combo_streak"] == 4
    assert status_r4["combo_multiplier"] == 3.0
    assert status_r4["combat_damage_dealt"] == 300

    # Test Form Fault Streak Collapse Gate
    sim_time += 1.0
    status_fault = combat.update(sim_time, is_holding=False, rep_count=4, had_fault=True, is_critical=False)
    assert status_fault["streak_collapsed"]
    assert status_fault["combo_streak"] == 0
    assert status_fault["combo_multiplier"] == 1.0
    print("Kinetic Multiplier & Streak Collapse Verified!")

    print("\n--- 8. Testing Timed Evasion & Biomechanical Parrying ---")
    combat.reset()
    sim_time = 2000.0
    # Let attack timer count down (10s)
    for _ in range(101):
        sim_time += 0.1
        res = combat.update(sim_time, is_holding=False, rep_count=0, had_fault=False, is_critical=False)

    assert res["incoming_attack"]
    assert res["parry_window_sec"] > 0

    # Player holds depth during telegraph window -> Deflected!
    sim_time += 0.2
    res_parry = combat.update(sim_time, is_holding=True, rep_count=0, had_fault=False, is_critical=False)
    assert res_parry["parry_success"]
    assert res_parry["combat_damage_dealt"] == 50
    assert res_parry["boss_hp"] == 450
    assert not res_parry["incoming_attack"]
    print("Parry Deflection with 50 Counter-Damage Verified!")

    # Test Parry Failure: Let window expire without holding
    combat.reset()
    sim_time = 3000.0
    for _ in range(101):
        sim_time += 0.1
        res = combat.update(sim_time, is_holding=False, rep_count=0, had_fault=False, is_critical=False)
    assert res["incoming_attack"]

    # 3 seconds elapse without holding -> parry_failed pulse event
    failed_observed = False
    for _ in range(35):
        sim_time += 0.1
        res_fail = combat.update(sim_time, is_holding=False, rep_count=0, had_fault=False, is_critical=False)
        if res_fail["parry_failed"]:
            failed_observed = True

    assert failed_observed
    assert combat.player_hp == 65
    print("Parry Failure with 35 Direct Player Damage Verified!")

    print("\n[OK] ALL PHASE 6 ARCADE COMBAT TESTS PASSED!")

if __name__ == "__main__":
    test_phase5_multi_exercise_3d_engine()
    test_phase6_boss_combat_and_parrying()
