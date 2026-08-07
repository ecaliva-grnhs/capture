import { NextResponse } from 'next/server';

// Served at /manifest.webmanifest. Icons are the maskable SVG in /public,
// which browsers accept for installability.
export function GET() {
  const manifest = {
    name: 'Thought Capture',
    short_name: 'Thoughts',
    description: 'Capture, auto-tag, and semantically search your thoughts.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0b0f',
    theme_color: '#0b0b0f',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
