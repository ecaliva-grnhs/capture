'use client';

import { useState } from 'react';

/**
 * Bottom-sheet composer. Lets the single user jot a thought straight from the
 * PWA (same POST /api/entries path the Apple Shortcut uses).
 */
export default function ComposeSheet({ onClose, onSaved }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const trimmed = body.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed, source: 'web' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      onSaved(json.entry);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {error ? <div className="error">{error}</div> : null}
        <textarea
          autoFocus
          placeholder="What's on your mind?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
          }}
        />
        <div className="actions">
          <button className="cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="save"
            onClick={save}
            disabled={saving || !body.trim()}
          >
            {saving ? 'Tagging…' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
}
