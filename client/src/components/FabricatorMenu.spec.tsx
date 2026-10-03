import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../test/factories';
import type { PlayerState } from '../types/gameState';
import { SHOP_ITEMS } from '../types/shared';
import { FabricatorMenu } from './FabricatorMenu';

/** The fabricate button in the row for an item (rows are groups named after their item). */
function buttonFor(itemName: string) {
    return within(screen.getByRole('group', { name: itemName })).getByRole('button');
}

function renderMenu(player: PlayerState | undefined, onFabricate = vi.fn(), onClose = vi.fn()) {
    render(<FabricatorMenu player={player} onFabricate={onFabricate} onClose={onClose} />);
    return { onFabricate, onClose };
}

describe('FabricatorMenu', () => {
    it('groups items under Weapons and Upgrades; structures are in the Build menu instead', () => {
        renderMenu(makePlayer({ materials: 0 }));
        for (const name of ['Weapons', 'Upgrades']) {
            expect(screen.getByRole('region', { name })).toBeInTheDocument();
        }
        expect(screen.queryByRole('region', { name: 'Structures' })).not.toBeInTheDocument();
        expect(screen.queryByText('Power plant')).not.toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Farm' })).not.toBeInTheDocument();
    });

    it('lists the Jetpack under Upgrades, and shows it as Owned once you have it', () => {
        const { unmount } = render(
            <FabricatorMenu
                player={makePlayer({ materials: 500 })}
                onFabricate={vi.fn()}
                onClose={vi.fn()}
            />
        );
        const upgrades = screen.getByRole('region', { name: 'Upgrades' });
        expect(within(upgrades).getByRole('group', { name: 'Jetpack' })).toBeInTheDocument();
        expect(buttonFor('Jetpack')).toHaveTextContent('200 mat');
        unmount();
        renderMenu(makePlayer({ materials: 500, wingsLevel: 1 }));
        expect(buttonFor('Jetpack')).toHaveTextContent('Max');
    });

    it('shows materials, ammo and your gun at the top', () => {
        renderMenu(makePlayer({ materials: 77, ammo: 9, gun: 'basic' }));
        expect(screen.getByText('Materials: 77')).toBeInTheDocument();
        expect(screen.getByText('Ammo: 9')).toBeInTheDocument();
        expect(screen.getByText('Blaster', { selector: 'span' })).toBeInTheDocument();
    });

    it('only enables what you can afford', () => {
        renderMenu(makePlayer({ materials: 100 }));
        expect(buttonFor('Ammo pack')).toBeEnabled(); // 60
        expect(buttonFor('Booster')).toBeEnabled(); // 100
        expect(buttonFor('Blaster')).toBeDisabled(); // 200
        expect(buttonFor('Ion Cannon')).toBeDisabled(); // 400
        expect(buttonFor('Blaster')).toHaveAttribute('title', 'Not enough materials');
    });

    it('shows "Owned" for guns no better than yours, and "Max" for maxed upgrades', () => {
        renderMenu(makePlayer({ materials: 1000, gun: 'big', armorLevel: 3 }));
        expect(buttonFor('Blaster')).toHaveTextContent('Owned');
        expect(buttonFor('Ion Cannon')).toHaveTextContent('Owned');
        expect(buttonFor('Armor')).toHaveTextContent('Max');
        expect(buttonFor('Armor')).toBeDisabled();
        expect(buttonFor('Booster')).toHaveTextContent(`${SHOP_ITEMS.booster.cost} mat`);
    });

    it('lists each upgrade once, offering your next level', () => {
        renderMenu(makePlayer({ materials: 1000, boosterLevel: 1, expanderLevel: 2 }));
        const booster = screen.getByRole('group', { name: 'Booster' });
        expect(within(booster).getByText('Booster 2')).toBeInTheDocument();
        expect(within(booster).getByText('166% of normal speed.')).toBeInTheDocument();
        const expander = screen.getByRole('group', { name: 'Harvester' });
        expect(within(expander).getByText('Harvester 3')).toBeInTheDocument();
        expect(within(expander).getByText(/Claim 37 hexes/)).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Armor' })).toHaveTextContent('Armor 1');
        expect(screen.queryByText('Booster 1')).not.toBeInTheDocument();
    });

    it('fabricates on click and flashes a check mark', async () => {
        const { onFabricate } = renderMenu(makePlayer({ materials: 1000 }));
        await userEvent.click(buttonFor('Booster'));
        expect(onFabricate).toHaveBeenCalledWith('booster');
        expect(buttonFor('Booster')).toHaveTextContent('✓');
    });

    it('closes from the × button and from the backdrop, but not from inside the panel', async () => {
        const { onClose } = renderMenu(makePlayer());
        await userEvent.click(screen.getByRole('dialog', { name: 'Fabricator' }));
        expect(onClose).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Close fabricator' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole('presentation'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('disables everything before the player has arrived', () => {
        renderMenu(undefined);
        expect(buttonFor('Ammo pack')).toBeDisabled();
    });
});
