import time
import numpy as np
from main import SquatEngine, calculate_angle, check_knee_valgus

def test_phase2_ai_must_matter():
    print("--- 1. Testing Biomechanical Angle Calculations ---")
    # Standing leg: hip at (0.6, 0.5), knee at (0.6, 0.7), ankle at (0.6, 0.9) -> 180°
    knee_stand = calculate_angle([0.6, 0.5], [0.6, 0.7], [0.6, 0.9])
    print(f"Knee Stand Angle: {knee_stand}° (Expected 180.0°)")
    assert knee_stand >= 160.0

    print("\n--- 2. Testing Knee-Valgus Detection ---")
    # Normal alignment
    valgus_normal = check_knee_valgus([0.6, 0.5], [0.6, 0.7], [0.6, 0.9], right_hip=[0.4, 0.5])
    print(f"Normal Alignment Valgus: {valgus_normal} (Expected False)")
    assert not valgus_normal

    # Caved-in alignment (knee x moved inward)
    valgus_caved = check_knee_valgus([0.6, 0.5], [0.35, 0.7], [0.6, 0.9], right_hip=[0.4, 0.5])
    print(f"Caved In Valgus: {valgus_caved} (Expected True)")
    assert valgus_caved

    print("\n--- 3. Testing Clinical Hold (1.5s - 2.0s) & CRITICAL HIT ---")
    engine = SquatEngine()
    sim_time = 1000.0

    # Standing frame
    res_stand = engine.process(
        hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        shoulder=[0.6, 0.2], now=sim_time
    )
    assert res_stand['phase'] == "STANDING"
    assert res_stand['status'] == "TRACKING"
    assert res_stand['rep_count'] == 0

    # Squat bottom: Hip < 90° and Knee between 70° and 95°
    # Hip=(0.45, 0.65), Knee=(0.6, 0.65), Ankle=(0.6, 0.9) -> Knee ~90°
    # Shoulder=(0.55, 0.55) -> Hip < 90°
    hip = [0.45, 0.65]
    knee = [0.6, 0.65]
    ankle = [0.6, 0.9]
    shoulder = [0.55, 0.55]

    for _ in range(3):
        sim_time += 0.1
        res = engine.process(hip, knee, ankle, shoulder=shoulder, now=sim_time)

    print(f"Squat Bottom Entered: Phase={res['phase']}, Status={res['status']}, KneeAngle={res['knee_angle']}°, HipAngle={res['hip_angle']}°")
    assert res['phase'] == "HOLDING"
    assert res['damage'] == 0  # Not yet 1.5s

    # Hold reaches 1.6s (>= 1.5s target) -> CRITICAL HIT!
    sim_time += 1.5
    res_hit = engine.process(hip, knee, ankle, shoulder=shoulder, now=sim_time)
    print(f"Hold at 1.6s: Phase={res_hit['phase']}, Status={res_hit['status']}, Message={res_hit['message']}, Damage={res_hit['damage']}")
    assert res_hit['status'] == "hit"
    assert res_hit['damage'] == 100
    assert "CRITICAL HIT!" in res_hit['message']

    # Stand back up -> Rep Complete!
    sim_time += 0.8
    res_complete = engine.process(
        hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        shoulder=[0.6, 0.2], now=sim_time
    )
    print(f"Returned to Standing: Phase={res_complete['phase']}, RepCount={res_complete['rep_count']}")
    assert res_complete['rep_count'] == 1
    assert res_complete['phase'] == "STANDING"

    print("\n--- 4. Testing Ego-Lift Penalty Engine ---")
    ego_engine = SquatEngine()
    sim_time = 2000.0

    # Start standing
    ego_engine.process(
        hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        shoulder=[0.6, 0.2], now=sim_time
    )

    # Dip 1: Shallow bounce (knee drops to ~110°, not hitting <= 95°), then stands up within 0.8s
    sim_time += 0.4
    ego_engine.process(
        hip=[0.48, 0.60], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        shoulder=[0.6, 0.2], now=sim_time
    )
    sim_time += 0.4
    res_dip1 = ego_engine.process(
        hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        shoulder=[0.6, 0.2], now=sim_time
    )
    print(f"Sloppy Dip 1 at t={sim_time}: Status={res_dip1['status']}")

    # Dip 2: Rapid shallow bounce within 1.6s (< 3.0s threshold) without full depth/hold
    sim_time += 0.4
    ego_engine.process(
        hip=[0.48, 0.60], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        shoulder=[0.6, 0.2], now=sim_time
    )
    sim_time += 0.4
    res_dip2 = ego_engine.process(
        hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        shoulder=[0.6, 0.2], now=sim_time
    )
    print(f"Sloppy Dip 2 at t={sim_time}: Status={res_dip2['status']}, Error={res_dip2['error']}, DamageTaken={res_dip2['damage_taken']}")

    assert res_dip2['status'] == "penalty"
    assert res_dip2['damage_taken'] == 25
    assert "EGO LIFT" in res_dip2['error']
    assert res_dip2['weapon_overheated'] is True

    print("\n[OK] ALL PHASE 2 TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_phase2_ai_must_matter()
