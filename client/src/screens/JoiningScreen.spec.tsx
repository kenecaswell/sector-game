import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoiningScreen } from './JoiningScreen';

describe('JoiningScreen', () => {
    it('says it is joining, with the header', () => {
        render(<JoiningScreen code="K7QF" error={null} onRetry={vi.fn()} onBack={vi.fn()} />);
        expect(screen.getByRole('heading')).toHaveTextContent('Joining game K7QF');
        expect(screen.getByText('SECTOR 42')).toBeInTheDocument();
    });

    it("explains a code that doesn't exist, and offers the way back and a retry", async () => {
        const onRetry = vi.fn();
        const onBack = vi.fn();
        render(
            <JoiningScreen
                code="ABCD"
                error={'room "ABCD" not found'}
                onRetry={onRetry}
                onBack={onBack}
            />
        );
        expect(screen.getByRole('alert')).toHaveTextContent(/no open game with this code/);
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await userEvent.click(screen.getByRole('button', { name: 'Back to games' }));
        expect(onRetry).toHaveBeenCalled();
        expect(onBack).toHaveBeenCalled();
    });
});
