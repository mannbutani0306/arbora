// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { Footer } from './Footer';
import { Layout } from './Layout';
import { Navbar } from './Navbar';
import { Splash } from './Splash';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  signOut: vi.fn(),
  checkAiAvailability: vi.fn(),
  isAiAvailable: vi.fn(),
  subscribeAiAvailability: vi.fn(),
}));

vi.mock('../lib/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../ai/gatewayClient', () => ({
  checkAiAvailability: mocks.checkAiAvailability,
  isAiAvailable: mocks.isAiAvailable,
  subscribeAiAvailability: mocks.subscribeAiAvailability,
}));

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}

function openPalette() {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
}

describe('navigation components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    mocks.useAuth.mockReturnValue({ user: null, signOut: mocks.signOut });
    mocks.checkAiAvailability.mockResolvedValue(false);
    mocks.isAiAvailable.mockReturnValue(false);
    mocks.subscribeAiAvailability.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('supports command search, keyboard navigation, and action callbacks', () => {
    const onRunCode = vi.fn();
    const onOpenSamples = vi.fn();
    const onOpenReport = vi.fn();
    const onStartTour = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPalette
          onRunCode={onRunCode}
          onOpenSamples={onOpenSamples}
          onOpenReport={onOpenReport}
          onStartTour={onStartTour}
        />
        <CurrentPath />
      </MemoryRouter>,
    );
    expect(screen.queryByPlaceholderText('Type a command or navigate...')).toBeNull();

    openPalette();
    const input = screen.getByPlaceholderText('Type a command or navigate...');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('current-path').textContent).toBe('/benchmarks');

    const actions = [
      ['Parse Code', onRunCode],
      ['Load Samples', onOpenSamples],
      ['Export Report', onOpenReport],
      ['Start Tour', onStartTour],
    ] as const;
    for (const [title, callback] of actions) {
      openPalette();
      const commandInput = screen.getByPlaceholderText('Type a command or navigate...');
      fireEvent.change(commandInput, { target: { value: title } });
      fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
      expect(callback).toHaveBeenCalledOnce();
    }

    openPalette();
    const search = screen.getByPlaceholderText('Type a command or navigate...');
    fireEvent.change(search, { target: { value: 'not a command' } });
    expect(screen.getByText('No commands found.')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Type a command or navigate...')).toBeNull();
  }, 15_000);

  it('wraps keyboard selection and falls back to the playground for local actions', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPalette />
        <CurrentPath />
      </MemoryRouter>,
    );

    openPalette();
    let input = screen.getByPlaceholderText('Type a command or navigate...');
    fireEvent.change(input, { target: { value: 'Navigation' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('current-path').textContent).toBe('/history');

    openPalette();
    input = screen.getByPlaceholderText('Type a command or navigate...');
    fireEvent.change(input, { target: { value: 'Parse Code' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('current-path').textContent).toBe('/playground');

    openPalette();
    input = screen.getByPlaceholderText('Type a command or navigate...');
    fireEvent.change(input, { target: { value: 'Load Samples' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('current-path').textContent).toBe('/playground');
  });

  it('navigates through the remaining command shortcuts', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPalette />
        <CurrentPath />
      </MemoryRouter>,
    );
    const destinations = [
      ['Open Playground', '/playground'],
      ['Grammar & Docs', '/docs'],
      ['Analysis History', '/history'],
    ] as const;
    for (const [title, destination] of destinations) {
      openPalette();
      const input = screen.getByPlaceholderText('Type a command or navigate...');
      fireEvent.change(input, { target: { value: title } });
      const command = screen.getByRole('button', { name: new RegExp(title) });
      fireEvent.mouseEnter(command);
      fireEvent.click(command);
      expect(screen.getByTestId('current-path').textContent).toBe(destination);
    }
  });

  it('renders active navigation, guest and signed-in actions, and footer links', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/research']}>
        <Navbar />
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: 'Research' })[0].className).toContain('font-medium');
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/auth');
    expect(screen.getAllByRole('link', { name: 'Docs' })[0].getAttribute('href')).toBe('/docs');

    mocks.useAuth.mockReturnValue({
      user: { email: 'arbora@example.com' },
      signOut: mocks.signOut,
    });
    rerender(
      <MemoryRouter initialEntries={['/playground']}>
        <Navbar />
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByText('arbora')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it('shows AI availability and cleans up its subscription on unmount', () => {
    const unsubscribe = vi.fn();
    mocks.subscribeAiAvailability.mockReturnValue(unsubscribe);
    const { unmount } = render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );
    expect(screen.getByText('AI offline')).toBeTruthy();
    expect(mocks.checkAiAvailability).toHaveBeenCalledOnce();
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('skips the splash after it has already been shown in this session', () => {
    const onComplete = vi.fn();
    sessionStorage.setItem('arbora_splash_seen', 'true');
    render(<Splash onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledOnce();
    sessionStorage.removeItem('arbora_splash_seen');
  });
});
