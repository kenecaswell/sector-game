import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RespawnOverlay } from './RespawnOverlay';

describe('RespawnOverlay', () => {
    it('shows nothing while you are in play', () => {
        const { container } = render(<RespawnOverlay respawnAt={0} hasBackpack={false} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('counts down to your respawn and says where your gear went', () => {
        render(<RespawnOverlay respawnAt={Date.now() + 4200} hasBackpack />);
        expect(screen.getByRole('status')).toHaveTextContent('Defeated');
        expect(screen.getByText('Respawning in 5…')).toBeInTheDocument();
        expect(screen.getByText(/in a backpack where you fell/)).toBeInTheDocument();
    });

    it("doesn't mention a backpack when you had nothing to drop", () => {
        render(<RespawnOverlay respawnAt={Date.now() + 3000} hasBackpack={false} />);
        expect(screen.queryByText(/backpack/)).not.toBeInTheDocument();
    });
});
