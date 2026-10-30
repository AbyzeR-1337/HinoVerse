// Параметры сборки. VITE_STATIC=1 — статический сайт без сервера (GitHub Pages, архив),
// VITE_NATIVE=1 — приложение для Android/iOS (Capacitor) или ПК (Tauri), VITE_SERVER_URL — адрес сервера HinoVerse.
const env = ((import.meta as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;

export const NATIVE_BUILD = env.VITE_NATIVE === '1';
export const STATIC_BUILD = NATIVE_BUILD || env.VITE_STATIC === '1';
export const DEFAULT_SERVER_URL = (env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');
