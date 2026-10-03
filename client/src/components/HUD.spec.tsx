import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makePlayer } from '../test/factories';
import { HUD } from './HUD';

describe('HUD', () => {
    it("shows the local player's stats, with health as current / max", () => {
        render(
            <HUD
                me={makePlayer({
                    health: 140,
                    maxHealth: 200,
                    gun: 'big',
                    ammo: 12,
                    tilesOwned: 7,
                    materials: 55,
                })}
                phase="playing"
                phaseEndsAt={0}
            />
        );
        expect(screen.getByText('Health: 140 / 200')).toBeInTheDocument();
        expect(screen.getByText('Gun: Big gun')).toBeInTheDocument();
        expect(screen.getByText('Ammo: 12')).toBeInTheDocument();
        expect(screen.getByText('Tiles: 7 / 500')).toBeInTheDocument();
        expect(screen.getByText('Materials: 55')).toBeInTheDocument();
    });

    it('says "none" when unarmed, and leaves structures and upgrades to the inventory bar', () => {
        render(
            <HUD
                me={makePlayer({ structureInventory: ['farm'], boosterLevel: 1 })}
                phase="playing"
                phaseEndsAt={0}
            />
        );
        expect(screen.getByText('Gun: none')).toBeInTheDocument();
        expect(screen.queryByText(/Structures|Upgrade|Farm|Booster/)).not.toBeInTheDocument();
    });

    it('shows the tile limit your farms give you, and warns at it', () => {
        const { rerender } = render(
            <HUD
                me={makePlayer({ tilesOwned: 120, tileCap: 1000 })}
                phase="playing"
                phaseEndsAt={0}
            />
        );
        const tiles = screen.getByText('Tiles: 120 / 1000');
        expect(tiles).not.toHaveStyle({ color: '#ff7675' });
        rerender(
            <HUD
                me={makePlayer({ tilesOwned: 1000, tileCap: 1000 })}
                phase="playing"
                phaseEndsAt={0}
            />
        );
        expect(screen.getByText('Tiles: 1000 / 1000')).toHaveStyle({ color: '#ff7675' });
    });

    it('never shows negative health', () => {
        render(<HUD me={makePlayer({ health: -20 })} phase="playing" phaseEndsAt={0} />);
        expect(screen.getByText('Health: 0 / 100')).toBeInTheDocument();
    });
});
