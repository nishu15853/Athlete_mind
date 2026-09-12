import time
from main import SquatEngine, calculate_angle, check_knee_valgus

def test_squat_engine():
    print("--- 1. Testing Angle & Valgus Computations ---")
    # Standing leg: hip at (0.6, 0.5), knee at (0.6, 0.7), ankle at (0.6, 0.9) -> 180 deg
    knee_stand = calculate_angle([0.6, 0.5], [0.6, 0.7], [0.6, 0.9])
    print(f"Knee Stand Angle: {knee_stand}° (Expected ~180°)")
    assert knee_stand >= 160.0

    # 85 deg squat knee: hip at (0.5, 0.65), knee at (0.6, 0.7), ankle at (0.6, 0.9)
    # 80 deg squat hip: shoulder at (0.45, 0.4), hip at (0.5, 0.65), knee at (0.6, 0.7)
    valgus_normal = check_knee_valgus([0.6, 0.5], [0.6, 0.7], [0.6, 0.9], right_hip=[0.4, 0.5])
    print(f"Normal Alignment Valgus: {valgus_normal} (Expected False)")
    assert not valgus_normal

    valgus_caved = check_knee_valgus([0.6, 0.5], [0.35, 0.7], [0.6, 0.9], right_hip=[0.4, 0.5])
    print(f"Caved In Valgus: {valgus_caved} (Expected True)")
    assert valgus_caved

    print("\n--- 2. Testing Clinical Hold & Pure Squat Rep ---")
    engine = SquatEngine()
    sim_time = 1000.0

    # Frame 1: Standing
    res = engine.process_frame(
        shoulder=[0.6, 0.2], hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        right_hip=[0.4, 0.5], now=sim_time
    )
    print(f"Standing Frame: Phase={res['phase']}, Status={res['status']}, KneeAngle={res['knee_angle']}°")
    assert res['phase'] == "STANDING"
    assert res['rep_count'] == 0

    # Frame 2: Deep squat position (Hip ~78°, Knee ~82°)
    # Shoulder at (0.35, 0.5), Hip at (0.45, 0.65), Knee at (0.6, 0.65), Ankle at (0.6, 0.9)
    # knee angle = angle(hip, knee, ankle) = angle((0.45, 0.65), (0.6, 0.65), (0.6, 0.9)) = 90 deg!
    # hip angle = angle(shoulder, hip, knee)
    # Frame 2: Descend into squat position (Hip ~45°, Knee ~90°)
    hip = [0.45, 0.65]
    knee = [0.6, 0.65]
    ankle = [0.6, 0.9]
    shoulder = [0.55, 0.55] # forward torso lean over thighs -> hip angle ~45 deg < 90 deg
    
    # Simulate a couple of transition frames
    for _ in range(3):
        sim_time += 0.1
        res = engine.process_frame(
            shoulder=shoulder, hip=hip, knee=knee, ankle=ankle,
            right_hip=[0.35, 0.65], now=sim_time
        )

    print(f"Squat Bottom Entered: Phase={res['phase']}, Status={res['status']}, KneeAngle={res['knee_angle']}°, HipAngle={res['hip_angle']}°")
    assert res['phase'] == "HOLDING"

    # Frame 3: Hold for 1.0s (Total hold 1.0s < 1.5s target)
    sim_time += 1.0
    res = engine.process_frame(
        shoulder=shoulder, hip=hip, knee=knee, ankle=ankle,
        right_hip=[0.35, 0.65], now=sim_time
    )
    print(f"Hold at 1.0s: Phase={res['phase']}, HoldProgress={res['hold_progress']}, Damage={res['damage']}")
    assert res['phase'] == "HOLDING"
    assert res['damage'] == 0  # not yet 1.5s

    # Frame 4: Hold reaches 1.6s (>= 1.5s target) -> CRITICAL HIT!
    sim_time += 0.6
    res = engine.process_frame(
        shoulder=shoulder, hip=hip, knee=knee, ankle=ankle,
        right_hip=[0.35, 0.65], now=sim_time
    )
    print(f"Hold at 1.6s: Phase={res['phase']}, Status={res['status']}, Message={res['message']}, Damage={res['damage']}")
    assert res['status'] == "hit"
    assert res['damage'] == 100
    assert "CRITICAL HIT!" in res['message']

    # Frame 5: Return to Standing -> Rep Counted!
    sim_time += 0.8
    res = engine.process_frame(
        shoulder=[0.6, 0.2], hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        right_hip=[0.4, 0.5], now=sim_time
    )
    print(f"Returned to Standing: Phase={res['phase']}, RepCount={res['rep_count']}")
    assert res['rep_count'] == 1
    assert res['phase'] == "STANDING"

    print("\n--- 3. Testing Ego-Lift Penalty Engine ---")
    ego_engine = SquatEngine()
    sim_time = 2000.0

    # Start standing
    ego_engine.process_frame(
        shoulder=[0.6, 0.2], hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        right_hip=[0.4, 0.5], now=sim_time
    )

    # Dip 1: Shallow dip to knee ~108° (not full depth & hold), then bounce back up within 0.8s
    sim_time += 0.4
    ego_engine.process_frame(
        shoulder=[0.6, 0.2], hip=[0.45, 0.65], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        right_hip=[0.4, 0.5], now=sim_time
    )
    sim_time += 0.4
    # Stand back up
    res1 = ego_engine.process_frame(
        shoulder=[0.6, 0.2], hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        right_hip=[0.4, 0.5], now=sim_time
    )
    print(f"Sloppy Dip 1 complete at t={sim_time}. Status={res1['status']}")

    # Dip 2: Rapid shallow dip to knee ~108° and bounce back within 0.8s (Total elapsed: 1.6s < 3.0s)
    sim_time += 0.4
    ego_engine.process_frame(
        shoulder=[0.6, 0.2], hip=[0.45, 0.65], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        right_hip=[0.4, 0.5], now=sim_time
    )
    sim_time += 0.4
    res2 = ego_engine.process_frame(
        shoulder=[0.6, 0.2], hip=[0.6, 0.5], knee=[0.6, 0.7], ankle=[0.6, 0.9],
        right_hip=[0.4, 0.5], now=sim_time
    )
    print(f"Sloppy Dip 2 complete at t={sim_time}. Status={res2['status']}, Error={res2['error']}, DamageTaken={res2['damage_taken']}")
    assert res2['status'] == "penalty"
    assert res2['damage_taken'] == 25
    assert "EGO LIFT" in res2['error']
    assert res2['weapon_overheated'] is True

    print("\n ALL KINEMATIC TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_squat_engine()
