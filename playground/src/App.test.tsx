import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders the playground heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', {
        name: /style dictionary \+ vite plugin playground/i,
      })
    ).toBeInTheDocument();
  });

  it('toggles the theme attribute on button clicks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /dark/i }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    await user.click(screen.getByRole('button', { name: /light/i }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('button', { name: /default/i }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });
});
