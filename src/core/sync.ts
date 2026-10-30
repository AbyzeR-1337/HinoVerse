// Синхронизация прогресса между устройствами через сервер HinoVerse.
// Каждое устройство с одинаковым кодом синхронизации получает общий прогресс;
// конфликты решаются слиянием (карточки — по последнему повторению, счётчики — по максимуму).
import type { Card } from './srs';
import type { ProgressData, Skill, SkillStat } from '../store/progress';

export function generateSyncCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `HV-${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function isValidSyncCode(code: string): boolean {
  return /^HV-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code);
}

function mergeRecordMax(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

function laterCard(a: Card | undefined, b: Card | undefined): Card {
  if (!a) return b!;
  if (!b) return a;
  if (a.last !== b.last) return a.last > b.last ? a : b;
  return a.reps >= b.reps ? a : b;
}

function mergeSkill(a: SkillStat | undefined, b: SkillStat | undefined): SkillStat {
  if (!a) return b!;
  if (!b) return a;
  return a.total >= b.total ? a : b;
}

/** Слияние двух снимков прогресса. Настройки устройства (тема, голос, ключ) остаются локальными. */
export function mergeProgress(local: ProgressData, remote: ProgressData): ProgressData {
  const cards: Record<string, Card> = { ...local.cards };
  for (const [id, c] of Object.entries(remote.cards ?? {})) cards[id] = laterCard(cards[id], c);

  const lessons = { ...local.lessons };
  for (const [id, r] of Object.entries(remote.lessons ?? {})) {
    const l = lessons[id];
    lessons[id] = l
      ? { score: Math.max(l.score, r.score), at: Math.max(l.at, r.at), count: Math.max(l.count, r.count) }
      : r;
  }

  const skills = { ...local.skills };
  for (const [k, v] of Object.entries(remote.skills ?? {})) skills[k as Skill] = mergeSkill(skills[k as Skill], v);

  const mistakeMap = new Map(local.mistakes.map((m) => [m.id, m]));
  for (const m of remote.mistakes ?? []) mistakeMap.set(m.id, m);
  const mistakes = [...mistakeMap.values()].sort((a, b) => b.at - a.at).slice(0, 300);

  const pronMap = new Map(local.pronunciation.map((p) => [`${p.at}|${p.text}`, p]));
  for (const p of remote.pronunciation ?? []) pronMap.set(`${p.at}|${p.text}`, p);
  const pronunciation = [...pronMap.values()].sort((a, b) => b.at - a.at).slice(0, 200);

  const xpByDay = mergeRecordMax(local.xpByDay, remote.xpByDay ?? {});
  const newer = remote.updatedAt > local.updatedAt ? remote : local;

  return {
    ...local,
    version: Math.max(local.version, remote.version ?? 1),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt ?? 0),
    name: newer.name || local.name || remote.name,
    startedAt: Math.min(local.startedAt, remote.startedAt ?? local.startedAt),
    xp: Math.max(local.xp, remote.xp ?? 0, Object.values(xpByDay).reduce((s, x) => s + x, 0)),
    xpByDay,
    streak: newer.streak,
    lastDay: [local.lastDay, remote.lastDay ?? ''].sort().pop() ?? '',
    lessons,
    cards,
    items: { ...(remote.items ?? {}), ...local.items },
    skills,
    mistakes,
    pronunciation,
    quests: mergeRecordMax(local.quests, remote.quests ?? {}),
    qteBest: mergeRecordMax(local.qteBest, remote.qteBest ?? {}),
    achievements: [...new Set([...local.achievements, ...(remote.achievements ?? [])])],
    plan: (remote.plan?.at ?? 0) > (local.plan?.at ?? 0) ? remote.plan : local.plan,
    settings: local.settings,
  };
}

/** Данные для отправки: без секретов (ключ API никогда не покидает устройство). */
export function stripSecrets(d: ProgressData): ProgressData {
  return { ...d, settings: { ...d.settings, apiKey: '' } };
}

export interface SyncResult {
  data: ProgressData;
  remoteUpdatedAt: number;
}

function apiBase(serverUrl: string): string {
  return serverUrl ? serverUrl.replace(/\/+$/, '') : '';
}

export async function pullProgress(serverUrl: string, code: string): Promise<ProgressData | null> {
  const res = await fetch(`${apiBase(serverUrl)}/api/sync/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Сервер синхронизации ответил ${res.status}`);
  const body = (await res.json()) as { data: ProgressData };
  return body.data;
}

export async function pushProgress(serverUrl: string, code: string, data: ProgressData): Promise<void> {
  const res = await fetch(`${apiBase(serverUrl)}/api/sync/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: stripSecrets(data) }),
  });
  if (!res.ok) throw new Error(`Сервер синхронизации ответил ${res.status}`);
}

/** Полный цикл: скачать → слить → загрузить. */
export async function syncNow(serverUrl: string, code: string, local: ProgressData): Promise<ProgressData> {
  const remote = await pullProgress(serverUrl, code);
  const merged = remote ? mergeProgress(local, remote) : local;
  await pushProgress(serverUrl, code, merged);
  return merged;
}
