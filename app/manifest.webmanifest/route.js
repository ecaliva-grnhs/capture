import { NextResponse } from 'next/server';

// Served at /manifest.webmanifest.
//
// PNG 192 + 512 are what Chrome's installability criteria actually check; the
// SVG is a bonus for browsers that prefer it. Separate `maskable` entries keep
// the glyph inside Android's safe zone without letterboxing the `any` icons.
export function GET() {
  const manifest = {
    name: 'Thought Capture',
    short_name: 'Thoughts',
    description: 'Capture, auto-tag, and semantically search your thoughts.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b0f',
    theme_color: '#0b0b0f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
