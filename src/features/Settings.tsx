import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useProgress, snapshot, initialData, type ProgressData } from '../store/progress';
import { VOICE_PROFILES, isNative, japaneseVoices, speak, type VoiceProfile } from '../core/speech';
import { STATIC_BUILD } from '../core/env';
import { generateSyncCode, isValidSyncCode, syncNow, mergeProgress } from '../core/sync';
import { aiAvailable } from '../core/ai/client';
import { MODEL } from '../core/ai/requests';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3>{title}</h3>
      <div className="col" style={{ gap: 14 }}>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useProgress((s) => s.settings);
  const set = useProgress((s) => s.setSettings);
  const replaceAll = useProgress((s) => s.replaceAll);
  const resetAll = useProgress((s) => s.resetAll);
  const name = useProgress((s) => s.name);
  const setName = useProgress((s) => s.setName);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [syncStatus, setSyncStatus] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => setVoices(japaneseVoices());
    load();
    const t = setTimeout(load, 600);
    return () => clearTimeout(t);
  }, []);

  const doSync = async (code = settings.syncCode) => {
    setSyncStatus('Синхронизация…');
    try {
      const merged = await syncNow(settings.serverUrl, code, snapshot());
      replaceAll({ ...merged, settings: { ...useProgress.getState().settings, syncCode: code } });
      setSyncStatus(`Готово: ${new Date().toLocaleTimeString('ru-RU')}`);
    } catch (e) {
      setSyncStatus(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const testAi = async () => {
    setAiStatus('Проверяю…');
    const ok = await aiAvailable(settings);
    setAiStatus(ok ? '✓ ИИ доступен' : '✗ ИИ недоступен: проверьте ключ или адрес сервера');
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ ...snapshot(), settings: { ...settings, apiKey: '' } }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hinoverse-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ProgressData;
      if (!data.cards || !data.skills) throw new Error('файл не похож на резервную копию HinoVerse');
      const merged = mergeProgress(snapshot(), { ...initialData(), ...data });
      replaceAll({ ...merged, settings: useProgress.getState().settings });
      alert('Прогресс импортирован и объединён с текущим.');
    } catch (e) {
      alert(`Не удалось импортировать: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>Настройки</h1>
      </div>

      <Section title="Профиль и внешний вид">
        <label className="field">
          Имя
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row">
          <span>Тема</span>
          <div className="seg">
            {(['auto', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => set({ theme: t })}>
                {t === 'auto' ? 'Как в системе' : t === 'light' ? 'Светлая' : 'Тёмная'}
              </button>
            ))}
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={settings.furigana} onChange={(e) => set({ furigana: e.target.checked })} /> Показывать фуригану (чтение над иероглифами)
        </label>
        <div className="row">
          <span>Подсказка произношения</span>
          <div className="seg">
            {(
              [
                ['polivanov', 'Кириллица'],
                ['romaji', 'Ромадзи'],
                ['none', 'Нет'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} className={settings.transcription === v ? 'on' : ''} onClick={() => set({ transcription: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Голос и озвучка">
        <label className="field">
          Голос по умолчанию
          <select className="input" value={settings.voice} onChange={(e) => set({ voice: e.target.value as VoiceProfile })}>
            {VOICE_PROFILES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} — {v.hint}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Японский голос системы
          <select className="input" value={settings.voiceName} onChange={(e) => set({ voiceName: e.target.value })}>
            <option value="">Автоматически</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} {v.localService ? '' : '(онлайн)'}
              </option>
            ))}
          </select>
          {voices.length === 0 && !isNative() && <span className="small" style={{ color: 'var(--accent)' }}>Японские голоса не найдены. Установите японский голос в настройках ОС (Windows: «Речь» → добавить японский; Android: Google TTS → японский; macOS/iOS: «Kyoko»).</span>}
        </label>
        <label className="field">
          Скорость речи: {settings.ttsRate.toFixed(2)}×
          <input type="range" min={0.5} max={1.5} step={0.05} value={settings.ttsRate} onChange={(e) => set({ ttsRate: Number(e.target.value) })} />
        </label>
        <label className="switch">
          <input type="checkbox" checked={settings.autoplay} onChange={(e) => set({ autoplay: e.target.checked })} /> Автоматически озвучивать новые слова
        </label>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => speak('こんにちは。日本語の勉強を始めましょう。', { profile: settings.voice, rate: settings.ttsRate, voiceName: settings.voiceName || undefined })}>
          🔈 Проверить голос
        </button>
      </Section>

      <Section title="Обучение">
        <label className="field">
          Цель в день: {settings.dailyGoal} XP
          <input type="range" min={20} max={300} step={10} value={settings.dailyGoal} onChange={(e) => set({ dailyGoal: Number(e.target.value) })} />
        </label>
        <label className="field">
          Новых карточек в день: {settings.newPerDay}
          <input type="range" min={5} max={60} step={5} value={settings.newPerDay} onChange={(e) => set({ newPerDay: Number(e.target.value) })} />
        </label>
        <label className="field">
          Строгость проверки черт: {settings.strokeLeniency <= 0.85 ? 'строгая' : settings.strokeLeniency >= 1.2 ? 'мягкая' : 'обычная'}
          <input type="range" min={0.7} max={1.5} step={0.05} value={settings.strokeLeniency} onChange={(e) => set({ strokeLeniency: Number(e.target.value) })} />
        </label>
        <label className="switch">
          <input type="checkbox" checked={settings.qte} onChange={(e) => set({ qte: e.target.checked })} /> Быстрые события (внезапные ситуации во время уроков)
        </label>
      </Section>

      <Section title="ИИ (Claude)">
        <p className="small muted" style={{ margin: 0 }}>
          ИИ отвечает за свободные разговоры, проверку текстов и персональный план. Модель: <code>{MODEL}</code>. Без ИИ всё остальное работает офлайн.
        </p>
        <div className="seg">
          {(
            [
              ['server', 'Через сервер'],
              ['direct', 'Свой ключ'],
              ['off', 'Выключен'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className={settings.aiMode === v ? 'on' : ''} onClick={() => set({ aiMode: v })}>
              {l}
            </button>
          ))}
        </div>
        {settings.aiMode === 'server' && (
          <label className="field">
            Адрес сервера HinoVerse (пусто — тот же, что у приложения)
            <input className="input" value={settings.serverUrl} placeholder="https://hinoverse.example.com" onChange={(e) => set({ serverUrl: e.target.value.trim() })} />
          </label>
        )}
        {settings.aiMode === 'direct' && (
          <label className="field">
            Ключ Anthropic API
            <input className="input" type="password" value={settings.apiKey} placeholder="sk-ant-…" onChange={(e) => set({ apiKey: e.target.value.trim() })} autoComplete="off" />
            <span className="tiny faint">Ключ хранится только на этом устройстве и не синхронизируется. Запросы идут из браузера напрямую в Anthropic.</span>
          </label>
        )}
        <div className="row">
          <button className="btn" onClick={testAi}>
            Проверить подключение
          </button>
          <span className="small">{aiStatus}</span>
        </div>
      </Section>

      <Section title="Синхронизация между устройствами">
        <p className="small muted" style={{ margin: 0 }}>
          Один код — на телефоне, компьютере и в браузере. Прогресс объединяется автоматически (нужен сервер HinoVerse).
        </p>
        {STATIC_BUILD && (
          <label className="field">
            Адрес сервера HinoVerse
            <input className="input" value={settings.serverUrl} placeholder="https://hinoverse.example.com" onChange={(e) => set({ serverUrl: e.target.value.trim() })} />
            <span className="tiny faint">Эта версия приложения работает без собственного сервера. Для синхронизации укажите адрес сервера (Docker-образ из репозитория).</span>
          </label>
        )}
        {settings.syncCode ? (
          <>
            <div className="row">
              <span>Ваш код:</span>
              <code style={{ fontSize: '1.2rem', letterSpacing: '0.05em' }}>{settings.syncCode}</code>
              <button className="btn small" onClick={() => navigator.clipboard?.writeText(settings.syncCode)}>
                Копировать
              </button>
            </div>
            <label className="switch">
              <input type="checkbox" checked={settings.autoSync} onChange={(e) => set({ autoSync: e.target.checked })} /> Синхронизировать автоматически
            </label>
            <div className="row">
              <button className="btn primary" onClick={() => doSync()}>
                Синхронизировать сейчас
              </button>
              <button className="btn ghost" onClick={() => set({ syncCode: '' })}>
                Отключить
              </button>
              <span className="small">{syncStatus}</span>
            </div>
          </>
        ) : (
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                const code = generateSyncCode();
                set({ syncCode: code });
                void doSync(code);
              }}
            >
              Создать код
            </button>
            <span className="muted">или</span>
            <input className="input" style={{ maxWidth: 200 }} placeholder="HV-XXXXX-XXXXX" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().trim())} />
            <button
              className="btn"
              disabled={!isValidSyncCode(codeInput)}
              onClick={() => {
                set({ syncCode: codeInput });
                void doSync(codeInput);
              }}
            >
              Подключить
            </button>
            <span className="small">{syncStatus}</span>
          </div>
        )}
        <div className="row">
          <button className="btn small" onClick={exportData}>
            ⬇ Экспорт прогресса
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            ⬆ Импорт
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </div>
      </Section>

      <Section title="Установка на устройства">
        <ul className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
          <li><strong>Android</strong> (Chrome): меню ⋮ → «Установить приложение».</li>
          <li><strong>iPhone / iPad</strong> (Safari): «Поделиться» → «На экран „Домой“».</li>
          <li><strong>Windows, macOS, Linux</strong> (Chrome / Edge): значок установки в адресной строке.</li>
          <li><strong>Web</strong>: просто откройте сайт. После первого запуска уроки работают без интернета.</li>
        </ul>
      </Section>

      <Section title="Опасная зона">
        <button
          className="btn"
          style={{ alignSelf: 'flex-start', color: 'var(--accent)' }}
          onClick={() => {
            if (confirm('Удалить весь прогресс на этом устройстве? Настройки сохранятся.')) resetAll();
          }}
        >
          Сбросить прогресс
        </button>
      </Section>
    </div>
  );
}
