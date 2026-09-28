import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SplashScreen } from './SplashScreen';

describe('SplashScreen', () => {
    it('shows the title and a Play button', async () => {
        const onPlay = vi.fn();
        render(<SplashScreen onPlay={onPlay} />);
        expect(screen.getByRole('heading', { name: 'SECTOR 42' })).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'PLAY' }));
        expect(onPlay).toHaveBeenCalled();
        expect(screen.getByRole('contentinfo')).toHaveTextContent('© 2026 kenecaswell');
    });
});
