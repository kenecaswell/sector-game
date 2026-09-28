import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../test/factories';
import type { PlayerState } from '../types/gameState';
import type { StructureType } from '../types/shared';
import { InventoryBar } from './InventoryBar';

function show(
    player: Partial<PlayerState> | undefined,
    {
        building,
        overSolidTerrain = () => false,
    }: {
        building?: StructureType;
        overSolidTerrain?: () => boolean;
    } = {}
) {
    const onBuild = vi.fn();
    const onEquip = vi.fn();
    render(
        <InventoryBar
            player={player && makePlayer(player)}
            building={building}
            onBuild={onBuild}
            onEquip={onEquip}
            overSolidTerrain={overSolidTerrain}
        />
    );
    return { onBuild, onEquip };
}

afterEach(() => vi.useRealTimers());

describe('InventoryBar', () => {
    it('shows nothing when you hold no structures or upgrades', () => {
        show({});
        expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
        show(undefined);
        expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });

    it('shows one icon per structure type with its count; clicking one builds it', async () => {
        const { onBuild } = show({ structureInventory: ['fort', 'farm', 'farm'] });
        const farm = screen.getByRole('button', { name: 'Build Farm' });
        expect(farm).toHaveTextContent('2');
        expect(screen.getByRole('button', { name: 'Build Fort' })).toHaveTextContent('1');
        // In the catalog's order, whatever order they were picked up in.
        const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
        expect(names).toEqual(['Build Farm', 'Build Fort']);
        await userEvent.click(farm);
        expect(onBuild).toHaveBeenCalledWith('farm');
    });

    it('marks the structure being built; clicking it again asks to stop', async () => {
        const { onBuild } = show({ structureInventory: ['farm'] }, { building: 'farm' });
        const farm = screen.getByRole('button', { name: 'Stop building Farm' });
        expect(farm).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(farm);
        expect(onBuild).toHaveBeenCalledWith('farm');
    });

    it('upgrades: click to switch; the one in use is marked and disabled; Armor is always on', async () => {
        const { onEquip } = show({
            boosterLevel: 2,
            wingsLevel: 1,
            armorLevel: 3,
            equippedUpgrade: 'booster',
        });
        const booster = screen.getByRole('button', { name: 'Booster 2, in use' });
        expect(booster).toBeDisabled();
        expect(booster).toHaveTextContent('2'); // level badge
        expect(screen.getByRole('button', { name: 'Armor 3' })).toBeDisabled();
        const wings = screen.getByRole('button', { name: 'Switch to Wings' });
        expect(wings).not.toHaveTextContent(/\d/); // one level, no badge
        await userEvent.click(wings);
        expect(onEquip).toHaveBeenCalledWith('wings');
    });

    it("won't switch off Wings over a mountain or deep water, re-checking as you move", () => {
        vi.useFakeTimers();
        let overMountain = true;
        show(
            { boosterLevel: 1, wingsLevel: 1, equippedUpgrade: 'wings' },
            { overSolidTerrain: () => overMountain }
        );
        expect(screen.getByRole('button', { name: 'Switch to Booster 1' })).toBeDisabled();
        overMountain = false;
        act(() => vi.advanceTimersByTime(250));
        expect(screen.getByRole('button', { name: 'Switch to Booster 1' })).toBeEnabled();
    });
});
