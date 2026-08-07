'use client';

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

export default function EntryCard({ entry, activeTags, onToggleTag }) {
  const { body, tags, summary, source, url, created_at, similarity } = entry;

  return (
    <article className="card">
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
        <span>{timeAgo(created_at)}</span>
        {source ? (
          <span className="dot">{source}</span>
        ) : null}
        {url ? (
          <a
            className="dot"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {hostname(url)}
          </a>
        ) : null}
        {typeof similarity === 'number' ? (
          <span className="sim">{Math.round(similarity * 100)}% match</span>
        ) : null}
      </div>
    </article>
  );
}
