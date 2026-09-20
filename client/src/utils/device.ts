/** Rough touch-capability check, used to decide whether to show the mobile
 * virtual joystick overlay instead of relying on the keyboard. A touch
 * laptop still gets the joystick shown alongside the keyboard, which is
 * harmless — both send the same `{x, y}` input shape. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
