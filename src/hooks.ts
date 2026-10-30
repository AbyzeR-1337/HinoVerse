import { useEffect, useMemo, useRef, useState } from 'react';
import { getManifest, type DataManifest } from './core/data';
import { buildCourse, flattenLessons, type LessonRef, type Stage } from './content/curriculum';
import { useProgress, snapshot } from './store/progress';
import { syncNow } from './core/sync';

/** Загрузка асинхронных данных с состояниями «загрузка / ошибка». */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | undefined; error: string | null; loading: boolean }>({ data: undefined, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: undefined, error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

let manifestCache: DataManifest | null = null;

export function useManifest(): DataManifest | null {
  const [m, setM] = useState<DataManifest | null>(manifestCache);
  useEffect(() => {
    if (manifestCache) return;
    getManifest()
      .then((x) => {
        manifestCache = x;
        setM(x);
      })
      .catch(() => {});
  }, []);
  return m;
}

export function useCourse(): { stages: Stage[]; lessons: LessonRef[] } {
  const manifest = useManifest();
  return useMemo(() => {
    const stages = buildCourse(manifest);
    return { stages, lessons: flattenLessons(stages) };
  }, [manifest]);
}

/** Следующий непройденный урок курса. */
export function useNextLesson(): LessonRef | undefined {
  const { lessons } = useCourse();
  const done = useProgress((s) => s.lessons);
  return lessons.find((l) => !done[l.id]);
}

/** Автоматическая синхронизация прогресса между устройствами. */
export function useAutoSync() {
  const { syncCode, autoSync, serverUrl } = useProgress((s) => s.settings);
  const updatedAt = useProgress((s) => s.updatedAt);
  const replaceAll = useProgress((s) => s.replaceAll);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncing = useRef(false);
  const lastSynced = useRef(0);

  useEffect(() => {
    if (!syncCode || !autoSync) return;
    const run = async () => {
      if (syncing.current || !navigator.onLine) return;
      syncing.current = true;
      try {
        const local = snapshot();
        const merged = await syncNow(serverUrl, syncCode, local);
        lastSynced.current = merged.updatedAt;
        const changed =
          merged.updatedAt > local.updatedAt ||
          Object.keys(merged.cards).length !== Object.keys(local.cards).length ||
          Object.keys(merged.lessons).length !== Object.keys(local.lessons).length;
        if (changed) replaceAll({ ...merged, settings: useProgress.getState().settings });
      } catch {
        /* нет сети или сервера — попробуем позже */
      } finally {
        syncing.current = false;
      }
    };
    if (updatedAt > lastSynced.current) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, 4000);
    }
    const onFocus = () => void run();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [syncCode, autoSync, serverUrl, updatedAt, replaceAll]);
}

export function useTheme() {
  const theme = useProgress((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

export function lessonPath(l: LessonRef): string {
  return `/lesson/${encodeURIComponent(l.id)}`;
}
