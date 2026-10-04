import type { WeaponId } from './weaponIds';

// Pictures of the three weapons for the Upgrades tab: the Blaster, the Ion Cannon and an ammo pack,
// in the same 2078 style as the structures: gunmetal and pale composite with cyan (and, for the
// Ion Cannon, ion yellow) light. SVG in a 24 x 24 box centered on the origin, pointing right.

const INK = '#1b1b1b';
const CYAN = '#39e6ff';
const ION = '#ffd84a'; // the Ion Cannon's bolts are yellow

/** The picture for a weapon, drawn in the 24 x 24 box of `ItemIcon`'s SVG. */
export function WeaponArt({ id }: { id: WeaponId }) {
    switch (id) {
        case 'basicGun':
            // A compact energy sidearm: a pale slide over a graphite frame, a glowing cell, a short
            // barrel with a lit tip, a grip and a trigger guard.
            return (
                <>
                    <polygon
                        points="-6,1 -2,1 -3.5,9 -8,9"
                        fill="#2b3238"
                        stroke={INK}
                        strokeWidth={0.8}
                    />
                    <path
                        d="M-1.8,3.4 Q0,7 -3.2,6.4"
                        fill="none"
                        stroke="#4b5761"
                        strokeWidth={1}
                    />
                    <rect
                        x={-10}
                        y={-5}
                        width={18}
                        height={6.4}
                        rx={1.4}
                        fill="#d6dde2"
                        stroke={INK}
                        strokeWidth={0.9}
                    />
                    <rect x={-10} y={-1.6} width={18} height={3} fill="#3c444d" />
                    <rect
                        x={7.4}
                        y={-3.4}
                        width={4.2}
                        height={3.4}
                        rx={0.8}
                        fill="#2b3238"
                        stroke={INK}
                        strokeWidth={0.7}
                    />
                    <circle cx={11.6} cy={-1.7} r={1.1} fill={CYAN} />
                    <rect
                        x={-6.6}
                        y={-3.9}
                        width={7.6}
                        height={1.8}
                        rx={0.6}
                        fill={CYAN}
                        opacity={0.95}
                    />
                    <line x1={-9} y1={-5} x2={-9} y2={-6.6} stroke="#8e9aa4" strokeWidth={1} />
                    <line x1={4.5} y1={-5} x2={4.5} y2={-6.2} stroke="#8e9aa4" strokeWidth={1} />
                </>
            );
        case 'bigGun':
            // A shoulder-fired ion cannon: a long coiled barrel throwing a yellow bolt, a bulky
            // receiver with a cyan power cell, a stock, and a pistol grip.
            return (
                <>
                    <polygon
                        points="-11,-2 -5,-3 -5,3.5 -11,4.5"
                        fill="#2b3238"
                        stroke={INK}
                        strokeWidth={0.8}
                    />
                    <polygon
                        points="-3,2.5 1,2.5 0,8.5 -3.4,8.5"
                        fill="#2b3238"
                        stroke={INK}
                        strokeWidth={0.8}
                    />
                    <rect
                        x={-6}
                        y={-4.4}
                        width={9}
                        height={7.6}
                        rx={1.4}
                        fill="#cfd7dd"
                        stroke={INK}
                        strokeWidth={0.9}
                    />
                    <rect
                        x={-4.6}
                        y={-2.8}
                        width={5.8}
                        height={3.2}
                        rx={0.8}
                        fill="#0f1a21"
                        stroke={CYAN}
                        strokeWidth={0.8}
                    />
                    <rect x={-3.6} y={-1.9} width={3.8} height={1.4} fill={CYAN} />
                    <rect
                        x={3}
                        y={-2.6}
                        width={9}
                        height={3.4}
                        fill="#3c444d"
                        stroke={INK}
                        strokeWidth={0.8}
                    />
                    {[4.4, 6.8, 9.2].map((x) => (
                        <rect
                            key={x}
                            x={x}
                            y={-3.6}
                            width={1.4}
                            height={5.4}
                            rx={0.4}
                            fill="#8e9aa4"
                            stroke={INK}
                            strokeWidth={0.5}
                        />
                    ))}
                    <circle cx={12.2} cy={-0.9} r={1.6} fill={ION} />
                    <circle cx={12.2} cy={-0.9} r={2.8} fill={ION} opacity={0.3} />
                    <line
                        x1={3.6}
                        y1={-4.8}
                        x2={10.6}
                        y2={-4.8}
                        stroke={ION}
                        strokeWidth={0.7}
                        opacity={0.9}
                    />
                </>
            );
        case 'ammo':
            // A power-cell pack: a rounded gunmetal case holding three glowing cells, with a latch
            // and a hazard stripe.
            return (
                <>
                    <rect
                        x={-9.5}
                        y={-7}
                        width={19}
                        height={14}
                        rx={2.2}
                        fill="#3c444d"
                        stroke={INK}
                        strokeWidth={0.9}
                    />
                    <rect x={-9.5} y={-7} width={19} height={3} rx={1.5} fill="#56606a" />
                    {[-5.4, 0, 5.4].map((x) => (
                        <g key={x}>
                            <rect
                                x={x - 1.9}
                                y={-3}
                                width={3.8}
                                height={8}
                                rx={1.4}
                                fill="#0f1a21"
                                stroke="#8e9aa4"
                                strokeWidth={0.5}
                            />
                            <rect
                                x={x - 1.1}
                                y={-1.6}
                                width={2.2}
                                height={5}
                                rx={0.9}
                                fill={CYAN}
                            />
                        </g>
                    ))}
                    {[-8, -4.6, -1.2].map((x) => (
                        <polygon
                            key={x}
                            points={`${x},7 ${x + 2},7 ${x + 3.2},5 ${x + 1.2},5`}
                            fill="#e0a52e"
                        />
                    ))}
                    <rect x={5.4} y={5.2} width={3.4} height={1.2} rx={0.5} fill="#cfd7dd" />
                </>
            );
    }
}
