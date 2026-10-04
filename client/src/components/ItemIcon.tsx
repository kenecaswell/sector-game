import { UPGRADE_ICON_COLORS } from '../game/constants';
import type { StructureType, UpgradeId } from '../types/shared';
import { StructureIcon } from './StructureIcon';
import { WeaponArt } from './WeaponIcon';
import type { WeaponId } from './weaponIds';

// Icons for the on-screen inventory and the Build menu. A structure is a small picture of its
// building on a pad in the owner's color (StructureIcon); each upgrade is drawn as a little picture
// of itself: a jet engine with a blue flame (Booster), a tracked harvester (Harvester), a knight's
// breastplate (Armor) and a jetpack (Jetpack); and each weapon a picture of itself (WeaponIcon: a
// Blaster, an Ion Cannon, an ammo pack). All are SVG in a 24 x 24 box centered on the origin.

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

export type ItemIconProps =
    | { kind: 'structure'; id: StructureType; size?: number; teamColor?: string }
    | { kind: 'upgrade'; id: UpgradeId; size?: number }
    | { kind: 'weapon'; id: WeaponId; size?: number };

export function ItemIcon(props: ItemIconProps) {
    const size = props.size ?? 30;
    return (
        <svg
            width={size}
            height={size}
            viewBox="-12 -12 24 24"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
        >
            {props.kind === 'structure' ? (
                <StructureIcon type={props.id} teamColor={props.teamColor} />
            ) : props.kind === 'weapon' ? (
                <WeaponArt id={props.id} />
            ) : (
                <UpgradeArt id={props.id} />
            )}
        </svg>
    );
}

const INK = '#1b1b1b';
const STROKE = 1.1;

/** The picture for an upgrade, drawn in the 24 x 24 box of `ItemIcon`'s SVG. */
function UpgradeArt({ id }: { id: UpgradeId }) {
    const color = css(UPGRADE_ICON_COLORS[id] ?? 0xffffff);
    switch (id) {
        case 'booster':
            // A jet engine pointing left: intake ring, casing, nozzle, and a blue burn behind it.
            return (
                <>
                    <polygon points="4,-4.2 10,-3.2 12.5,0 10,3.2 4,4.2 6.5,0" fill="#2f7bff" />
                    <polygon points="4,-2.7 9.5,-1.6 11.4,0 9.5,1.6 4,2.7 6,0" fill="#8fd0ff" />
                    <polygon points="4.5,-1.1 8.2,0 4.5,1.1" fill="#ffffff" />
                    <polygon
                        points="0,-3.4 4,-4.4 4,4.4 0,3.4"
                        fill="#6b7680"
                        stroke={INK}
                        strokeWidth={STROKE}
                    />
                    <rect
                        x={-9.5}
                        y={-5.6}
                        width={10.5}
                        height={11.2}
                        rx={3}
                        fill={color}
                        stroke={INK}
                        strokeWidth={STROKE}
                    />
                    <ellipse
                        cx={-9.5}
                        cy={0}
                        rx={2.6}
                        ry={5.6}
                        fill="#2b3036"
                        stroke={INK}
                        strokeWidth={STROKE}
                    />
                    <ellipse cx={-9.7} cy={0} rx={1.2} ry={3.3} fill="#7e8a95" />
                    <path
                        d="M-4.2,-5.3 Q-2.2,0 -4.2,5.3"
                        fill="none"
                        stroke="#9a968a"
                        strokeWidth={0.9}
                    />
                    <path
                        d="M-0.4,-5.3 Q1.6,0 -0.4,5.3"
                        fill="none"
                        stroke="#9a968a"
                        strokeWidth={0.9}
                    />
                </>
            );
        case 'expander':
            // A tracked harvester: a scoop in front, a cab on a body, caterpillar tracks.
            return (
                <>
                    <polygon
                        points="-12,-3 -7,-3 -7,5 -10,5"
                        fill="#c9d3d8"
                        stroke={INK}
                        strokeWidth={STROKE}
                    />
                    <rect x={5} y={-9} width={1.8} height={5} fill="#555" />
                    <rect
                        x={-7}
                        y={-3}
                        width={15}
                        height={7}
                        rx={1.5}
                        fill={color}
                        stroke={INK}
                        strokeWidth={STROKE}
                    />
                    <rect
                        x={-1}
                        y={-9}
                        width={8}
                        height={6.5}
                        rx={1.2}
                        fill={color}
                        stroke={INK}
                        strokeWidth={STROKE}
                    />
                    <rect x={1} y={-7.6} width={4.6} height={3.2} rx={0.6} fill="#bfe9ff" />
                    <rect
                        x={-8.5}
                        y={3}
                        width={19}
                        height={6.5}
                        rx={3.2}
                        fill="#33373b"
                        stroke={INK}
                        strokeWidth={STROKE}
                    />
                    {[-5, -0.5, 4, 8].map((x) => (
                        <circle key={x} cx={x} cy={6.25} r={1.5} fill="#8b949b" />
                    ))}
                </>
            );
        case 'armor':
            // A cuirass: a torso-shaped breastplate with a neck opening, armholes, a ridge down the
            // middle, a waist band, a flared lower edge and rivets.
            return (
                <>
                    <path
                        d="M-3,-10 Q0,-7.6 3,-10 L8.2,-8.6 Q10.4,-5.6 6.8,-2.6 Q5.8,0 5.8,3 L7.6,9 Q0,11.6 -7.6,9 L-5.8,3 Q-5.8,0 -6.8,-2.6 Q-10.4,-5.6 -8.2,-8.6 Z"
                        fill={color}
                        stroke={INK}
                        strokeWidth={STROKE}
                        strokeLinejoin="round"
                    />
                    <path d="M0,-6.5 L0,10" stroke="#5d6a73" strokeWidth={1} />
                    <path
                        d="M-5.6,-3 Q-2.5,-0.8 0,-1.6 Q2.5,-0.8 5.6,-3"
                        stroke="#5d6a73"
                        strokeWidth={0.9}
                        fill="none"
                    />
                    <path
                        d="M-5.9,3.2 Q0,5 5.9,3.2"
                        stroke="#5d6a73"
                        strokeWidth={1.1}
                        fill="none"
                    />
                    <path
                        d="M-6.8,-8.2 Q-4.6,-9.2 -3.6,-8"
                        stroke="#fff"
                        strokeWidth={0.9}
                        fill="none"
                        opacity={0.7}
                    />
                    {[
                        [-3.4, -4.6],
                        [3.4, -4.6],
                        [-4.4, 6.6],
                        [4.4, 6.6],
                    ].map(([x, y]) => (
                        <circle
                            key={`${x},${y}`}
                            cx={x}
                            cy={y}
                            r={0.8}
                            fill="#dfe6ea"
                            stroke={INK}
                            strokeWidth={0.4}
                        />
                    ))}
                </>
            );
        case 'wings':
            // A jetpack: two matte slate fuel tanks almost touching, a strap, nozzles and small flames.
            return (
                <>
                    {[-3.9, 3.9].map((x) => (
                        <g key={x}>
                            <polygon
                                points={`${x - 1.6},6 ${x + 1.6},6 ${x + 1},10.5 ${x},12 ${x - 1},10.5`}
                                fill="#ff9d2e"
                            />
                            <rect
                                x={x - 3.6}
                                y={-9}
                                width={7.2}
                                height={14}
                                rx={3.2}
                                fill={color}
                                stroke={INK}
                                strokeWidth={STROKE}
                            />
                            <rect
                                x={x - 2.4}
                                y={-9.8}
                                width={4.8}
                                height={2}
                                rx={1}
                                fill="#8b949b"
                                stroke={INK}
                                strokeWidth={0.7}
                            />
                            <rect
                                x={x - 2}
                                y={5}
                                width={4}
                                height={2}
                                fill="#3b3f44"
                                stroke={INK}
                                strokeWidth={0.7}
                            />
                            <path
                                d={`M${x - 2},-6 L${x - 2},2`}
                                stroke="#9aa7b0"
                                strokeWidth={0.8}
                                opacity={0.5}
                            />
                        </g>
                    ))}
                    <rect
                        x={-8}
                        y={-3}
                        width={16}
                        height={2.8}
                        fill="#4a3a2e"
                        stroke={INK}
                        strokeWidth={0.8}
                    />
                </>
            );
    }
}
