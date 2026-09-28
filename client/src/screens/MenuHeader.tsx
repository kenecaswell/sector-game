import type { ReactNode } from 'react';

interface MenuHeaderProps {
    /** The back button's label ("Back", "Games"); no button when there's nowhere to go back to. */
    backLabel?: string;
    onBack?: () => void;
    /** The right-hand slot, kept free for a settings button (none yet). */
    right?: ReactNode;
}

/**
 * The menu screens' header: a back button on the left, the game's title centered, and a slot on
 * the right reserved for a settings button. Three equal columns, so the title stays centered
 * whatever is on either side.
 */
export function MenuHeader({ backLabel, onBack, right }: MenuHeaderProps) {
    return (
        <header className="menu-header">
            <div>
                {onBack && (
                    <button type="button" className="menu-back" onClick={onBack}>
                        ← {backLabel ?? 'Back'}
                    </button>
                )}
            </div>
            <div className="menu-header-title">SECTOR 42</div>
            <div className="menu-header-right">{right}</div>
        </header>
    );
}
