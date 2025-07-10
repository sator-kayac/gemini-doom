# Game Specification

## I. Overview
This document outlines the current specifications for the game, focusing on mobile controls and automatic firing.

## II. Mobile Controls (Analog Input)

The game utilizes an analog control scheme based on "Right Power (RP)" and "Left Power (LP)" values, which are influenced by touch input.

### A. Input Mechanism

1.  **Initial Tap:**
    *   Tapping the **left half** of the screen sets **LP to 10**.
    *   Tapping the **right half** of the screen sets **RP to 10**.
2.  **Vertical Swipe (Analog Adjustment):**
    *   Swiping **up** on a touched side **increases** the corresponding RP/LP value.
    *   Swiping **down** on a touched side **decreases** the corresponding RP/LP value.
    *   RP and LP values are capped between -100 and 100.
    *   Sensitivity for RP/LP adjustment is `0.5`.
3.  **Touch Release:**
    *   When all fingers are lifted from the screen, both RP and LP are reset to 0.

### B. Movement Logic

Movement (forward/backward) and turning are derived from the `totalPower` (RP + LP) and `diffPower` (RP - LP) values.

1.  **Turning (Rotation):**
    *   **Direction:**
        *   If `RP > LP` (positive `diffPower`): Player turns **left**.
        *   If `LP > RP` (negative `diffPower`): Player turns **right**.
    *   **Speed:** The turning speed is proportional to the square root of the absolute `diffPower`. This provides a more sensitive response at lower differences and a less sensitive response at higher differences.
    *   **Sensitivity:** `turnSensitivity` is `0.0005`.
2.  **Forward/Backward Movement:**
    *   **Direction:**
        *   If `totalPower > 0`: Player moves **forward**.
        *   If `totalPower < 0`: Player moves **backward**.
    *   **Speed:** The movement speed is proportional to the absolute `totalPower`.
    *   **Base Speed:** `5.0`.
    *   **Power Scale:** `0.05` (adjusts how much `totalPower` affects speed).
3.  **Stationary Turning:**
    *   If `totalPower = 0` (e.g., one finger up-swiped, other down-swiped to balance power) and `diffPower != 0`, the player will rotate in place without moving forward or backward.
4.  **Strafing (Sideways Movement):**
    *   **Input:** Horizontal movement of fingers on the screen.
    *   **Speed:** The strafing speed is based on the average `deltaX` (horizontal movement) of all active touches.
    *   **Sensitivity:** `0.05` (multiplier for `strafeAmount`).
    *   **Direction:** Moving fingers right results in right strafe, moving left results in left strafe.

### C. Specific Two-Finger Gestures

These gestures provide precise turning control and override general two-finger rotation.

1.  **Right Turn Gesture:**
    *   **Input:** Left finger swipes significantly **up**, AND Right finger swipes significantly **down**.
    *   **Result:** Player turns **right**.
    *   **Speed:** Fixed `turnAmountForGesture` of `0.1 / 3`.
2.  **Left Turn Gesture:**
    *   **Input:** Right finger swipes significantly **up**, AND Left finger swipes significantly **down**.
    *   **Result:** Player turns **left**.
    *   **Speed:** Fixed `turnAmountForGesture` of `0.1 / 3`.
    *   **Swipe Threshold:** `50` pixels for a significant swipe.

## III. Automatic Firing

The game features an automatic firing mechanism.

1.  **Trigger Condition:**
    *   An enemy is within a 10-degree frontal cone of the player's camera.
    *   The enemy is within a range of 20 units.
2.  **Firing Rate:**
    *   `autoFireRate` is `0.2` seconds.
    *   If `rapidFireActive` (power-up), `autoFireRate` is halved.
3.  **Targeting:** Fires at one enemy at a time within the cone.
