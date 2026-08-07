'use client';

import { useState } from 'react';
import { apiFetch, OfflineError } from '@/lib/client/api';
import { queueEntry } from '@/lib/client/outbox';

/**
 * Bottom-sheet composer, hitting the same POST /api/entries the Shortcut uses.
 *
 * If the network is unavailable the thought goes to the offline outbox instead
 * of erroring — the one thing this app must never do is lose what you typed.
 */
export default function ComposeSheet({ onClose, onSaved, onQueued }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const trimmed = body.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');

    try {
      const json = await apiFetch('/api/entries', {
        method: 'POST',
        body: { body: trimmed, source: 'web' },
      });
      onSaved(json.entry, { duplicate: json.duplicate, degraded: json.degraded });
    } catch (err) {
      if (err instanceof OfflineError) {
        try {
          await queueEntry({ body: trimmed, source: 'web-offline' });
          onQueued(trimmed);
          return;
        } catch {
          setError('Offline, and the device queue is unavailable. Copy your text before closing.');
          setSaving(false);
          return;
        }
      }
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Capture a thought"
        onClick={(e) => e.stopPropagation()}
      >
        {error ? <div className="error">{error}</div> : null}
        <textarea
          autoFocus
          placeholder="What's on your mind?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="actions">
          <button className="cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="save" onClick={save} disabled={saving || !body.trim()}>
            {saving ? 'Tagging…' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
}
