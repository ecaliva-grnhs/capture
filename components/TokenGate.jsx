'use client';

import { useState } from 'react';
import { apiFetch, setToken, clearToken } from '@/lib/client/api';

/**
 * One-time unlock. The API requires the capture token, so the PWA asks for it
 * once and remembers it. Not a login — there are no accounts — just the same
 * shared secret the Apple Shortcut carries.
 */
export default function TokenGate({ onUnlocked }) {
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const token = value.trim();
    if (!token || checking) return;

    setChecking(true);
    setError('');
    setToken(token);
    try {
      // Cheapest authenticated endpoint — proves the token before we commit.
      await apiFetch('/api/tags');
      onUnlocked();
    } catch (err) {
      clearToken();
      setError(
        err.status === 401
          ? 'That token was not accepted.'
          : err.message || 'Could not verify the token.'
      );
      setChecking(false);
    }
  }

  return (
    <main className="app gate">
      <form className="gate-card" onSubmit={submit}>
        <h1>Thoughts</h1>
        <p className="gate-hint">
          Enter your capture token to unlock this device. It is the same value
          as <code>CAPTURE_TOKEN</code> in your deployment.
        </p>
        {error ? <div className="error">{error}</div> : null}
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Capture token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" disabled={checking || !value.trim()}>
          {checking ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </main>
  );
}
