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
                    credits: 55,
                })}
                phase="playing"
                phaseEndsAt={0}
            />
        );
        expect(screen.getByText('Health: 140 / 200')).toBeInTheDocument();
        expect(screen.getByText('Gun: Big gun')).toBeInTheDocument();
        expect(screen.getByText('Ammo: 12')).toBeInTheDocument();
        expect(screen.getByText('Tiles: 7')).toBeInTheDocument();
        expect(screen.getByText('Credits: 55')).toBeInTheDocument();
    });

    it('says "none" when unarmed and has nothing to build', () => {
        render(<HUD me={makePlayer()} phase="playing" phaseEndsAt={0} />);
        expect(screen.getByText('Gun: none')).toBeInTheDocument();
        expect(screen.getByText('Structures: none')).toBeInTheDocument();
    });

    it('groups structures by type with counts', () => {
        render(
            <HUD
                me={makePlayer({ structureInventory: ['farm', 'fort', 'farm'] })}
                phase="playing"
                phaseEndsAt={0}
            />
        );
        expect(screen.getByText('Structures: Farm ×2, Fort')).toBeInTheDocument();
    });

    it('lists upgrades only when there are any', () => {
        const { rerender } = render(<HUD me={makePlayer()} phase="playing" phaseEndsAt={0} />);
        expect(screen.queryByText(/Upgrades:/)).not.toBeInTheDocument();
        rerender(
            <HUD
                me={makePlayer({ upgrades: ['boost', 'armor'] })}
                phase="playing"
                phaseEndsAt={0}
            />
        );
        expect(screen.getByText('Upgrades: Speed boost, Armor')).toBeInTheDocument();
    });

    it('never shows negative health', () => {
        render(<HUD me={makePlayer({ health: -20 })} phase="playing" phaseEndsAt={0} />);
        expect(screen.getByText('Health: 0 / 100')).toBeInTheDocument();
    });
});
