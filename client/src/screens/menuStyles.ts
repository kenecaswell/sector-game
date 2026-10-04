// Shared look for the menu screens (splash, game list, create game, joining): the lobby's dark
// palette with the game's yellow accent. Real CSS (for :hover, :focus-visible, media queries),
// prefixed `menu-` so it can't collide with anything else on the page.
export const MENU_CSS = `
.menu-screen {
    position: fixed;
    inset: 0;
    overflow-y: auto;
    background: #1a1a2e;
    color: #fff;
    font-family: sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px 0;
    box-sizing: border-box;
}
/* The content grows to fill the screen, so the footer sits at the bottom (or below long content). */
.menu-column { width: 640px; max-width: 100%; text-align: left; flex: 1 0 auto; }
.menu-footer {
    flex-shrink: 0;
    margin-top: 40px;
    padding: 16px 0 20px;
    font-size: 12px;
    opacity: 0.5;
    text-align: center;
}
.menu-header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    min-height: 40px;
    margin-bottom: 16px;
}
.menu-header-title { font-size: 15px; font-weight: bold; letter-spacing: 3px; opacity: 0.85; }
.menu-header-right { justify-self: end; } /* reserved for a settings button */
.menu-green {
    border: none;
    border-radius: 10px;
    background: #2ecc71;
    color: #fff;
    font-weight: bold;
    font-size: 16px;
    padding: 12px 26px;
    cursor: pointer;
    transition: transform 90ms ease, background-color 120ms ease;
}
.menu-green:hover:not(:disabled) { background: #27b463; }
.menu-green:active:not(:disabled) { transform: scale(0.96); }
.menu-green:disabled { opacity: 0.6; cursor: default; }
.menu-green:focus-visible, .menu-text-button:focus-visible { outline: 2px solid #f1c40f; outline-offset: 2px; }
.menu-text-button {
    border: none;
    background: none;
    color: rgba(255, 255, 255, 0.8);
    font-size: 15px;
    padding: 12px 14px;
    cursor: pointer;
}
.menu-text-button:hover { color: #fff; }
.menu-title { margin: 0 0 20px; font-size: 34px; color: #fff; letter-spacing: normal; }
.menu-back {
    border: none;
    background: none;
    color: rgba(255, 255, 255, 0.75);
    padding: 4px 0;
    font-size: 14px;
    cursor: pointer;
}
.menu-back:hover { color: #fff; }
.menu-back:focus-visible, .menu-input:focus-visible, .menu-card:focus-visible,
.menu-primary:focus-visible, .menu-choice input:focus-visible + span {
    outline: 2px solid #f1c40f;
    outline-offset: 2px;
}
.menu-primary {
    border: none;
    border-radius: 10px;
    background: #f1c40f;
    color: #000;
    font-weight: bold;
    font-size: 16px;
    padding: 12px 22px;
    cursor: pointer;
    transition: transform 90ms ease, background-color 120ms ease;
}
.menu-primary:hover:not(:disabled) { background: #ffd84a; }
.menu-primary:active:not(:disabled) { transform: scale(0.96); }
.menu-primary:disabled { opacity: 0.6; cursor: default; }
.menu-secondary {
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 10px;
    background: transparent;
    color: #fff;
    font-size: 15px;
    padding: 11px 18px;
    cursor: pointer;
}
.menu-secondary:hover { border-color: rgba(255, 255, 255, 0.6); }
.menu-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-size: 15px;
}
.menu-input::placeholder { color: rgba(255, 255, 255, 0.45); }
.menu-card {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    margin-top: 8px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
    text-align: left;
    font-size: 15px;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease;
}
.menu-card:hover:not(:disabled) { background: rgba(255, 255, 255, 0.09); border-color: rgba(255, 255, 255, 0.3); }
.menu-card:disabled { opacity: 0.5; cursor: default; }
.menu-card--create {
    border: 2px solid #f1c40f;
    background: rgba(241, 196, 15, 0.12);
    font-weight: bold;
    font-size: 17px;
    padding: 16px;
}
.menu-card--create:hover { background: rgba(241, 196, 15, 0.2) !important; }
.menu-code {
    font-family: ui-monospace, Menlo, monospace;
    letter-spacing: 2px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.12);
    font-size: 13px;
}
.menu-muted { font-size: 13px; opacity: 0.7; }
.menu-field { margin-top: 20px; }
.menu-label { display: block; font-weight: bold; margin-bottom: 8px; }
.menu-fieldset { border: none; padding: 0; margin: 24px 0 0; min-width: 0; }
.menu-fieldset legend { padding: 0; }
.menu-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.menu-choice { position: relative; }
.menu-choice input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.menu-choice span {
    display: block;
    padding: 9px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    cursor: pointer;
}
.menu-choice input:checked + span { background: #f1c40f; border-color: #f1c40f; color: #000; font-weight: bold; }
/* On/off settings: a label, a [?] help button and an iPhone-style switch on the right. */
.menu-toggle-row { display: flex; align-items: center; gap: 8px; margin-top: 24px; }
.menu-toggle-label { margin: 0; }
.menu-help { position: relative; display: inline-flex; }
.menu-help-button {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.45);
    background: transparent;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-weight: bold;
    line-height: 1;
    cursor: pointer;
}
.menu-help-button:hover, .menu-help-button[aria-expanded="true"] { color: #fff; border-color: #fff; }
.menu-help-button:focus-visible, .menu-switch:focus-visible { outline: 2px solid #f1c40f; outline-offset: 2px; }
.menu-tooltip {
    position: absolute;
    top: 28px;
    left: -8px;
    z-index: 10;
    width: 260px;
    max-width: calc(100vw - 48px);
    padding: 10px 12px;
    border-radius: 8px;
    background: #2b2b45;
    border: 1px solid rgba(255, 255, 255, 0.25);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    font-size: 13px;
    font-weight: normal;
    line-height: 1.4;
}
.menu-switch {
    position: relative;
    margin-left: auto;
    flex-shrink: 0;
    width: 51px;
    height: 31px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.25);
    cursor: pointer;
    transition: background-color 180ms ease;
}
.menu-switch[aria-checked="true"] { background: #2ecc71; }
.menu-switch-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
    transition: transform 180ms ease;
}
.menu-switch[aria-checked="true"] .menu-switch-knob { transform: translateX(20px); }
@media (prefers-reduced-motion: reduce) {
    .menu-switch, .menu-switch-knob { transition: none; }
}
.menu-alert { margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: rgba(231, 76, 60, 0.2); border: 1px solid rgba(231, 76, 60, 0.6); }
`;
