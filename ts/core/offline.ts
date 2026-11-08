// ts/core/offline.ts
// Registers the hosted site's service worker (build/sw.js), which keeps the page and
// everything it loads so that the app — installed to a phone's home screen, on a
// music stand, out of signal — still opens.
//
// Only the hosted build has a worker to register. The single-file build is a file on
// disk, and a dev server must never be cached, so the build stamp decides.

const FONT_HOSTS = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

export function registerOfflineSupport(): void {
  const build = document.querySelector<HTMLMetaElement>('meta[name="ff-build"]')?.content ?? '';
  if (!build.startsWith('hosted') || !('serviceWorker' in navigator)) return;

  // On a first visit the worker takes over a page that has already loaded: the app's
  // own files it fetches for itself, but it never saw the fonts go by. Ask for them
  // again (the browser has them, so this costs nothing) so that it can keep them —
  // otherwise the icon font is missing the first time the app opens offline.
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        for (const entry of performance.getEntriesByType('resource')) {
          if (FONT_HOSTS.some((host) => entry.name.startsWith(host))) {
            void fetch(entry.name).catch(() => {});
          }
        }
      },
      { once: true },
    );
  }

  // After load: registering is not allowed to compete with the app's own start-up.
  const register = () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // No worker, no offline. The app itself is unaffected.
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
