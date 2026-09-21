import type { Notice } from '../context/GameContext';

interface NoticeStackProps {
    notices: Notice[];
}

const COLORS: Record<Notice['kind'], string> = {
    warning: 'rgba(214, 137, 16, 0.95)',
    success: 'rgba(39, 174, 96, 0.95)',
};

/**
 * Short-lived messages for everyone in the match — a player disconnected or reconnected. Fixed at
 * the top center just under the score badge, newest at the bottom; each disappears by itself.
 * It ignores the pointer so it never blocks aiming or clicks.
 */
export function NoticeStack({ notices }: NoticeStackProps) {
    if (notices.length === 0) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                top: 84,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                maxWidth: 'calc(100vw - 24px)',
                pointerEvents: 'none',
                zIndex: 10,
            }}
        >
            {notices.map((notice) => (
                <div
                    key={notice.id}
                    style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        background: COLORS[notice.kind],
                        color: '#fff',
                        fontFamily: 'sans-serif',
                        fontSize: 13,
                        textAlign: 'center',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
                    }}
                >
                    {notice.text}
                </div>
            ))}
        </div>
    );
}
