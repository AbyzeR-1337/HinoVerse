// Сервер HinoVerse: раздаёт собранное приложение, проксирует запросы к Claude
// (ключ API хранится только здесь) и хранит синхронизированный прогресс.
//
//   npm run server      — разработка (вместе с `npm run dev`)
//   npm start           — продакшен (после `npm run build`)
import http from 'node:http';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { runChatStream, runCorrection, runTutorPlan, type ChatInput, type CorrectionInput } from '../src/core/ai/requests.ts';
import { mergeProgress, isValidSyncCode } from '../src/core/sync.ts';
import type { ProgressData } from '../src/store/progress.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* .env необязателен */
}

const PORT = Number(process.env.PORT ?? 8787);
const DIST = path.join(root, 'dist');
const SYNC_DIR = path.resolve(root, process.env.SYNC_DIR ?? 'server/storage');
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '';
const MAX_BODY = 6 * 1024 * 1024;

const anthropic = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;

// ───────────────────────── утилиты ─────────────────────────

function send(res: http.ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

async function readBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T;
  } catch {
    throw Object.assign(new Error('Некорректный JSON'), { status: 400 });
  }
}

/** Простое ограничение частоты запросов к ИИ: не больше 40 в минуту с одного адреса. */
const buckets = new Map<string, { tokens: number; at: number }>();
function allowAi(req: http.IncomingMessage): boolean {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ?? req.socket.remoteAddress ?? '?';
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: 40, at: now };
  b.tokens = Math.min(40, b.tokens + ((now - b.at) / 60_000) * 40);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

function aiErrorMessage(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) return { status: 502, message: 'Неверный ключ ANTHROPIC_API_KEY на сервере.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'ИИ перегружен запросами. Подождите минуту.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: `Запрос отклонён: ${err.message}` };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Ошибка ИИ-сервиса (${err.status ?? '?'}).` };
  if (err instanceof Error) return { status: 500, message: err.message };
  return { status: 500, message: 'Неизвестная ошибка' };
}

// ───────────────────────── API ─────────────────────────

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const p = url.pathname;

  if (p === '/api/health') return send(res, 200, { ok: true });

  if (p === '/api/ai/status') return send(res, 200, { available: !!anthropic });

  if (p.startsWith('/api/ai/')) {
    if (req.method !== 'POST') return send(res, 405, { error: 'Метод не поддерживается' });
    if (!anthropic) return send(res, 503, { error: 'ИИ не настроен: задайте ANTHROPIC_API_KEY на сервере или укажите личный ключ в настройках.' });
    if (!allowAi(req)) return send(res, 429, { error: 'Слишком много запросов. Подождите немного.' });

    if (p === '/api/ai/chat') {
      const input = await readBody<ChatInput>(req);
      if (!input || !Array.isArray(input.history) || (input.kind !== 'roleplay' && input.kind !== 'teacher'))
        return send(res, 400, { error: 'Некорректный запрос' });
      input.history = input.history.slice(-40).map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.content).slice(0, 4000) }));
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const abort = new AbortController();
      res.on('close', () => abort.abort());
      try {
        const result = await runChatStream(
          anthropic,
          input,
          (t) => res.write(`data: ${JSON.stringify({ t })}\n\n`),
          abort.signal,
        );
        res.write(`data: ${JSON.stringify({ done: true, stop: result.stopReason })}\n\n`);
      } catch (err) {
        if (!abort.signal.aborted) res.write(`data: ${JSON.stringify({ error: aiErrorMessage(err).message })}\n\n`);
      }
      return res.end();
    }

    if (p === '/api/ai/correct') {
      const input = await readBody<CorrectionInput>(req);
      if (!input?.text || input.text.length > 8000) return send(res, 400, { error: 'Текст пустой или слишком длинный (до 8000 символов).' });
      try {
        return send(res, 200, await runCorrection(anthropic, input));
      } catch (err) {
        const e = aiErrorMessage(err);
        return send(res, e.status, { error: e.message });
      }
    }

    if (p === '/api/ai/plan') {
      const { report } = await readBody<{ report: string }>(req);
      if (!report || report.length > 20000) return send(res, 400, { error: 'Некорректный отчёт' });
      try {
        return send(res, 200, await runTutorPlan(anthropic, report));
      } catch (err) {
        const e = aiErrorMessage(err);
        return send(res, e.status, { error: e.message });
      }
    }
    return send(res, 404, { error: 'Не найдено' });
  }

  const sync = p.match(/^\/api\/sync\/([A-Z0-9-]+)$/);
  if (sync) {
    const code = sync[1];
    if (!isValidSyncCode(code)) return send(res, 400, { error: 'Некорректный код синхронизации' });
    const file = path.join(SYNC_DIR, `${code}.json`);
    if (req.method === 'GET') {
      if (!existsSync(file)) return send(res, 404, { error: 'Нет данных' });
      return send(res, 200, JSON.parse(await fs.readFile(file, 'utf-8')));
    }
    if (req.method === 'PUT') {
      const { data } = await readBody<{ data: ProgressData }>(req);
      if (!data || typeof data !== 'object' || !data.cards) return send(res, 400, { error: 'Некорректные данные' });
      await fs.mkdir(SYNC_DIR, { recursive: true });
      let merged = data;
      if (existsSync(file)) {
        // параллельные записи с разных устройств не теряются — сервер тоже сливает
        const prev = JSON.parse(await fs.readFile(file, 'utf-8')) as { data: ProgressData };
        merged = mergeProgress(data, prev.data);
      }
      merged = { ...merged, settings: { ...merged.settings, apiKey: '' } };
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify({ data: merged, savedAt: Date.now() }));
      await fs.rename(tmp, file);
      return send(res, 200, { ok: true, updatedAt: merged.updatedAt });
    }
    return send(res, 405, { error: 'Метод не поддерживается' });
  }

  return send(res, 404, { error: 'Не найдено' });
}

// ───────────────────────── статика ─────────────────────────

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const gzCache = new Map<string, Buffer>();

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(DIST, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'Запрещено' });
  if (!existsSync(file) || !(await fs.stat(file)).isFile()) {
    if (path.extname(rel)) return send(res, 404, { error: 'Не найдено' });
    file = path.join(DIST, 'index.html'); // SPA
  }
  if (!existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Приложение не собрано. Выполните `npm run build` или используйте `npm run dev`.');
  }
  const ext = path.extname(file);
  const type = TYPES[ext] ?? 'application/octet-stream';
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
  };
  const compressible = /text|json|javascript|svg|manifest/.test(type);
  if (compressible && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    // ключ кэша учитывает время изменения файла — после новой сборки отдаётся свежая версия
    const key = `${file}:${(await fs.stat(file)).mtimeMs}`;
    let gz = gzCache.get(key);
    if (!gz) {
      gz = zlib.gzipSync(await fs.readFile(file), { level: 6 });
      if (gz.length < 8 * 1024 * 1024) gzCache.set(key, gz);
    }
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return res.end(gz);
  }
  res.writeHead(200, headers);
  res.end(await fs.readFile(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
  }
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    if (!res.headersSent) send(res, status, { error: err instanceof Error ? err.message : 'Ошибка' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`HinoVerse: http://localhost:${PORT}`);
  console.log(anthropic ? 'ИИ: подключён (Claude)' : 'ИИ: ключ не задан — работают офлайн-сценарии');
});
