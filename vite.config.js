import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' => rutas relativas, compatible con GitHub Pages (User Pages y Project Pages)
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'TDT España · Reproductor IPTV',
        short_name: 'TDT España',
        description:
          'PWA de televisión TDT española basada en datos públicos de iptv-org. HLS/DASH en navegador, optimizada para Smart TV.',
        lang: 'es',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#09090b',
        theme_color: '#09090b',
        categories: ['entertainment', 'utilities'],
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        navigateFallback: null, // no interceptar navegación remota
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Logos de canales: cache-first persistente (imágenes estáticas)
            urlPattern: /^https:\/\/.*\/logo\/.*$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'iptv-logos',
              expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: ['es2020', 'chrome >= 70', 'safari >= 13'],
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/hls.js')) return 'hls'
          if (id.includes('node_modules/dashjs')) return 'dash'
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
})
