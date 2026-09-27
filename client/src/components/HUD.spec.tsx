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
        expect(screen.getByText('Tiles: 7')).toBeInTheDocument();
        expect(screen.getByText('Materials: 55')).toBeInTheDocument();
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

    it('shows the equipped upgrade with its level, and Armor when owned', () => {
        const { rerender } = render(<HUD me={makePlayer()} phase="playing" phaseEndsAt={0} />);
        expect(screen.getByText('Upgrade: none')).toBeInTheDocument();
        expect(screen.queryByText(/Armor/)).not.toBeInTheDocument();
        rerender(
            <HUD
                me={makePlayer({
                    boosterLevel: 2,
                    wingsLevel: 1,
                    equippedUpgrade: 'booster',
                    armorLevel: 3,
                })}
                phase="playing"
                phaseEndsAt={0}
            />
        );
        expect(screen.getByText('Upgrade: Booster 2')).toBeInTheDocument();
        expect(screen.getByText('Armor 3')).toBeInTheDocument();
    });

    it('never shows negative health', () => {
        render(<HUD me={makePlayer({ health: -20 })} phase="playing" phaseEndsAt={0} />);
        expect(screen.getByText('Health: 0 / 100')).toBeInTheDocument();
    });
});
