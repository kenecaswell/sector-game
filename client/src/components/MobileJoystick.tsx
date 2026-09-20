import { useRef, useState } from 'react';

const BASE_RADIUS = 55;
const KNOB_RADIUS = 26;

interface MobileJoystickProps {
  onChange: (dir: { x: number; y: number }) => void;
}

/**
 * Drag-based virtual joystick for touch devices. Produces the same
 * `{x, y}` direction vector (each axis clamped to [-1, 1]) that the desktop
 * keyboard input does — see GameScene.pollKeyboard — so it plugs into the
 * exact same `onInput`/`sendInput` path with no server-side changes needed.
 */
export function MobileJoystick({ onChange }: MobileJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });

  const updateFromPointer = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > BASE_RADIUS) {
      dx = (dx / distance) * BASE_RADIUS;
      dy = (dy / distance) * BASE_RADIUS;
    }

    setKnobOffset({ x: dx, y: dy });
    onChange({ x: dx / BASE_RADIUS, y: dy / BASE_RADIUS });
  };

  const reset = () => {
    activePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        activePointerId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        reset();
      }}
      onPointerCancel={reset}
      style={{
        position: 'absolute',
        left: 24,
        bottom: 24,
        width: BASE_RADIUS * 2,
        height: BASE_RADIUS * 2,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.12)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: BASE_RADIUS - KNOB_RADIUS + knobOffset.x,
          top: BASE_RADIUS - KNOB_RADIUS + knobOffset.y,
          width: KNOB_RADIUS * 2,
          height: KNOB_RADIUS * 2,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.55)',
        }}
      />
    </div>
  );
}
