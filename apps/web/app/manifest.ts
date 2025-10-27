import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bill of Material - SBOM Generator',
    short_name: 'SBOM Generator',
    description: 'Generate comprehensive Software Bill of Materials (SBOM) for your projects with security analysis and risk assessment.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    orientation: 'portrait-primary',
    scope: '/',
    lang: 'en',
    categories: ['developer', 'productivity', 'utilities'],
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Generate SBOM',
        short_name: 'Generate',
        description: 'Start generating a new SBOM',
        url: '/',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
          },
        ],
      },
    ],
  }
}
