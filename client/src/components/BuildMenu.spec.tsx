import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../test/factories';
import type { PlayerState } from '../types/gameState';
import { BuildMenu, type BuildMenuProps } from './BuildMenu';

/** The buy button in the row for a structure (rows are groups named after it). */
function buyButton(name: string) {
    return within(screen.getByRole('group', { name })).getAllByRole('button')[0];
}

function renderMenu(player: PlayerState | undefined, handlers: Partial<BuildMenuProps> = {}) {
    const onBuy = vi.fn();
    const onPlace = vi.fn();
    const onClose = vi.fn();
    const onTabChange = vi.fn();
    const onFabricate = vi.fn();
    const view = render(
        <BuildMenu
            player={player}
            tab="structures"
            onTabChange={onTabChange}
            onFabricate={onFabricate}
            onBuy={onBuy}
            onPlace={onPlace}
            onClose={onClose}
            {...handlers}
        />
    );
    return { onBuy, onPlace, onClose, onTabChange, onFabricate, ...view };
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

    it("shows an Engineer's fabricator and a Scientist's power plant worth 150 points", () => {
        const { unmount } = renderMenu(makePlayer({ character: 'engineer' }));
        expect(screen.getByRole('group', { name: 'Fabricator' })).toHaveTextContent('+150 points');
        expect(screen.getByRole('group', { name: 'Farm' })).toHaveTextContent('+100 points');
        unmount();
        renderMenu(makePlayer({ character: 'scientist' }));
        expect(screen.getByRole('group', { name: 'Power plant' })).toHaveTextContent('+150 points');
        expect(screen.getByRole('group', { name: 'Fabricator' })).toHaveTextContent('+100 points');
    });

    it('shows the Guard Tower limit, counting built and held towers, and stops buying at it', () => {
        const { unmount } = renderMenu(
            makePlayer({
                materials: 500,
                towersBuilt: 7,
                structureInventory: ['guardTower', 'guardTower'],
            }),
            { towerLimit: 10 }
        );
        const tower = screen.getByRole('group', { name: 'Guard Tower' });
        expect(tower).toHaveTextContent('9 / 10 allowed');
        expect(buyButton('Guard Tower')).toBeEnabled();
        unmount();

        renderMenu(
            makePlayer({
                materials: 500,
                towersBuilt: 8,
                structureInventory: ['guardTower', 'guardTower'],
            }),
            { towerLimit: 10 }
        );
        expect(screen.getByRole('group', { name: 'Guard Tower' })).toHaveTextContent(
            '10 / 10 allowed'
        );
        expect(buyButton('Guard Tower')).toBeDisabled();
        expect(buyButton('Guard Tower')).toHaveAttribute(
            'title',
            'You can have at most 10 Guard Towers'
        );
        expect(buyButton('Farm')).toBeEnabled(); // other structures are not limited
    });

    it('shows no limit when none is given', () => {
        renderMenu(makePlayer({ materials: 500, towersBuilt: 99 }));
        expect(screen.getByRole('group', { name: 'Guard Tower' })).not.toHaveTextContent('allowed');
        expect(buyButton('Guard Tower')).toBeEnabled();
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

    describe('tabs', () => {
        const withFabricator = (overrides = {}) =>
            makePlayer({ materials: 500, hasFabricator: true, ...overrides });

        it('has Structures and Upgrades tabs, Structures selected first', () => {
            renderMenu(withFabricator());
            expect(screen.getByRole('tab', { name: 'Structures' })).toHaveAttribute(
                'aria-selected',
                'true'
            );
            expect(screen.getByRole('tab', { name: 'Upgrades' })).toHaveAttribute(
                'aria-selected',
                'false'
            );
            expect(screen.getByRole('tabpanel', { name: 'Structures' })).toBeInTheDocument();
            expect(screen.queryByRole('tabpanel', { name: 'Upgrades' })).not.toBeInTheDocument();
        });

        it('shows the guns, ammo and upgrades on the Upgrades tab, and fabricates from it', async () => {
            const { onFabricate } = renderMenu(withFabricator(), { tab: 'upgrades' });
            expect(screen.getByRole('tab', { name: 'Upgrades' })).toHaveAttribute(
                'aria-selected',
                'true'
            );
            expect(screen.getByRole('tabpanel', { name: 'Upgrades' })).toBeInTheDocument();
            expect(screen.queryByRole('tabpanel', { name: 'Structures' })).not.toBeInTheDocument();
            for (const name of ['Blaster', 'Ion Cannon', 'Ammo pack', 'Booster', 'Jetpack']) {
                expect(screen.getByRole('group', { name })).toBeInTheDocument();
            }
            await userEvent.click(
                within(screen.getByRole('group', { name: 'Booster' })).getByRole('button')
            );
            expect(onFabricate).toHaveBeenCalledWith('booster');
        });

        it('keeps materials and the tile limit on show on both tabs', () => {
            renderMenu(withFabricator({ materials: 42, tilesOwned: 7, tileCap: 500 }), {
                tab: 'upgrades',
            });
            expect(screen.getByText('Materials: 42')).toBeInTheDocument();
            expect(screen.getByText('Tiles: 7 / 500')).toBeInTheDocument();
        });

        it('clicking a tab asks to switch to it', async () => {
            const { onTabChange } = renderMenu(withFabricator());
            await userEvent.click(screen.getByRole('tab', { name: 'Upgrades' }));
            expect(onTabChange).toHaveBeenCalledWith('upgrades');
        });

        it('grays out Upgrades until you own a Fabricator, and shows Structures even if asked for Upgrades', async () => {
            const { onTabChange } = renderMenu(makePlayer({ hasFabricator: false }), {
                tab: 'upgrades',
            });
            const tab = screen.getByRole('tab', { name: 'Upgrades' });
            expect(tab).toBeDisabled();
            expect(tab).toHaveAttribute('title', 'Build a Fabricator to unlock this');
            expect(screen.getByRole('tabpanel', { name: 'Structures' })).toBeInTheDocument();
            expect(
                screen.getByText(/Build a Fabricator to unlock the Upgrades tab/)
            ).toBeInTheDocument();
            await userEvent.click(tab);
            expect(onTabChange).not.toHaveBeenCalled();
        });

        it('falls back to Structures if your Fabricator is destroyed while Upgrades is showing', () => {
            const { rerender } = render(
                <BuildMenu
                    player={withFabricator()}
                    tab="upgrades"
                    onTabChange={vi.fn()}
                    onFabricate={vi.fn()}
                    onBuy={vi.fn()}
                    onPlace={vi.fn()}
                    onClose={vi.fn()}
                />
            );
            expect(screen.getByRole('tabpanel', { name: 'Upgrades' })).toBeInTheDocument();
            rerender(
                <BuildMenu
                    player={withFabricator({ hasFabricator: false })}
                    tab="upgrades"
                    onTabChange={vi.fn()}
                    onFabricate={vi.fn()}
                    onBuy={vi.fn()}
                    onPlace={vi.fn()}
                    onClose={vi.fn()}
                />
            );
            expect(screen.getByRole('tabpanel', { name: 'Structures' })).toBeInTheDocument();
        });
    });
});
