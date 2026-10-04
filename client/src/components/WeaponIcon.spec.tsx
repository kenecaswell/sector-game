import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SHOP_ITEMS } from '../types/shared';
import { ItemIcon } from './ItemIcon';
import { isWeaponId } from './weaponIds';

const WEAPONS = ['basicGun', 'bigGun', 'ammo'] as const;

describe('weapon icons', () => {
    it('are for exactly the weapons in the shop', () => {
        const weapons = Object.values(SHOP_ITEMS)
            .filter((item) => item.category === 'weapons')
            .map((item) => item.id);
        expect(weapons.sort()).toEqual([...WEAPONS].sort());
        for (const id of weapons) expect(isWeaponId(id)).toBe(true);
        expect(isWeaponId('armor')).toBe(false);
        expect(isWeaponId('farm')).toBe(false);
    });

    it.each(WEAPONS)(
        '%s has a picture, in the standard icon box, hidden from screen readers',
        (id) => {
            const { container } = render(<ItemIcon kind="weapon" id={id} />);
            const svg = container.querySelector('svg');
            expect(svg).toHaveAttribute('viewBox', '-12 -12 24 24');
            expect(svg).toHaveAttribute('aria-hidden', 'true');
            expect(container.querySelectorAll('*').length).toBeGreaterThan(6);
        }
    );

    it('the three pictures differ', () => {
        const markup = WEAPONS.map(
            (id) => render(<ItemIcon kind="weapon" id={id} />).container.innerHTML
        );
        expect(new Set(markup).size).toBe(3);
    });

    it("the Ion Cannon throws yellow ion bolts and the Blaster doesn't; both pistols and packs glow cyan", () => {
        const html = (id: (typeof WEAPONS)[number]) =>
            render(<ItemIcon kind="weapon" id={id} />).container.innerHTML;
        expect(html('bigGun')).toContain('#ffd84a');
        expect(html('basicGun')).not.toContain('#ffd84a');
        for (const id of WEAPONS) expect(html(id)).toContain('#39e6ff');
    });

    it('keeps the icon inside its box', () => {
        for (const id of WEAPONS) {
            const { container } = render(<ItemIcon kind="weapon" id={id} />);
            for (const el of Array.from(container.querySelectorAll('rect'))) {
                const x = Number(el.getAttribute('x'));
                const y = Number(el.getAttribute('y'));
                const w = Number(el.getAttribute('width'));
                const h = Number(el.getAttribute('height'));
                expect(x, id).toBeGreaterThanOrEqual(-12);
                expect(x + w, id).toBeLessThanOrEqual(12);
                expect(y, id).toBeGreaterThanOrEqual(-12);
                expect(y + h, id).toBeLessThanOrEqual(12);
            }
        }
    });
});
