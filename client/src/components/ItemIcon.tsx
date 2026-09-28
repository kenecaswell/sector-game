import { UPGRADE_ICON_COLORS, STRUCTURE_COLORS, STRUCTURE_DEFAULT_COLOR } from '../game/constants';
import type { StructureType, UpgradeId } from '../types/shared';

// Placeholder icons for the on-screen inventory until there's art: a structure is a tiny hexagonal
// slab in its type's color (like the real ones), an upgrade a diamond in its own color.

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

export type ItemIconProps =
    | { kind: 'structure'; id: StructureType; size?: number }
    | { kind: 'upgrade'; id: UpgradeId; size?: number };

export function ItemIcon(props: ItemIconProps) {
    const size = props.size ?? 30;
    return (
        <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
            {props.kind === 'structure' ? (
                <>
                    {/* Side face under a flat-top hexagon lid. */}
                    <polygon
                        points="-11,1 -5.5,6.5 5.5,6.5 11,1 11,4 5.5,9.5 -5.5,9.5 -11,4"
                        fill="#3a3a3a"
                    />
                    <polygon
                        points="-11,1 -5.5,-4.5 5.5,-4.5 11,1 5.5,6.5 -5.5,6.5"
                        fill={css(STRUCTURE_COLORS[props.id] ?? STRUCTURE_DEFAULT_COLOR)}
                        stroke="#1b1b1b"
                        strokeWidth={1.2}
                    />
                </>
            ) : (
                <>
                    <polygon
                        points="0,-10 8,0 0,10 -8,0"
                        fill={css(UPGRADE_ICON_COLORS[props.id] ?? 0xffffff)}
                        stroke="#1b1b1b"
                        strokeWidth={1.2}
                    />
                    <polygon points="0,-10 8,0 0,-2" fill="#fff" opacity={0.55} />
                </>
            )}
        </svg>
    );
}
