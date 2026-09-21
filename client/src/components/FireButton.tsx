import { useRef, useState } from 'react';

const SIZE = 76;

interface FireButtonProps {
    /** Called with true when the button is pressed and false when it's released or cancelled. */
    onHoldChange: (held: boolean) => void;
}

/**
 * Touch fire button. Holding it keeps shooting along the current aim (the scene
 * applies the fire-rate limit). Uses pointer capture so a finger that slides
 * off the button still releases it, and works alongside the joystick because
 * each touch is tracked independently.
 */
export function FireButton({ onHoldChange }: FireButtonProps) {
    const activePointerId = useRef<number | null>(null);
    const [pressed, setPressed] = useState(false);

    const release = () => {
        activePointerId.current = null;
        setPressed(false);
        onHoldChange(false);
    };

    return (
        <button
            type="button"
            aria-label="Fire"
            onPointerDown={(e) => {
                activePointerId.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                setPressed(true);
                onHoldChange(true);
            }}
            onPointerUp={(e) => {
                if (activePointerId.current === e.pointerId) release();
            }}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
            style={{
                position: 'absolute',
                right: 24,
                bottom: 24,
                width: SIZE,
                height: SIZE,
                borderRadius: '50%',
                border: '2px solid rgba(255, 255, 255, 0.85)',
                background: pressed ? 'rgba(231, 76, 60, 0.95)' : 'rgba(231, 76, 60, 0.7)',
                color: '#fff',
                fontFamily: 'sans-serif',
                fontWeight: 'bold',
                fontSize: 14,
                letterSpacing: 1,
                touchAction: 'none',
                userSelect: 'none',
            }}
        >
            FIRE
        </button>
    );
}
