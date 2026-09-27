import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../test/factories';
import type { PlayerState } from '../types/gameState';
import { SHOP_ITEMS } from '../types/shared';
import { BuyMenu } from './BuyMenu';

/** The buy button in the row for a shop item (rows are groups named after their item). */
function buttonFor(itemName: string) {
    return within(screen.getByRole('group', { name: itemName })).getByRole('button');
}

function renderMenu(player: PlayerState | undefined, onBuy = vi.fn(), onClose = vi.fn()) {
    render(<BuyMenu player={player} onBuy={onBuy} onClose={onClose} />);
    return { onBuy, onClose };
}

describe('BuyMenu', () => {
    it('groups items under Weapons, Upgrades and Structures', () => {
        renderMenu(makePlayer({ credits: 0 }));
        for (const name of ['Weapons', 'Upgrades', 'Structures']) {
            expect(screen.getByRole('region', { name })).toBeInTheDocument();
        }
        const structures = screen.getByRole('region', { name: 'Structures' });
        expect(within(structures).getByText('Power plant')).toBeInTheDocument();
    });

    it('lists Wings under Upgrades, and shows it as Owned once you have it', () => {
        const { unmount } = render(
            <BuyMenu player={makePlayer({ credits: 500 })} onBuy={vi.fn()} onClose={vi.fn()} />
        );
        const upgrades = screen.getByRole('region', { name: 'Upgrades' });
        expect(within(upgrades).getByRole('group', { name: 'Wings' })).toBeInTheDocument();
        expect(buttonFor('Wings')).toHaveTextContent('100 cr');
        unmount();
        renderMenu(makePlayer({ credits: 500, wingsLevel: 1 }));
        expect(buttonFor('Wings')).toHaveTextContent('Max');
    });

    it('shows credits, ammo and your gun at the top', () => {
        renderMenu(makePlayer({ credits: 77, ammo: 9, gun: 'basic' }));
        expect(screen.getByText('Credits: 77')).toBeInTheDocument();
        expect(screen.getByText('Ammo: 9')).toBeInTheDocument();
        expect(screen.getByText('Basic gun', { selector: 'span' })).toBeInTheDocument();
    });

    it('only enables what you can afford', () => {
        renderMenu(makePlayer({ credits: 50 }));
        expect(buttonFor('Ammo pack')).toBeEnabled(); // 30
        expect(buttonFor('Basic gun')).toBeDisabled(); // 100
        expect(buttonFor('Big gun')).toBeDisabled(); // 200
        expect(buttonFor('Basic gun')).toHaveAttribute('title', 'Not enough credits');
    });

    it('shows "Owned" for guns no better than yours, and "Max" for maxed upgrades', () => {
        renderMenu(makePlayer({ credits: 1000, gun: 'big', armorLevel: 3 }));
        expect(buttonFor('Basic gun')).toHaveTextContent('Owned');
        expect(buttonFor('Big gun')).toHaveTextContent('Owned');
        expect(buttonFor('Armor')).toHaveTextContent('Max');
        expect(buttonFor('Armor')).toBeDisabled();
        expect(buttonFor('Booster')).toHaveTextContent(`${SHOP_ITEMS.booster.cost} cr`);
        expect(buttonFor('Farm')).toBeEnabled(); // structures are never "owned"
    });

    it('lists each upgrade once, offering your next level', () => {
        renderMenu(makePlayer({ credits: 1000, boosterLevel: 1, expanderLevel: 2 }));
        const booster = screen.getByRole('group', { name: 'Booster' });
        expect(within(booster).getByText('Booster 2')).toBeInTheDocument();
        expect(within(booster).getByText('150% of normal speed.')).toBeInTheDocument();
        const expander = screen.getByRole('group', { name: 'Expander' });
        expect(within(expander).getByText('Expander 3')).toBeInTheDocument();
        expect(within(expander).getByText(/Claim 37 hexes/)).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Armor' })).toHaveTextContent('Armor 1');
        expect(screen.queryByText('Booster 1')).not.toBeInTheDocument();
    });

    it('buys on click and flashes a check mark', async () => {
        const { onBuy } = renderMenu(makePlayer({ credits: 1000 }));
        await userEvent.click(buttonFor('Farm'));
        expect(onBuy).toHaveBeenCalledWith('farm');
        expect(buttonFor('Farm')).toHaveTextContent('✓');
    });

    it('closes from the × button and from the backdrop, but not from inside the panel', async () => {
        const { onClose } = renderMenu(makePlayer());
        await userEvent.click(screen.getByRole('dialog', { name: 'Shop' }));
        expect(onClose).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Close shop' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole('presentation'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('disables everything before the player has arrived', () => {
        renderMenu(undefined);
        expect(buttonFor('Ammo pack')).toBeDisabled();
    });
});
