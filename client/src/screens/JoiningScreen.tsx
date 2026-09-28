import { MENU_CSS } from './menuStyles';
import { MenuHeader } from './MenuHeader';

interface JoiningScreenProps {
    code: string;
    /** Why joining failed, or null while it's still trying. */
    error: string | null;
    onRetry: () => void;
    onBack: () => void;
}

/** Shown at /game/CODE until you're in: "Joining game CODE…", or why it didn't work. */
export function JoiningScreen({ code, error, onRetry, onBack }: JoiningScreenProps) {
    return (
        <main className="menu-screen">
            <style>{MENU_CSS}</style>
            <div className="menu-column">
                <MenuHeader backLabel="Games" onBack={onBack} />
                <div style={{ textAlign: 'center', paddingTop: '14vh' }}>
                    {error ? (
                        <>
                            <h1 className="menu-title">
                                Couldn't join <span className="menu-code">{code}</span>
                            </h1>
                            <p role="alert">{friendlyError(error)}</p>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    justifyContent: 'center',
                                    marginTop: 24,
                                }}
                            >
                                <button type="button" className="menu-primary" onClick={onBack}>
                                    Back to games
                                </button>
                                <button type="button" className="menu-secondary" onClick={onRetry}>
                                    Try again
                                </button>
                            </div>
                        </>
                    ) : (
                        <h1 className="menu-title" aria-live="polite">
                            Joining game <span className="menu-code">{code}</span>…
                        </h1>
                    )}
                </div>
            </div>
        </main>
    );
}

/** The server's "room not found" in players' words; anything else as it came. */
function friendlyError(error: string): string {
    return /not found/i.test(error)
        ? "There's no open game with this code. It may have ended, or the code is mistyped."
        : error;
}
