// ИИ в браузере: через сервер HinoVerse (ключ хранится на сервере)
// или напрямую с личным ключом пользователя (ключ хранится только на этом устройстве).
import type { ChatInput, Correction, CorrectionInput, TutorPlan } from './requests';
import type { Settings } from '../../store/progress';

export type AiSettings = Pick<Settings, 'aiMode' | 'serverUrl' | 'apiKey'>;

const base = (s: AiSettings) => (s.serverUrl ? s.serverUrl.replace(/\/+$/, '') : '');

let serverStatus: { at: number; ok: boolean } | null = null;

/** Доступен ли ИИ при текущих настройках. */
export async function aiAvailable(s: AiSettings): Promise<boolean> {
  if (s.aiMode === 'off') return false;
  if (s.aiMode === 'direct') return !!s.apiKey;
  if (serverStatus && Date.now() - serverStatus.at < 60_000) return serverStatus.ok;
  try {
    const res = await fetch(`${base(s)}/api/ai/status`);
    const body = res.ok ? ((await res.json()) as { available: boolean }) : { available: false };
    serverStatus = { at: Date.now(), ok: body.available };
  } catch {
    serverStatus = { at: Date.now(), ok: false };
  }
  return serverStatus.ok;
}

async function directClient(apiKey: string) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Ошибка сервера ${res.status}`;
  } catch {
    return `Ошибка сервера ${res.status}`;
  }
}

/** Потоковый диалог. Возвращает полный текст ответа. */
export async function streamChat(s: AiSettings, input: ChatInput, onText: (delta: string) => void, signal?: AbortSignal): Promise<string> {
  if (s.aiMode === 'direct') {
    const { runChatStream } = await import('./requests');
    const client = await directClient(s.apiKey);
    return (await runChatStream(client, input, onText, signal)).text;
  }
  const res = await fetch(`${base(s)}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await readError(res));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6)) as { t?: string; error?: string; done?: boolean };
      if (evt.error) throw new Error(evt.error);
      if (evt.t) {
        full += evt.t;
        onText(evt.t);
      }
    }
  }
  return full;
}

export async function correctWriting(s: AiSettings, input: CorrectionInput): Promise<Correction> {
  if (s.aiMode === 'direct') {
    const { runCorrection } = await import('./requests');
    return runCorrection(await directClient(s.apiKey), input);
  }
  const res = await fetch(`${base(s)}/api/ai/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as Correction;
}

export async function tutorPlan(s: AiSettings, report: string): Promise<TutorPlan> {
  if (s.aiMode === 'direct') {
    const { runTutorPlan } = await import('./requests');
    return runTutorPlan(await directClient(s.apiKey), report);
  }
  const res = await fetch(`${base(s)}/api/ai/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as TutorPlan;
}
