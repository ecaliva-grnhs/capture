import './globals.css';

export const metadata = {
  title: 'Thought Capture',
  description: 'Capture, auto-tag, and semantically search your thoughts.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Thoughts',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Thoughts',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    // iOS ignores manifest icons for "Add to Home Screen" — it reads this.
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport = {
  themeColor: '#0b0b0f',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale/userScalable lock: pinch-zoom stays available. The 16px
  // form controls already prevent iOS focus-zoom without disabling zoom.
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
