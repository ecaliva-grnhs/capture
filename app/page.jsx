'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import EntryCard from '@/components/EntryCard';
import ComposeSheet from '@/components/ComposeSheet';
import TokenGate from '@/components/TokenGate';
import { apiFetch, getToken, clearToken, ApiError } from '@/lib/client/api';
import { flushOutbox, pendingEntries } from '@/lib/client/outbox';

export default function Home() {
  const [unlocked, setUnlocked] = useState(null); // null = still checking
  const [entries, setEntries] = useState([]);
  const [queued, setQueued] = useState([]);
  const [tagCounts, setTagCounts] = useState([]);
  const [activeTags, setActiveTags] = useState([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [semantic, setSemantic] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const [nextOffset, setNextOffset] = useState(null);
  const [composing, setComposing] = useState(false);

  // Guards against a slow response overwriting a newer one.
  const reqId = useRef(0);

  useEffect(() => {
    setUnlocked(Boolean(getToken()));
  }, []);

  const handleAuthError = useCallback((err) => {
    if (err instanceof ApiError && err.status === 401) {
      clearToken();
      setUnlocked(false);
      return true;
    }
    return false;
  }, []);

  const refreshQueued = useCallback(async () => {
    try {
      setQueued(await pendingEntries());
    } catch {
      /* IndexedDB unavailable — queue simply isn't shown */
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      activeTags.forEach((t) => params.append('tag', t));
      const json = await apiFetch(`/api/tags?${params}`);
      setTagCounts(json.tags || []);
    } catch (err) {
      handleAuthError(err);
    }
  }, [activeTags, handleAuthError]);

  const load = useCallback(
    async ({ append = false } = {}) => {
      const id = ++reqId.current;
      setError('');
      if (!append) setLoading(true);

      const params = new URLSearchParams();
      activeTags.forEach((t) => params.append('tag', t));

      try {
        let url;
        const isSearch = Boolean(query.trim());
        if (isSearch) {
          params.set('q', query.trim());
          if (append && nextOffset != null) params.set('offset', String(nextOffset));
          url = `/api/search?${params}`;
        } else {
          if (append && cursor) params.set('before', cursor);
          url = `/api/entries?${params}`;
        }

        const json = await apiFetch(url);
        if (id !== reqId.current) return; // superseded

        const rows = json.entries || [];
        setEntries((prev) => (append ? [...prev, ...rows] : rows));
        setCursor(isSearch ? null : json.nextCursor || null);
        setNextOffset(isSearch ? json.nextOffset ?? null : null);
        setSemantic(isSearch ? json.semantic !== false : true);
      } catch (err) {
        if (id !== reqId.current) return;
        if (!handleAuthError(err)) setError(err.message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [query, activeTags, cursor, nextOffset, handleAuthError]
  );

  // Drain the offline queue, then refresh so replayed entries appear.
  const drain = useCallback(async () => {
    const { sent, remaining } = await flushOutbox();
    await refreshQueued();
    if (sent.length) {
      setNotice(`Synced ${sent.length} queued thought${sent.length > 1 ? 's' : ''}.`);
      await load({ append: false });
      await loadTags();
    }
    return remaining;
  }, [load, loadTags, refreshQueued]);

  // Reload on query/tag change (debounced while typing a search).
  useEffect(() => {
    if (!unlocked) return;
    setSearching(Boolean(query.trim()));
    const t = setTimeout(() => load({ append: false }), query.trim() ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTags, unlocked]);

  useEffect(() => {
    if (unlocked) loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTags, unlocked]);

  // Service worker + offline queue lifecycle.
  useEffect(() => {
    if (!unlocked) return;

    refreshQueued();
    drain();

    const onOnline = () => drain();
    const onVisible = () => {
      if (document.visibilityState === 'visible') drain();
    };
    const onMessage = (event) => {
      if (event.data?.type === 'flush-outbox') drain();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', onMessage);
    }

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  function toggleTag(tag) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleSaved(entry, { duplicate, degraded } = {}) {
    setComposing(false);
    if (duplicate) setNotice('Already captured — showing the existing entry.');
    else if (degraded) setNotice('Saved, but tagging failed. It will be retried.');

    if (!query.trim() && activeTags.length === 0) {
      setEntries((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)]);
    } else {
      load({ append: false });
    }
    loadTags();
  }

  async function handleQueued() {
    setComposing(false);
    await refreshQueued();
    setNotice('Offline — saved to this device and queued to sync.');
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('flush-outbox');
      } catch {
        /* iOS has no Background Sync; the online listener covers it */
      }
    }
  }

  async function handleEdit(id, patch) {
    try {
      const json = await apiFetch(`/api/entries/${id}`, {
        method: 'PATCH',
        body: patch,
      });
      setEntries((prev) => prev.map((e) => (e.id === id ? json.entry : e)));
      loadTags();
    } catch (err) {
      if (!handleAuthError(err)) setError(err.message);
    }
  }

  async function handleDelete(id) {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id)); // optimistic
    try {
      await apiFetch(`/api/entries/${id}`, { method: 'DELETE' });
      loadTags();
    } catch (err) {
      setEntries(previous); // roll back
      if (!handleAuthError(err)) setError(err.message);
    }
  }

  if (unlocked === null) return <main className="app" />;
  if (!unlocked) return <TokenGate onUnlocked={() => setUnlocked(true)} />;

  const canLoadMore = searching ? nextOffset != null : Boolean(cursor);

  return (
    <main className="app">
      <header className="header">
        <h1>Thoughts</h1>
        <span className="count">
          {entries.length}
          {searching ? ' results' : ''}
        </span>
      </header>

      <div className="searchbar">
        <input
          type="search"
          placeholder="Search your thoughts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query ? <button onClick={() => setQuery('')}>Clear</button> : null}
      </div>

      {tagCounts.length ? (
        <div className="tags">
          {tagCounts.map(({ tag, count }) => (
            <button
              key={tag}
              className={`chip ${activeTags.includes(tag) ? 'active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              #{tag}
              <span className="n">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {searching && !semantic ? (
        <div className="notice">
          Semantic search unavailable — showing keyword matches.
        </div>
      ) : null}

      {queued.length ? (
        <div className="feed queued-feed">
          {queued.map((item) => (
            <EntryCard
              key={`queued-${item.id}`}
              entry={{
                id: `queued-${item.id}`,
                body: item.body,
                tags: [],
                summary: null,
                source: item.source,
                created_at: item.queued_at,
              }}
              activeTags={activeTags}
              onToggleTag={toggleTag}
              pending
            />
          ))}
        </div>
      ) : null}

      {loading && entries.length === 0 ? (
        <div className="loading">Loading…</div>
      ) : entries.length === 0 && queued.length === 0 ? (
        <div className="empty">
          {searching || activeTags.length
            ? 'Nothing matches yet.'
            : 'No thoughts captured yet. Tap + to add one.'}
        </div>
      ) : (
        <div className="feed">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              activeTags={activeTags}
              onToggleTag={toggleTag}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {canLoadMore && entries.length > 0 ? (
        <button className="more" onClick={() => load({ append: true })}>
          Load more
        </button>
      ) : null}

      <button className="fab" aria-label="Capture a thought" onClick={() => setComposing(true)}>
        +
      </button>

      {composing ? (
        <ComposeSheet
          onClose={() => setComposing(false)}
          onSaved={handleSaved}
          onQueued={handleQueued}
        />
      ) : null}
    </main>
  );
}
