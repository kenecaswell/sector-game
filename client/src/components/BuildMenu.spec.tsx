import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../test/factories';
import type { PlayerState } from '../types/gameState';
import { BuildMenu } from './BuildMenu';

/** The buy button in the row for a structure (rows are groups named after it). */
function buyButton(name: string) {
    return within(screen.getByRole('group', { name })).getAllByRole('button')[0];
}

function renderMenu(player: PlayerState | undefined, handlers = {}) {
    const onBuy = vi.fn();
    const onPlace = vi.fn();
    const onClose = vi.fn();
    render(
        <BuildMenu
            player={player}
            onBuy={onBuy}
            onPlace={onPlace}
            onClose={onClose}
            {...handlers}
        />
    );
    return { onBuy, onPlace, onClose };
}

describe('BuildMenu', () => {
    it('lists the four structures with their cost, points and health', () => {
        renderMenu(makePlayer({ materials: 0, character: 'robot' }));
        for (const name of ['Farm', 'Fabricator', 'Guard Tower', 'Power plant']) {
            expect(screen.getByRole('group', { name })).toBeInTheDocument();
            expect(buyButton(name)).toHaveTextContent('100 mat');
        }
        expect(screen.getByRole('group', { name: 'Guard Tower' })).toHaveTextContent(
            '+50 points · 500 health'
        );
        expect(screen.getByRole('group', { name: 'Farm' })).toHaveTextContent(
            '+100 points · 1000 health'
        );
    });

    it("shows a Farmer's farm worth 150 points", () => {
        renderMenu(makePlayer({ character: 'farmer' }));
        expect(screen.getByRole('group', { name: 'Farm' })).toHaveTextContent('+150 points');
        expect(screen.getByRole('group', { name: 'Fabricator' })).toHaveTextContent('+100 points');
    });

    it('shows materials and your tile limit', () => {
        renderMenu(makePlayer({ materials: 42, tilesOwned: 130, tileCap: 1000 }));
        expect(screen.getByText('Materials: 42')).toBeInTheDocument();
        expect(screen.getByText('Tiles: 130 / 1000')).toBeInTheDocument();
    });

    it('needs no Fabricator: it is where you buy the first one', async () => {
        const { onBuy } = renderMenu(makePlayer({ materials: 100, hasFabricator: false }));
        expect(buyButton('Fabricator')).toBeEnabled();
        await userEvent.click(buyButton('Fabricator'));
        expect(onBuy).toHaveBeenCalledWith('fabricator');
        expect(buyButton('Fabricator')).toHaveTextContent('✓');
    });

    it("disables what you can't afford", () => {
        renderMenu(makePlayer({ materials: 99 }));
        expect(buyButton('Farm')).toBeDisabled();
        expect(buyButton('Farm')).toHaveAttribute('title', 'Not enough materials');
    });

    it('offers Place only for structures you hold, and says how many', async () => {
        const { onPlace } = renderMenu(
            makePlayer({ structureInventory: ['guardTower', 'guardTower'] })
        );
        const tower = screen.getByRole('group', { name: 'Guard Tower' });
        expect(tower).toHaveTextContent('You have 2');
        await userEvent.click(within(tower).getByRole('button', { name: 'Place' }));
        expect(onPlace).toHaveBeenCalledWith('guardTower');
        expect(
            within(screen.getByRole('group', { name: 'Farm' })).queryByRole('button', {
                name: 'Place',
            })
        ).not.toBeInTheDocument();
    });

    it('closes from the × button and from the backdrop, but not from inside the panel', async () => {
        const { onClose } = renderMenu(makePlayer());
        await userEvent.click(screen.getByRole('dialog', { name: 'Build' }));
        expect(onClose).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Close build menu' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole('presentation'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
