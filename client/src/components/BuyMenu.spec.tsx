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

    it('shows "Owned" for upgrades you have and guns that are no better than yours', () => {
        renderMenu(makePlayer({ credits: 1000, gun: 'big', upgrades: ['armor'] }));
        expect(buttonFor('Basic gun')).toHaveTextContent('Owned');
        expect(buttonFor('Big gun')).toHaveTextContent('Owned');
        expect(buttonFor('Armor')).toHaveTextContent('Owned');
        expect(buttonFor('Armor')).toBeDisabled();
        expect(buttonFor('Speed boost')).toHaveTextContent(`${SHOP_ITEMS.boost.cost} cr`);
        expect(buttonFor('Farm')).toBeEnabled(); // structures are never "owned"
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
