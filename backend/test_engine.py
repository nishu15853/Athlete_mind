import time
import numpy as np
from main import SquatEngine, calculate_angle, check_knee_valgus, global_telemetry

def test_phase4_clinician_analytics():
    print("--- 1. Testing Angle & Valgus Calculations ---")
    knee_stand = calculate_angle([0.6, 0.5], [0.6, 0.7], [0.6, 0.9])
    assert knee_stand >= 160.0

    valgus_normal = check_knee_valgus([0.6, 0.5], [0.6, 0.7], [0.6, 0.9], right_hip=[0.4, 0.5])
    assert not valgus_normal

    valgus_caved = check_knee_valgus([0.6, 0.5], [0.35, 0.7], [0.6, 0.9], right_hip=[0.4, 0.5])
    assert valgus_caved

    print("\n--- 2. Testing Pure Rep Recording & Telemetry Store ---")
    global_telemetry.reset()
    engine = SquatEngine(global_telemetry)
    sim_time = 1000.0

    # Start Standing
    engine.process([0.6, 0.5], [0.6, 0.7], [0.6, 0.9], shoulder=[0.6, 0.2], now=sim_time)

    # Descend to Squat Bottom (~90° knee, <90° hip)
    hip = [0.45, 0.65]
    knee = [0.6, 0.65]
    ankle = [0.6, 0.9]
    shoulder = [0.55, 0.55]

    for _ in range(3):
        sim_time += 0.1
        engine.process(hip, knee, ankle, shoulder=shoulder, now=sim_time)

    # Hold for 1.6s
    sim_time += 1.5
    res_hit = engine.process(hip, knee, ankle, shoulder=shoulder, now=sim_time)
    assert res_hit['status'] == "hit"
    assert res_hit['damage'] == 100

    # Stand back up -> Rep completed and recorded in telemetry
    sim_time += 0.8
    res_complete = engine.process([0.6, 0.5], [0.6, 0.7], [0.6, 0.9], shoulder=[0.6, 0.2], now=sim_time)
    assert res_complete['rep_count'] == 1

    summary = global_telemetry.get_summary()
    print(f"Session Summary: TotalReps={summary['total_reps']}, PurityScore={summary['purity_score']}%, MeanHold={summary['mean_bottom_hold_time']}s")
    assert summary['total_reps'] == 1
    assert summary['purity_score'] == 100.0
    assert summary['mean_bottom_hold_time'] >= 1.5

    csv_data = global_telemetry.generate_csv()
    assert "Rep_Index,Min_Knee_Angle_Deg" in csv_data
    assert "OPTIMAL" in csv_data
    print("CSV Export Generation Verified!")

    print("\n--- 3. Testing Ego-Lift Penalty Recording ---")
    sim_time = 2000.0
    # Shallow dip 1
    sim_time += 0.4
    engine.process([0.48, 0.60], [0.6, 0.7], [0.6, 0.9], shoulder=[0.6, 0.2], now=sim_time)
    sim_time += 0.4
    engine.process([0.6, 0.5], [0.6, 0.7], [0.6, 0.9], shoulder=[0.6, 0.2], now=sim_time)

    # Shallow dip 2 -> penalty
    sim_time += 0.4
    engine.process([0.48, 0.60], [0.6, 0.7], [0.6, 0.9], shoulder=[0.6, 0.2], now=sim_time)
    sim_time += 0.4
    res_pen = engine.process([0.6, 0.5], [0.6, 0.7], [0.6, 0.9], shoulder=[0.6, 0.2], now=sim_time)

    assert res_pen['status'] == "penalty"
    assert res_pen['damage_taken'] == 25
    assert global_telemetry.ego_lifts >= 1

    summary_after = global_telemetry.get_summary()
    assert summary_after['biomechanical_fault_breakdown']['ego_lifts'] >= 1
    print("Ego Lift Fault Breakdown Logged Verified!")

    print("\n[OK] ALL PHASE 4 CLINICIAN ANALYTICS TESTS PASSED!")

if __name__ == "__main__":
    test_phase4_clinician_analytics()
