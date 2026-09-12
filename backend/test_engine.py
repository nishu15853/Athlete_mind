import numpy as np
from main import SquatEngine, calculate_angle

def test_phase1_bio_engine():
    print("--- 1. Testing calculate_angle with NumPy arctan2 ---")
    # Straight vertical leg: hip=(0.5, 0.2), knee=(0.5, 0.5), ankle=(0.5, 0.8) -> 180°
    stand_ang = calculate_angle([0.5, 0.2], [0.5, 0.5], [0.5, 0.8])
    print(f"Standing Knee Angle: {stand_ang}° (Expected 180.0°)")
    assert stand_ang == 180.0

    # Right angle 90°: hip=(0.2, 0.5), knee=(0.5, 0.5), ankle=(0.5, 0.8) -> 90°
    squat_ang = calculate_angle([0.2, 0.5], [0.5, 0.5], [0.5, 0.8])
    print(f"Squat Bottom Knee Angle: {squat_ang}° (Expected 90.0°)")
    assert squat_ang == 90.0

    print("\n--- 2. Testing SquatEngine State Machine & CRITICAL HIT ---")
    engine = SquatEngine()

    # Frame 1: Standing
    res = engine.process([0.5, 0.2], [0.5, 0.5], [0.5, 0.8])
    print(f"Standing: Phase={res['phase']}, Status={res['status']}, Angle={res['knee_angle']}°")
    assert res['phase'] == "STANDING"
    assert res['status'] == "TRACKING"
    assert res['rep_count'] == 0

    # Frame 2: Deep squat descent (hip drops to create 90° knee angle)
    for _ in range(4):
        res = engine.process([0.2, 0.5], [0.5, 0.5], [0.5, 0.8])

    print(f"Deep Squat: Phase={res['phase']}, Status={res['status']}, Angle={res['knee_angle']}°, Damage={res['damage']}")
    assert res['status'] == "CRITICAL HIT!"
    assert res['damage'] == 100

    # Frame 3: First frame returning to Standing -> Rep Complete!
    res_return = engine.process([0.5, 0.2], [0.5, 0.5], [0.5, 0.8])
    while res_return['phase'] != "STANDING":
        res_return = engine.process([0.5, 0.2], [0.5, 0.5], [0.5, 0.8])

    print(f"Returned to Standing: Phase={res_return['phase']}, RepCount={res_return['rep_count']}, Message={res_return['message']}")
    assert res_return['phase'] == "STANDING"
    assert res_return['rep_count'] == 1

    print("\n[OK] ALL PHASE 1 BIO-ENGINE TESTS PASSED!")

if __name__ == "__main__":
    test_phase1_bio_engine()
