'use client';

import { useState } from 'react';

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  const units = [
    ['y', 31536000],
    ['mo', 2592000],
    ['w', 604800],
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ];
  for (const [label, s] of units) {
    const v = Math.floor(secs / s);
    if (v >= 1) return `${v}${label} ago`;
  }
  return 'just now';
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function EntryCard({
  entry,
  activeTags,
  onToggleTag,
  onEdit,
  onDelete,
  pending,
}) {
  const {
    body,
    tags,
    summary,
    source,
    url,
    created_at,
    similarity,
    needs_enrichment,
  } = entry;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    const next = draft.trim();
    if (!next || next === body) {
      setEditing(false);
      setDraft(body);
      return;
    }
    setBusy(true);
    try {
      await onEdit(entry.id, { body: next });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await onDelete(entry.id);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (editing) {
    return (
      <article className="card editing">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(body);
            }
          }}
        />
        <p className="edit-note">Saving re-runs tagging and re-embeds the text.</p>
        <div className="row-actions">
          <button
            onClick={() => {
              setEditing(false);
              setDraft(body);
            }}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="primary" onClick={save} disabled={busy || !draft.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className={`card${pending ? ' pending' : ''}`}>
      {summary ? <p className="summary">{summary}</p> : null}
      <p className="body">{body}</p>

      {tags?.length ? (
        <div className="card-tags">
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onToggleTag(tag)}
              aria-pressed={activeTags?.includes(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}

      <div className="meta">
        <span>{pending ? 'queued — offline' : timeAgo(created_at)}</span>
        {source ? <span className="dot">{source}</span> : null}
        {url ? (
          <a className="dot" href={url} target="_blank" rel="noopener noreferrer">
            {hostname(url)}
          </a>
        ) : null}
        {needs_enrichment ? (
          <span className="dot warn" title="Tagging or embedding failed; will retry">
            unenriched
          </span>
        ) : null}
        {typeof similarity === 'number' ? (
          <span className="sim">{Math.round(similarity * 100)}% match</span>
        ) : null}

        {!pending ? (
          <span className="row-actions inline">
            <button onClick={() => setEditing(true)} aria-label="Edit entry">
              Edit
            </button>
            {confirming ? (
              <>
                <button className="danger" onClick={remove} disabled={busy}>
                  {busy ? '…' : 'Confirm'}
                </button>
                <button onClick={() => setConfirming(false)} disabled={busy}>
                  No
                </button>
              </>
            ) : (
              <button onClick={() => setConfirming(true)} aria-label="Delete entry">
                Delete
              </button>
            )}
          </span>
        ) : null}
      </div>
    </article>
  );
}
