'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import EntryCard from '@/components/EntryCard';
import ComposeSheet from '@/components/ComposeSheet';

export default function Home() {
  const [entries, setEntries] = useState([]);
  const [tagCounts, setTagCounts] = useState([]);
  const [activeTags, setActiveTags] = useState([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const [composing, setComposing] = useState(false);

  // Track the latest request so out-of-order responses don't clobber state.
  const reqId = useRef(0);

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags');
      const json = await res.json();
      if (res.ok) setTagCounts(json.tags || []);
    } catch {
      /* non-fatal */
    }
  }, []);

  // Fetch the feed (or search results) for the current query + tag filters.
  const load = useCallback(
    async ({ append = false } = {}) => {
      const id = ++reqId.current;
      setError('');
      if (!append) setLoading(true);

      const params = new URLSearchParams();
      activeTags.forEach((t) => params.append('tag', t));

      try {
        let url;
        if (query.trim()) {
          params.set('q', query.trim());
          url = `/api/search?${params}`;
        } else {
          if (append && cursor) params.set('before', cursor);
          url = `/api/entries?${params}`;
        }

        const res = await fetch(url);
        const json = await res.json();
        if (id !== reqId.current) return; // superseded
        if (!res.ok) throw new Error(json.error || 'Failed to load');

        const rows = json.entries || [];
        setEntries((prev) => (append ? [...prev, ...rows] : rows));
        // Pagination only applies to the reverse-chron feed, not search.
        setCursor(query.trim() ? null : json.nextCursor || null);
      } catch (err) {
        if (id === reqId.current) setError(err.message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [query, activeTags, cursor]
  );

  // Reload whenever the query or tag filters change (debounced for search).
  useEffect(() => {
    setSearching(!!query.trim());
    const t = setTimeout(() => load({ append: false }), query.trim() ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTags]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Register the service worker for offline shell / installability.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  function toggleTag(tag) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleSaved(entry) {
    setComposing(false);
    // Prepend optimistically; refresh tag counts since new tags may appear.
    if (!query.trim() && activeTags.length === 0) {
      setEntries((prev) => [entry, ...prev]);
    } else {
      load({ append: false });
    }
    loadTags();
  }

  const showLoadMore = !searching && cursor && entries.length > 0;

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
        {query ? (
          <button onClick={() => setQuery('')}>Clear</button>
        ) : null}
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

      {error ? <div className="error">{error}</div> : null}

      {loading && entries.length === 0 ? (
        <div className="loading">Loading…</div>
      ) : entries.length === 0 ? (
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
            />
          ))}
        </div>
      )}

      {showLoadMore ? (
        <button className="more" onClick={() => load({ append: true })}>
          Load more
        </button>
      ) : null}

      <button
        className="fab"
        aria-label="Capture a thought"
        onClick={() => setComposing(true)}
      >
        +
      </button>

      {composing ? (
        <ComposeSheet
          onClose={() => setComposing(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </main>
  );
}
