import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STRUCTURE_TYPES } from '../types/shared';
import { ItemIcon } from './ItemIcon';

/** The fill colors of an icon's shapes, as the browser sees them. */
function fills(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('[fill]')).map(
        (el) => el.getAttribute('fill') ?? ''
    );
}

describe('structure icons', () => {
    it.each(STRUCTURE_TYPES)('%s has a picture of its own, hidden from screen readers', (type) => {
        const { container } = render(<ItemIcon kind="structure" id={type} />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg).toHaveAttribute('viewBox', '-12 -12 24 24');
        expect(container.querySelectorAll('*').length).toBeGreaterThan(12);
    });

    it('the four pictures differ', () => {
        const markup = STRUCTURE_TYPES.map(
            (type) => render(<ItemIcon kind="structure" id={type} />).container.innerHTML
        );
        expect(new Set(markup).size).toBe(4);
    });

    it.each(STRUCTURE_TYPES)("%s stands on a pad in the player's color", (type) => {
        const { container } = render(<ItemIcon kind="structure" id={type} teamColor="#3498db" />);
        expect(fills(container)).toContain('#3498db');
        const other = render(<ItemIcon kind="structure" id={type} teamColor="#e74c3c" />).container;
        expect(fills(other)).toContain('#e74c3c');
        expect(fills(other)).not.toContain('#3498db');
    });

    it('stands on a pad of hexes: seven under a farm, fabricator or power plant, three under a tower', () => {
        // Each hex is two six-cornered shapes in the player's color: its side and its top.
        const hexes = (type: (typeof STRUCTURE_TYPES)[number]) => {
            const { container } = render(
                <ItemIcon kind="structure" id={type} teamColor="#3498db" />
            );
            return Array.from(container.querySelectorAll('polygon')).filter(
                (p) =>
                    p.getAttribute('fill') === '#3498db' &&
                    (p.getAttribute('points') ?? '').trim().split(/\s+/).length === 6
            ).length;
        };
        expect(hexes('farm')).toBe(14);
        expect(hexes('fabricator')).toBe(14);
        expect(hexes('power')).toBe(14);
        expect(hexes('guardTower')).toBe(6);
    });

    it('keeps the pad inside the icon box (the dome clips its own edge panels)', () => {
        for (const type of STRUCTURE_TYPES) {
            const { container } = render(
                <ItemIcon kind="structure" id={type} teamColor="#3498db" />
            );
            const pad = Array.from(container.querySelectorAll('polygon')).filter(
                (p) => p.getAttribute('fill') === '#3498db'
            );
            expect(pad.length, type).toBeGreaterThan(0);
            for (const p of pad) {
                for (const pair of (p.getAttribute('points') ?? '').trim().split(/\s+/)) {
                    const [x, y] = pair.split(',').map(Number);
                    expect(Math.abs(x), type).toBeLessThanOrEqual(12);
                    expect(y, type).toBeLessThanOrEqual(12);
                }
            }
        }
    });

    it('uses a neutral gray pad when there is no player color', () => {
        const { container } = render(<ItemIcon kind="structure" id="farm" />);
        expect(fills(container)).toContain('#8a9199');
    });

    it('keeps its size when squeezed by a flex row (the menu text must line up)', () => {
        const { container } = render(<ItemIcon kind="structure" id="power" size={36} />);
        const svg = container.querySelector('svg') as SVGElement;
        expect(svg).toHaveAttribute('width', '36');
        expect(svg.style.flexShrink).toBe('0');
    });

    it('two farm icons on one page do not share a clip path id', () => {
        const { container } = render(
            <>
                <ItemIcon kind="structure" id="farm" />
                <ItemIcon kind="structure" id="farm" />
            </>
        );
        const ids = Array.from(container.querySelectorAll('clipPath')).map((el) => el.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
    });

    it('upgrade icons are unchanged and take no team color', () => {
        const { container } = render(<ItemIcon kind="upgrade" id="armor" />);
        expect(container.querySelector('svg')).toBeInTheDocument();
        expect(container.querySelector('clipPath')).toBeNull();
    });
});
