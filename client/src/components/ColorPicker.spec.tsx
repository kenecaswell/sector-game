import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TEAMS, TEAM_IDS, type TeamId } from '../types/shared';
import { COLOR_PICKER_CSS, ColorPicker, type ColorPickerProps } from './ColorPicker';

function show(props: Partial<ColorPickerProps> = {}) {
    const onChange = vi.fn();
    render(
        <ColorPicker
            value="red"
            heading="Color"
            label="Color"
            counts={new Map()}
            exclusive={true}
            onChange={onChange}
            {...props}
        />
    );
    return { onChange, trigger: screen.getAllByRole('button')[0] };
}

describe('ColorPicker', () => {
    it('starts closed: just a swatch in the current color', () => {
        const { trigger } = show({ value: 'blue' });
        expect(trigger).toHaveAccessibleName('Color: Blue');
        expect(trigger).toHaveStyle({ background: TEAMS.blue.color });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
    });

    it('clicking the swatch opens a titled popup with all ten colors, the current one checked', async () => {
        const { trigger } = show({ heading: 'Team color', label: 'Team color' });
        await userEvent.click(screen.getByRole('button', { name: /^Team color:/ }));
        const dialog = screen.getByRole('dialog', { name: 'Team color' });
        expect(within(dialog).getByText('Team color')).toBeInTheDocument();
        const swatches = within(dialog).getAllByRole('radio');
        expect(swatches).toHaveLength(10);
        expect(swatches.map((s) => s.getAttribute('aria-label'))).toEqual(
            TEAM_IDS.map((id) => TEAMS[id].name)
        );
        expect(swatches.filter((s) => s.getAttribute('aria-checked') === 'true')).toHaveLength(1);
        expect(screen.getByRole('radio', { name: 'Red' })).toBeChecked();
        expect(trigger).toBeDefined();
    });

    it('lays the swatches out as two rows of five', () => {
        expect(COLOR_PICKER_CSS).toMatch(/\.cp-grid \{[^}]*repeat\(5, var\(--cp-size\)\)/);
        expect(TEAM_IDS).toHaveLength(10);
    });

    it('makes the swatches bigger on touch screens (44px, up from 30px)', () => {
        expect(COLOR_PICKER_CSS).toMatch(/\.cp-root \{[^}]*--cp-size: 30px/);
        expect(COLOR_PICKER_CSS).toMatch(
            /@media \(pointer: coarse\) \{ \.cp-root \{[^}]*--cp-size: 44px/
        );
        // The trigger, the swatches and the grid all follow the one size.
        expect(COLOR_PICKER_CSS.match(/var\(--cp-size\)/g)?.length).toBeGreaterThanOrEqual(5);
        expect(COLOR_PICKER_CSS).not.toMatch(/width: 30px|height: 30px/);
    });

    it('picking a color reports it and closes the popup, focus back on the swatch', async () => {
        const { onChange, trigger } = show();
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
        expect(onChange).toHaveBeenCalledWith('teal');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('shows the new color on the swatch once the value changes', async () => {
        function Harness() {
            const [value, setValue] = useState<string>('red');
            return (
                <ColorPicker
                    value={value}
                    heading="Color"
                    label="Color"
                    counts={new Map()}
                    exclusive={true}
                    onChange={(id: TeamId) => setValue(id)}
                />
            );
        }
        render(<Harness />);
        await userEvent.click(screen.getByRole('button', { name: 'Color: Red' }));
        await userEvent.click(screen.getByRole('radio', { name: 'Purple' }));
        expect(screen.getByRole('button', { name: 'Color: Purple' })).toHaveStyle({
            background: TEAMS.purple.color,
        });
    });

    it('Esc and clicking away close it without picking', async () => {
        const { onChange, trigger } = show();
        await userEvent.click(trigger);
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        await userEvent.click(trigger);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await userEvent.click(document.body);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await userEvent.click(trigger);
        await userEvent.click(trigger); // the swatch itself toggles it
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('opens on the checked swatch, and the arrow keys move between swatches (rows of five)', async () => {
        const { onChange, trigger } = show({ value: 'green' });
        await userEvent.click(trigger);
        expect(screen.getByRole('radio', { name: 'Green' })).toHaveFocus();
        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByRole('radio', { name: 'Yellow' })).toHaveFocus();
        await userEvent.keyboard('{ArrowDown}'); // five along: the second row
        expect(screen.getByRole('radio', { name: 'Pink' })).toHaveFocus();
        await userEvent.keyboard('{ArrowLeft}');
        expect(screen.getByRole('radio', { name: 'Gray' })).toHaveFocus();
        await userEvent.keyboard('{ArrowUp}');
        expect(screen.getByRole('radio', { name: 'Green' })).toHaveFocus();
        await userEvent.keyboard('{ArrowUp}'); // already the top row: stays
        expect(screen.getByRole('radio', { name: 'Green' })).toHaveFocus();
        await userEvent.keyboard('{ArrowRight}{ArrowRight}');
        expect(screen.getByRole('radio', { name: 'Purple' })).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledWith('purple');
    });

    it('with exclusive colors, ones another player has are taken; yours is not', async () => {
        const { onChange, trigger } = show({
            value: 'red',
            counts: new Map([
                ['red', 1],
                ['blue', 1],
            ]),
        });
        await userEvent.click(trigger);
        expect(screen.getByRole('radio', { name: 'Blue (taken)' })).toBeDisabled();
        expect(screen.getByRole('radio', { name: 'Red' })).toBeEnabled();
        await userEvent.click(screen.getByRole('radio', { name: 'Blue (taken)' }));
        expect(onChange).not.toHaveBeenCalled();
        await userEvent.keyboard('{Escape}');
    });

    it('arrow keys skip taken colors', async () => {
        const { trigger } = show({ value: 'red', counts: new Map([['blue', 1]]) });
        await userEvent.click(trigger);
        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByRole('radio', { name: 'Green' })).toHaveFocus();
    });

    it('with shared colors (teams), swatches say how many are on each team', async () => {
        const { trigger } = show({
            exclusive: false,
            counts: new Map([
                ['red', 2],
                ['blue', 1],
            ]),
        });
        await userEvent.click(trigger);
        expect(screen.getByRole('radio', { name: 'Red (2)' })).toBeEnabled();
        expect(screen.getByRole('radio', { name: 'Blue (1)' })).toBeEnabled();
        expect(screen.getByRole('radio', { name: 'Green' })).toBeEnabled();
    });

    it("can't be opened while disabled, and keeps its tooltip", async () => {
        const { trigger } = show({ disabled: true, title: 'Un-ready to change this' });
        expect(trigger).toBeDisabled();
        expect(trigger).toHaveAttribute('title', 'Un-ready to change this');
        await userEvent.click(trigger);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes if it gets disabled while open (you readied up)', async () => {
        const { rerender } = render(
            <ColorPicker
                value="red"
                heading="Color"
                label="Color"
                counts={new Map()}
                exclusive={true}
                onChange={() => {}}
            />
        );
        await userEvent.click(screen.getByRole('button', { name: /^Color:/ }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        rerender(
            <ColorPicker
                value="red"
                heading="Color"
                label="Color"
                counts={new Map()}
                exclusive={true}
                disabled
                onChange={() => {}}
            />
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
