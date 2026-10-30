# Исходники иконок и заставки

- `icon-only.png` (1024×1024) — иконка приложения; из неё сгенерированы `src-tauri/icons/` (`npx tauri icon assets/icon-only.png -o src-tauri/icons`).
- `icon-foreground.png` + `icon-background.png` — адаптивная иконка Android.
- `splash.png`, `splash-dark.png` (2732×2732) — заставка.

Иконки Android/iOS генерируются при сборке: `npx @capacitor/assets generate` (см. `.github/workflows/release.yml`).
Иероглиф 日 на иконке нарисован по контурам KanjiVG (CC BY-SA 3.0).
