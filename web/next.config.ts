import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Dev göstergesini kapat (sol sidebar footer'ını kapatıyordu).
  devIndicators: false,
  // Next 15.5 dev-tools "Segment Explorer" bileşeni, çok sayıda Fast Refresh
  // sonrası React Client Manifest'i bozup sayfayı 500'e düşürüyor. Kapatıyoruz.
  experimental: {
    devtoolSegmentExplorer: false,
  },
  async rewrites() {
    // Server-side proxy target for the API. In split deployments (docker
    // compose) set API_INTERNAL_URL=http://api:3001; defaults to localhost for
    // local dev where the API runs on the same host.
    const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    return {
      // Serve the public marketing landing at the root URL (bypasses the app
      // shell/auth — it's a plain static file in web/public).
      beforeFiles: [
        { source: '/', destination: '/landing.html' },
        // Clean route for the dedicated mobile page (static file mobile.html).
        { source: '/mobile', destination: '/mobile.html' },
      ],
      afterFiles: [
        {
          source: '/api/:path*',
          destination: `${apiUrl}/api/:path*`,
        },
        {
          source: '/health',
          destination: `${apiUrl}/health`,
        },
      ],
    };
  },
};

export default nextConfig;
