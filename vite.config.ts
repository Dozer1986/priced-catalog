import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

function trackerServiceWorkerPlugin(): Plugin {
  return {
    name: 'tracker-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const emittedFiles = new Set<string>();
      for (const fileName of Object.keys(bundle)) {
        emittedFiles.add(fileName);
      }
      emittedFiles.add('tracker.html');
      emittedFiles.add('tracker.webmanifest');
      emittedFiles.add('icon-180.png');
      emittedFiles.add('icon-192.png');
      emittedFiles.add('icon-512.png');

      const filesArray = Array.from(emittedFiles).sort();
      // A new name every build, so HTML, manifest or icon edits also reach installed phones.
      const cacheName = `kamotec-tracker-${Date.now()}`;

      const swContent = `// Auto-generated Service Worker for KAMOTec Hours
const CACHE_NAME = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(filesArray)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const urls = ASSETS.map((asset) => new URL(asset, self.location).href);
      return cache.addAll(urls);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith('kamotec-tracker-')) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch cross-origin requests (e.g. CouchDB sync)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    // ignoreVary: module scripts carry an Origin header that the precache requests did not.
    caches.match(req, { ignoreVary: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch((err) => {
        if (req.mode === 'navigate') {
          return caches.match(new URL('tracker.html', self.location).href);
        }
        throw err;
      });
    })
  );
});
`;

      this.emitFile({
        type: 'asset',
        fileName: 'tracker-sw.js',
        source: swContent,
      });
    },
  };
}

// Handoff seam: his own domain builds with VITE_BASE_PATH=/ — see README.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/priced-catalog/',
  plugins: [react(), trackerServiceWorkerPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sources: resolve(__dirname, 'sources.html'),
        tracker: resolve(__dirname, 'tracker.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
