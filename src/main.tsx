import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { NATIVE_BUILD } from './core/env';
import './styles/global.css';

// внутри приложений Capacitor/Tauri файлы уже лежат локально — офлайн-кэш не нужен
if (!NATIVE_BUILD) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
