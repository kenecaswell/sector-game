import { MENU_CSS } from './menuStyles';
import { MenuFooter } from './MenuFooter';

// The splash screen's own look: a placeholder backdrop (a dark sky over a hex grid, until there's
// game art) and a big pulsing Play button.
const SPLASH_CSS = `
.splash {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 24px;
    box-sizing: border-box;
    color: #fff;
    font-family: sans-serif;
    text-align: center;
    background:
        radial-gradient(ellipse at 50% 35%, rgba(63, 224, 255, 0.18), transparent 60%),
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='97' viewBox='0 0 56 97'%3E%3Cpath d='M28 0 56 16v32L28 64 0 48V16zM28 64v33' fill='none' stroke='%23ffffff' stroke-opacity='0.06' stroke-width='1.5'/%3E%3C/svg%3E"),
        linear-gradient(180deg, #0d0d1f 0%, #1a1a2e 55%, #232347 100%);
}
.splash-title {
    margin: 0;
    font-size: clamp(48px, 12vw, 104px);
    line-height: 1;
    letter-spacing: 0.06em;
    color: #fff;
    text-shadow: 0 0 24px rgba(63, 224, 255, 0.45), 0 4px 0 #0b0b18;
}
.splash-tagline { margin: 0; font-size: 17px; opacity: 0.8; }
.splash-play {
    border: none;
    border-radius: 999px;
    background: #f1c40f;
    color: #000;
    font-size: 26px;
    font-weight: bold;
    letter-spacing: 0.12em;
    padding: 18px 64px;
    cursor: pointer;
    box-shadow: 0 0 0 0 rgba(241, 196, 15, 0.6);
    animation: splash-pulse 2s ease-out infinite;
    transition: transform 90ms ease, background-color 120ms ease;
}
.splash-play:hover { background: #ffd84a; }
.splash-footer { position: absolute; bottom: 0; left: 0; right: 0; margin: 0; }
.splash-play:active { transform: scale(0.96); }
.splash-play:focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
@keyframes splash-pulse {
    0% { box-shadow: 0 0 0 0 rgba(241, 196, 15, 0.55); }
    70% { box-shadow: 0 0 0 22px rgba(241, 196, 15, 0); }
    100% { box-shadow: 0 0 0 0 rgba(241, 196, 15, 0); }
}
@media (prefers-reduced-motion: reduce) { .splash-play { animation: none; } }
`;

interface SplashScreenProps {
    onPlay: () => void;
}

/**
 * The first screen: the game's title over (placeholder) art and one call to action, Play, which
 * leads to the game list. Nothing connects to the server until a game is chosen.
 */
export function SplashScreen({ onPlay }: SplashScreenProps) {
    return (
        <main className="splash">
            <style>{MENU_CSS}</style>
            <style>{SPLASH_CSS}</style>
            <h1 className="splash-title">SECTOR 42</h1>
            <p className="splash-tagline">Claim the sector. Hold your ground.</p>
            <button type="button" className="splash-play" onClick={onPlay}>
                PLAY
            </button>
            <MenuFooter className="menu-footer splash-footer" />
        </main>
    );
}
