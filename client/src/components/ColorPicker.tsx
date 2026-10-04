import { useEffect, useId, useRef, useState } from 'react';
import { TEAMS, TEAM_IDS, isTeamId, type TeamId } from '../types/shared';

// The picker's look (the lobby adds this to its own CSS). Prefixed `cp-` so it can't collide.
export const COLOR_PICKER_CSS = `
/* --cp-size is the swatch size: 30px with a mouse, 44px (a comfortable tap target) on touch screens. */
.cp-root { --cp-size: 30px; --cp-gap: 8px; position: relative; display: inline-block; }
@media (pointer: coarse) { .cp-root { --cp-size: 44px; --cp-gap: 10px; } }
.cp-trigger {
    display: block;
    width: var(--cp-size);
    height: var(--cp-size);
    padding: 0;
    border-radius: 7px;
    border: 2px solid rgba(255, 255, 255, 0.55);
    cursor: pointer;
}
.cp-trigger:hover:not(:disabled), .cp-trigger[aria-expanded="true"] { border-color: #fff; }
.cp-trigger:disabled { opacity: 0.55; cursor: default; }
.cp-trigger:focus-visible, .cp-swatch:focus-visible { outline: 2px solid #f1c40f; outline-offset: 2px; }
.cp-popover {
    position: absolute;
    top: calc(var(--cp-size) + 8px);
    left: 0;
    z-index: 20;
    max-width: calc(100vw - 24px);
    box-sizing: border-box;
    padding: 12px;
    border-radius: 10px;
    background: #2b2b45;
    border: 1px solid rgba(255, 255, 255, 0.25);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.5);
}
.cp-heading { margin-bottom: 10px; font-size: 13px; font-weight: bold; letter-spacing: 0.5px; }
.cp-grid { display: grid; grid-template-columns: repeat(5, var(--cp-size)); gap: var(--cp-gap); }
.cp-swatch {
    position: relative;
    width: var(--cp-size);
    height: var(--cp-size);
    padding: 0;
    border-radius: 7px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 90ms ease;
}
.cp-swatch:hover:not(:disabled) { transform: scale(1.12); }
.cp-swatch[aria-checked="true"] { border-color: #fff; box-shadow: 0 0 0 2px #2b2b45, 0 0 0 4px #fff; }
.cp-swatch:disabled { cursor: not-allowed; opacity: 0.3; }
.cp-swatch:disabled::after {
    content: '';
    position: absolute;
    inset: 3px;
    background: linear-gradient(to top right, transparent calc(50% - 1px), #000 calc(50% - 1px), #000 calc(50% + 1px), transparent calc(50% + 1px));
}
.cp-count {
    position: absolute;
    right: -4px;
    bottom: -4px;
    min-width: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: #1a1a2e;
    border: 1px solid rgba(255, 255, 255, 0.6);
    color: #fff;
    font-size: 10px;
    line-height: 13px;
    text-align: center;
    pointer-events: none;
}
@media (prefers-reduced-motion: reduce) { .cp-swatch { transition: none; } }
`;

export interface ColorPickerProps {
    /** The chosen color (a TeamId), or '' for none yet. */
    value: string;
    /** The popup's title: "Color", or "Team color" in a game with teams. */
    heading: string;
    /** Names the button for screen readers, e.g. "Color for Bo" (the chosen color is added). */
    label: string;
    /** How many players have each color, for the badge on a swatch and for taken colors. */
    counts: ReadonlyMap<string, number>;
    /** Teams off: a color someone else has is taken and can't be picked. Teams on: shared. */
    exclusive: boolean;
    disabled?: boolean;
    /** The button's tooltip, e.g. why it's locked. */
    title?: string;
    onChange: (teamId: TeamId) => void;
}

const COLUMNS = 5; // two rows of five, for the ten colors (keep in step with .cp-grid above)

/**
 * A color swatch picker: a square showing the current color; clicking it opens a popup with every
 * color as a swatch, two rows of five, under a title ("Color" or "Team color"). Picking one (or Esc,
 * or clicking away) closes it. Arrow keys move between swatches. With `exclusive`, colors another
 * player has are crossed out and can't be picked; otherwise a badge says how many are on each
 * team. The server still checks every pick (LobbySystem).
 */
export function ColorPicker({
    value,
    heading,
    label,
    counts,
    exclusive,
    disabled = false,
    title,
    onChange,
}: ColorPickerProps) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const chosen = isTeamId(value) ? value : null;
    const chosenName = chosen ? TEAMS[chosen].name : 'none';

    const isTaken = (teamId: TeamId) =>
        exclusive && (counts.get(teamId) ?? 0) > 0 && teamId !== chosen;

    const close = (refocus: boolean) => {
        setOpen(false);
        if (refocus) triggerRef.current?.focus();
    };

    // Opening moves focus to the chosen swatch (or the first free one); clicking anywhere else closes.
    useEffect(() => {
        if (!open) return;
        const swatches =
            gridRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const current = gridRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
        (current ?? swatches?.[0])?.focus();
        const away = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', away);
        return () => document.removeEventListener('pointerdown', away);
    }, [open]);

    // A picker that gets locked (you readied up) while open closes.
    if (disabled && open) setOpen(false);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close(true);
            return;
        }
        const step: Record<string, number> = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -COLUMNS,
            ArrowDown: COLUMNS,
        };
        if (!(e.key in step) || !gridRef.current) return;
        e.preventDefault();
        const all = Array.from(gridRef.current.querySelectorAll<HTMLButtonElement>('button'));
        const from = all.findIndex((b) => b === document.activeElement);
        // Walk in that direction to the next swatch that can be picked (no wrapping).
        for (let i = from + step[e.key]; i >= 0 && i < all.length; i += step[e.key]) {
            if (!all[i].disabled) {
                all[i].focus();
                break;
            }
        }
    };

    return (
        <div className="cp-root" ref={rootRef} onKeyDown={open ? onKeyDown : undefined}>
            <button
                ref={triggerRef}
                type="button"
                className="cp-trigger"
                aria-label={`${label}: ${chosenName}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                title={title ?? `${heading}: ${chosenName}`}
                disabled={disabled}
                style={{ background: chosen ? TEAMS[chosen].color : 'transparent' }}
                onClick={() => setOpen((o) => !o)}
            />
            {open && (
                <div role="dialog" aria-labelledby={`${id}-heading`} className="cp-popover">
                    <div id={`${id}-heading`} className="cp-heading">
                        {heading}
                    </div>
                    <div
                        ref={gridRef}
                        role="radiogroup"
                        aria-labelledby={`${id}-heading`}
                        className="cp-grid"
                    >
                        {TEAM_IDS.map((teamId) => {
                            const count = counts.get(teamId) ?? 0;
                            const taken = isTaken(teamId);
                            const name = `${TEAMS[teamId].name}${
                                !exclusive && count > 0 ? ` (${count})` : ''
                            }${taken ? ' (taken)' : ''}`;
                            return (
                                <button
                                    key={teamId}
                                    type="button"
                                    role="radio"
                                    aria-checked={teamId === chosen}
                                    aria-label={name}
                                    title={name}
                                    disabled={taken}
                                    className="cp-swatch"
                                    style={{ background: TEAMS[teamId].color }}
                                    onClick={() => {
                                        onChange(teamId);
                                        close(true);
                                    }}
                                >
                                    {!exclusive && count > 0 && (
                                        <span className="cp-count" aria-hidden="true">
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
