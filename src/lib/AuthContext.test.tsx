// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

describe('AuthProvider without a configured backend', () => {
  afterEach(cleanup);

  it('settles loading, exposes guest auth actions, and signs out locally', async () => {
    let auth: ReturnType<typeof useAuth> | undefined;
    function Probe() {
      auth = useAuth();
      return createElement(
        'p',
        { role: 'status' },
        auth.loading ? 'Loading' : 'Guest',
      );
    }

    render(createElement(AuthProvider, null, createElement(Probe)));

    expect((await screen.findByRole('status')).textContent).toBe('Guest');
    await waitFor(() => expect(auth?.loading).toBe(false));
    if (!auth) throw new Error('Auth context was not provided.');
    expect(auth.user).toBeNull();
    expect(auth.session).toBeNull();
    expect(auth.isConfigured).toBe(false);

    await expect(auth.signInWithEmail('user@example.test')).rejects.toThrow(
      'Backend not configured.',
    );
    await expect(auth.signUpWithEmail('user@example.test', 'short')).rejects.toThrow(
      'Backend not configured.',
    );
    await expect(auth.signInWithGoogle()).rejects.toThrow('Backend not configured.');

    await auth.signOut();
    expect(auth.user).toBeNull();
    expect(auth.session).toBeNull();
  });
});
