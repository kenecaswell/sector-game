import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePlayer } from '../test/factories';
import type { PlayerState } from '../types/gameState';
import { Inventory } from './Inventory';

function show(player: Partial<PlayerState>, { overSolidTerrain = false } = {}) {
    const onEquip = vi.fn();
    const onClose = vi.fn();
    render(
        <Inventory
            player={makePlayer(player)}
            onEquip={onEquip}
            overSolidTerrain={() => overSolidTerrain}
            onClose={onClose}
        />
    );
    return { onEquip, onClose };
}
const section = (name: string) => screen.getByRole('region', { name });
const row = (name: string) => screen.getByRole('group', { name });

afterEach(() => vi.useRealTimers());

describe('Inventory', () => {
    it('shows your gun, ammo and structures', () => {
        show({ gun: 'big', ammo: 42, structureInventory: ['farm', 'fort', 'farm'] });
        expect(within(section('Weapons')).getByText('Big gun')).toBeInTheDocument();
        expect(within(section('Weapons')).getByText('42 ammo')).toBeInTheDocument();
        expect(within(row('Farm')).getByText('×2')).toBeInTheDocument();
        expect(within(row('Fort')).getByText('×1')).toBeInTheDocument();
    });

    it('says when you have nothing', () => {
        show({});
        expect(within(section('Weapons')).getByText('No gun')).toBeInTheDocument();
        expect(within(section('Structures')).getByText('None')).toBeInTheDocument();
        expect(within(section('Upgrades')).getByText('None yet')).toBeInTheDocument();
    });

    it('lists owned slot upgrades with their level, and Armor as always on', () => {
        show({ boosterLevel: 2, wingsLevel: 1, armorLevel: 3, equippedUpgrade: 'booster' });
        expect(row('Booster 2')).toHaveTextContent('150% of normal speed.');
        expect(row('Wings')).toBeInTheDocument();
        expect(row('Armor 3')).toHaveTextContent('Always on');
        expect(within(row('Armor 3')).queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('group', { name: /Expander/ })).not.toBeInTheDocument();
    });

    it('equips an upgrade, and unequipping the equipped one empties the slot', async () => {
        const { onEquip } = show({ boosterLevel: 1, wingsLevel: 1, equippedUpgrade: 'booster' });
        const booster = within(row('Booster 1')).getByRole('button');
        expect(booster).toHaveTextContent('Unequip');
        expect(booster).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(within(row('Wings')).getByRole('button', { name: 'Equip' }));
        expect(onEquip).toHaveBeenLastCalledWith('wings');
        await userEvent.click(booster);
        expect(onEquip).toHaveBeenLastCalledWith('');
    });

    it('disables switching during the cooldown and counts it down', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
        show({
            boosterLevel: 1,
            wingsLevel: 1,
            equippedUpgrade: 'booster',
            upgradeSwitchReadyAt: Date.now() + 3000,
        });
        expect(screen.getByText('You can switch again in 3s.')).toBeInTheDocument();
        expect(within(row('Wings')).getByRole('button')).toBeDisabled();
        act(() => vi.advanceTimersByTime(3100));
        expect(within(row('Wings')).getByRole('button')).toBeEnabled();
        expect(screen.getByText(/One upgrade works at a time/)).toBeInTheDocument();
    });

    it("won't let you take Wings off over a mountain or deep water", () => {
        show(
            { boosterLevel: 1, wingsLevel: 1, equippedUpgrade: 'wings' },
            { overSolidTerrain: true }
        );
        expect(screen.getByText(/can't take Wings off over a mountain/)).toBeInTheDocument();
        expect(within(row('Booster 1')).getByRole('button')).toBeDisabled();
        expect(within(row('Wings')).getByRole('button')).toBeDisabled();
    });

    it('over solid terrain without Wings on, switching is still allowed', () => {
        show(
            { boosterLevel: 1, wingsLevel: 1, equippedUpgrade: 'booster' },
            { overSolidTerrain: true }
        );
        expect(within(row('Wings')).getByRole('button')).toBeEnabled();
    });

    it('closes from the × button and the backdrop, not from inside', async () => {
        const { onClose } = show({});
        await userEvent.click(screen.getByRole('dialog', { name: 'Inventory' }));
        expect(onClose).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Close inventory' }));
        await userEvent.click(screen.getByRole('presentation'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
