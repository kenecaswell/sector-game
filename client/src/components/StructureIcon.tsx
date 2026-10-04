import { useId } from 'react';
import type { StructureType } from '../types/shared';

// Small pictures of the four structures for the Build menu and the inventory bar: the same
// buildings as the ones on the map (game/structures), as SVG in a 24 x 24 box centered on the
// origin, standing on a pad of hexes in the owner's color. The cyan and amber are the map art's lights.

const INK = '#1b1b1b';
const CYAN = '#39e6ff';
const AMBER = '#ffb13b';
const NEUTRAL_PAD = '#8a9199'; // when there is no player color to show

export interface StructureIconProps {
    type: StructureType;
    /** The owner's color (a CSS color), for the pad. */
    teamColor?: string;
}

/** The picture for a structure type. */
export function StructureIcon({ type, teamColor = NEUTRAL_PAD }: StructureIconProps) {
    const id = useId();
    return (
        <>
            <Pad color={teamColor} seven={type !== 'guardTower'} />
            {type === 'farm' && <Farm id={id} />}
            {type === 'fabricator' && <Fabricator color={teamColor} />}
            {type === 'guardTower' && <GuardTower color={teamColor} />}
            {type === 'power' && <PowerPlant color={teamColor} />}
        </>
    );
}

// The pad is made of hexes like the map's: seven for a farm, fabricator or power plant, three for
// a tower. Flat-top hexagons of radius PAD_HEX, squashed the way the map is (a little more, to save
// room), so one reads as a tile.
const PAD_HEX = 3.5;
const PAD_SQUASH = 0.55;
const PAD_STEP = Math.sqrt(3) * PAD_HEX; // between neighboring hex centers
const PAD_MIDDLE = 5.9; // where the middle of the pad sits in the icon (y)

/** Hex centers in icon units, back to front. */
function padCenters(seven: boolean): Array<[number, number]> {
    const at = (angle: number, distance: number): [number, number] => [
        distance * Math.cos(angle),
        distance * Math.sin(angle) * PAD_SQUASH,
    ];
    const centers: Array<[number, number]> = seven
        ? [[0, 0], ...[0, 1, 2, 3, 4, 5].map((k) => at(Math.PI / 6 + (k * Math.PI) / 3, PAD_STEP))]
        : [90, 210, 330].map((deg) => at((deg * Math.PI) / 180, PAD_STEP / Math.sqrt(3)));
    return centers.sort((p, q) => p[1] - q[1]);
}

function hexPoints(cx: number, cy: number, dy = 0): string {
    return [0, 1, 2, 3, 4, 5]
        .map((k) => {
            const angle = (k * Math.PI) / 3;
            return `${(cx + PAD_HEX * Math.cos(angle)).toFixed(2)},${(cy + PAD_HEX * Math.sin(angle) * PAD_SQUASH + dy).toFixed(2)}`;
        })
        .join(' ');
}

/** The pad: the hexes a structure covers, in the owner's color, each with a darker side below it. */
function Pad({ color, seven }: { color: string; seven: boolean }) {
    const centers = padCenters(seven);
    return (
        <>
            {centers.map(([x, y]) => (
                <polygon
                    key={`side-${x.toFixed(2)},${y.toFixed(2)}`}
                    points={hexPoints(x, PAD_MIDDLE + y, 1)}
                    fill={color}
                    stroke={INK}
                    strokeWidth={0.5}
                />
            ))}
            {centers.map(([x, y]) => (
                <polygon
                    key={`side-shade-${x.toFixed(2)},${y.toFixed(2)}`}
                    points={hexPoints(x, PAD_MIDDLE + y, 1)}
                    fill="#000"
                    opacity={0.5}
                />
            ))}
            {centers.map(([x, y]) => (
                <g key={`top-${x.toFixed(2)},${y.toFixed(2)}`}>
                    <polygon points={hexPoints(x, PAD_MIDDLE + y)} fill={color} />
                    <polygon points={hexPoints(x, PAD_MIDDLE + y)} fill="#000" opacity={0.38} />
                    <polygon
                        points={hexPoints(x, PAD_MIDDLE + y)}
                        fill="none"
                        stroke={color}
                        strokeWidth={0.7}
                    />
                </g>
            ))}
        </>
    );
}

/** A glass dome of hexagon panels over crops, a barn and a silo, on a steel ring. */
function Farm({ id }: { id: string }) {
    const dome = 'M-8.6,7.4 A8.6,8.6 0 0 1 8.6,7.4 Z';
    // Flat-top hexagons of side 3.2: the panels, centered where a honeycomb would put them.
    const hex = (cx: number, cy: number) =>
        [0, 1, 2, 3, 4, 5]
            .map((k) => {
                const a = (k * Math.PI) / 3;
                return `${(cx + 3.2 * Math.cos(a)).toFixed(2)},${(cy + 3.2 * Math.sin(a)).toFixed(2)}`;
            })
            .join(' ');
    const centers: Array<[number, number, boolean]> = [
        [0, -3.4, false],
        [4.8, -0.63, true],
        [-4.8, -0.63, false],
        [0, 2.14, false],
        [4.8, 4.9, false],
        [-4.8, 4.9, false],
        [9.6, -3.4, false],
        [-9.6, -3.4, false],
    ];
    return (
        <>
            <clipPath id={`${id}-dome`}>
                <path d={dome} />
            </clipPath>
            <g clipPath={`url(#${id}-dome)`}>
                <rect x={-9} y={-2} width={18} height={10} fill="#a7c4b8" opacity={0.25} />
                <rect x={-9} y={5} width={18} height={3} fill="#5e4129" />
                {[-6.5, -3.5, -0.5, 2.5, 5.5].map((x) => (
                    <circle key={x} cx={x} cy={4.7} r={1.3} fill="#4caf50" />
                ))}
                <rect x={-6.6} y={1.2} width={4.4} height={3.8} fill="#b23b30" />
                <polygon points="-7.2,1.4 -4.4,-1 -1.6,1.4" fill="#6a6f76" />
                <rect x={2} y={-0.4} width={2.6} height={5.4} fill="#c4cbd1" />
                <ellipse cx={3.3} cy={-0.4} rx={1.3} ry={0.9} fill="#e8edf0" />
                {centers.map(([cx, cy, solar]) => (
                    <polygon
                        key={`${cx},${cy}`}
                        points={hex(cx, cy)}
                        fill={solar ? '#2c4a6e' : '#bfeee8'}
                        fillOpacity={solar ? 0.8 : 0.16}
                        stroke="#f0faf7"
                        strokeWidth={0.7}
                    />
                ))}
            </g>
            <path d={dome} fill="none" stroke="#f0faf7" strokeWidth={0.9} />
            <rect
                x={-9.8}
                y={7}
                width={19.6}
                height={1.8}
                rx={0.8}
                fill="#aeb8bf"
                stroke={INK}
                strokeWidth={0.5}
            />
        </>
    );
}

/** A low gunmetal hub with a glowing bay and a solar roof, capacitors beside it, and a mast. */
function Fabricator({ color }: { color: string }) {
    return (
        <>
            <line x1={-6.5} y1={-4.4} x2={-6.5} y2={-10.5} stroke="#6a757e" strokeWidth={0.8} />
            <circle cx={-6.5} cy={-10.8} r={0.9} fill="#ff4d3d" />
            {/* Capacitors with glowing rings. */}
            {[
                [7.6, -0.5],
                [10.4, 1.6],
            ].map(([x, y]) => (
                <g key={x}>
                    <rect
                        x={x - 1.4}
                        y={y}
                        width={2.8}
                        height={8.4 - y}
                        fill="#2f373e"
                        stroke={INK}
                        strokeWidth={0.5}
                    />
                    <ellipse cx={x} cy={y} rx={1.4} ry={0.7} fill="#59646d" />
                    <line
                        x1={x - 1.4}
                        y1={y + 2.6}
                        x2={x + 1.4}
                        y2={y + 2.6}
                        stroke={CYAN}
                        strokeWidth={0.7}
                    />
                </g>
            ))}
            {/* The hub, its slanted solar roof, and the team's light strip. */}
            <rect
                x={-11}
                y={-0.4}
                width={17.4}
                height={8}
                fill="#3c444d"
                stroke={INK}
                strokeWidth={0.7}
            />
            <polygon
                points="-11.6,-0.4 -9.2,-4.6 5.4,-4.6 7,-0.4"
                fill="#233349"
                stroke="#6f8199"
                strokeWidth={0.6}
            />
            {[-5, -1.5, 2].map((x) => (
                <line
                    key={x}
                    x1={x}
                    y1={-4.6}
                    x2={x - 0.4}
                    y2={-0.4}
                    stroke="#4e6483"
                    strokeWidth={0.5}
                />
            ))}
            <line x1={-11} y1={0.9} x2={6.4} y2={0.9} stroke={color} strokeWidth={1} />
            {/* The bay. */}
            <rect
                x={-6}
                y={2.3}
                width={8}
                height={5.3}
                rx={1.6}
                fill="#0b1217"
                stroke={CYAN}
                strokeWidth={0.9}
            />
            <line
                x1={-4.6}
                y1={4.4}
                x2={0.6}
                y2={4.4}
                stroke={AMBER}
                strokeWidth={0.6}
                opacity={0.8}
            />
            <line
                x1={-4.6}
                y1={5.9}
                x2={0.6}
                y2={5.9}
                stroke={AMBER}
                strokeWidth={0.6}
                opacity={0.6}
            />
            <line x1={-9.2} y1={3} x2={-9.2} y2={6.6} stroke={CYAN} strokeWidth={0.7} />
            <line x1={3.6} y1={3} x2={3.6} y2={6.6} stroke={CYAN} strokeWidth={0.7} />
        </>
    );
}

/** The sentry tower: lit legs and a truss, a deck, a smoked-glass cabin, a solar canopy and a gun. */
function GuardTower({ color }: { color: string }) {
    return (
        <>
            {/* Legs and the zigzag truss with glowing joints. */}
            <line x1={-7} y1={8.8} x2={-3.8} y2={-1.4} stroke="#2b3238" strokeWidth={1.6} />
            <line x1={7} y1={8.8} x2={3.8} y2={-1.4} stroke="#2b3238" strokeWidth={1.6} />
            <line x1={-7.6} y1={8.8} x2={-4.4} y2={-1.4} stroke="#4b5761" strokeWidth={0.5} />
            <polyline
                points="-6.4,7.6 5.3,3.9 -4.4,0.6 3.9,-1"
                fill="none"
                stroke="#8a97a3"
                strokeWidth={0.8}
            />
            <circle cx={5.3} cy={3.9} r={0.8} fill={CYAN} />
            <circle cx={-4.4} cy={0.6} r={0.8} fill={CYAN} />
            {/* The deck, lit in the team's color, and the lift capsule on the front. */}
            <rect
                x={-6}
                y={-2.6}
                width={12}
                height={1.5}
                fill="#2a3138"
                stroke={INK}
                strokeWidth={0.5}
            />
            <line x1={-6} y1={-1.6} x2={6} y2={-1.6} stroke={color} strokeWidth={0.9} />
            <rect
                x={-0.9}
                y={3.4}
                width={1.8}
                height={2.6}
                rx={0.5}
                fill="#e8edf0"
                stroke={INK}
                strokeWidth={0.4}
            />
            {/* The cabin: pale panels round a band of smoked glass with a cyan line. */}
            <rect
                x={-4.6}
                y={-7}
                width={9.2}
                height={4.4}
                fill="#cfd7dd"
                stroke={INK}
                strokeWidth={0.6}
            />
            <rect x={-4.6} y={-5.9} width={9.2} height={2.1} fill="#10202a" />
            <line x1={-4.2} y1={-4.9} x2={4.2} y2={-4.9} stroke={CYAN} strokeWidth={0.7} />
            {/* The solar canopy, its rim, and the sensor dome and mast. */}
            <polygon
                points="-8.8,-7 -6.4,-9.2 6.4,-9.2 8.8,-7"
                fill="#203a63"
                stroke={CYAN}
                strokeWidth={0.8}
            />
            <ellipse
                cx={0}
                cy={-9.3}
                rx={2.2}
                ry={1.2}
                fill="#f2f5f7"
                stroke={INK}
                strokeWidth={0.4}
            />
            <line x1={0} y1={-10.2} x2={0} y2={-12} stroke="#6f7b85" strokeWidth={0.7} />
            <circle cx={0} cy={-12} r={0.7} fill="#ff4d3d" />
            {/* The rail gun on the front right. */}
            <circle cx={5} cy={-2.2} r={1.5} fill="#d6dde2" stroke={INK} strokeWidth={0.5} />
            <line x1={5} y1={-2} x2={8.4} y2={0.4} stroke={INK} strokeWidth={1.7} />
            <line x1={5} y1={-2} x2={8.4} y2={0.4} stroke="#8e9aa4" strokeWidth={0.8} />
            <circle cx={7} cy={-0.7} r={0.5} fill={CYAN} />
        </>
    );
}

/** Three stainless vessels and a wide tank joined by a pipe, and a thin stack with dark smoke. */
function PowerPlant({ color }: { color: string }) {
    const vessels: Array<[number, number]> = [
        [-8.4, -3.6],
        [-4.6, -7],
        [-0.8, -5],
    ];
    return (
        <>
            <circle cx={9.6} cy={-9.2} r={1.9} fill="#2b211b" opacity={0.85} />
            <circle cx={8.3} cy={-11} r={1.4} fill="#3a2b21" opacity={0.7} />
            <rect
                x={9.2}
                y={-7.6}
                width={1.3}
                height={15.6}
                fill="#3d474f"
                stroke={INK}
                strokeWidth={0.4}
            />
            <rect x={9.2} y={-6.4} width={1.3} height={1.6} fill={CYAN} />
            {vessels.map(([x, top]) => (
                <g key={x}>
                    <rect
                        x={x - 1.8}
                        y={top}
                        width={3.6}
                        height={8 - top}
                        rx={1.6}
                        fill="#c9d0d6"
                        stroke="#6c7882"
                        strokeWidth={0.6}
                    />
                    <line
                        x1={x + 0.9}
                        y1={top + 2.2}
                        x2={x + 0.9}
                        y2={7}
                        stroke={CYAN}
                        strokeWidth={0.7}
                    />
                    <line
                        x1={x - 1}
                        y1={top + 1.6}
                        x2={x - 1}
                        y2={7}
                        stroke="#f4f7f9"
                        strokeWidth={0.5}
                        opacity={0.7}
                    />
                </g>
            ))}
            {/* A catwalk ring round them, and the pipe to the tank. */}
            <path d="M-11,0.6 Q-5,2.8 1,0.6" fill="none" stroke="#3a434b" strokeWidth={1} />
            <line x1={-8.4} y1={3.6} x2={5} y2={3.6} stroke={INK} strokeWidth={2} />
            <line x1={-8.4} y1={3.6} x2={5} y2={3.6} stroke="#c0c8ce" strokeWidth={1} />
            <rect
                x={3.4}
                y={-1.4}
                width={5}
                height={9.4}
                rx={1.6}
                fill="#c9d0d6"
                stroke="#6c7882"
                strokeWidth={0.6}
            />
            <rect x={3.4} y={2} width={5} height={1.8} fill={color} />
            <line x1={7.3} y1={-0.2} x2={7.3} y2={1.4} stroke={CYAN} strokeWidth={0.6} />
        </>
    );
}
