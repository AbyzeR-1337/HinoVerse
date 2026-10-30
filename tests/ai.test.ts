// Интеграционный тест запросов к Claude на локальном мок-сервере Messages API:
// проверяем форму запросов и разбор потокового и структурированного ответа.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Anthropic from '@anthropic-ai/sdk';
import { runChatStream, runCorrection, parseRoleplayReply, MODEL, type Correction } from '../src/core/ai/requests';

const seen: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
const correction: Correction = {
  corrected: '私は学生です。',
  natural: '学生です。',
  score: 85,
  level_estimate: 'N5',
  summary_ru: 'Хорошо.',
  edits: [{ original: 'わ', corrected: 'は', category: 'particle', explanation_ru: 'Частица темы пишется は.' }],
  tips_ru: ['Следите за частицами.'],
};

let server: http.Server;
let baseURL = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push({ headers: req.headers, body });
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
        send('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } } });
        send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        for (const t of ['<ja>いらっしゃい', 'ませ。</ja>\n<ru>Добро пожаловать.</ru>']) send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: t } });
        send('content_block_stop', { index: 0 });
        send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } });
        send('message_stop', {});
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'msg_2', type: 'message', role: 'assistant', model: MODEL,
            content: [{ type: 'text', text: JSON.stringify(correction) }],
            stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 40 },
          }),
        );
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const client = () => new Anthropic({ apiKey: 'test-key', baseURL, maxRetries: 0 });

describe('ИИ-запросы', () => {
  it('ролевой диалог: потоковый ответ и формат запроса', async () => {
    const chunks: string[] = [];
    const res = await runChatStream(
      client(),
      {
        kind: 'roleplay',
        level: 5,
        persona: { id: 'konbini', nameJa: '店員', roleRu: 'продавец', setting: 'комбини', register: 'keigo' },
        history: [{ role: 'user', content: 'こんにちは' }],
      },
      (t) => chunks.push(t),
    );
    expect(chunks.join('')).toContain('いらっしゃいませ');
    expect(parseRoleplayReply(res.text)).toEqual({ ja: 'いらっしゃいませ。', ru: 'Добро пожаловать.', fix: '' });
    const req = seen[seen.length - 1];
    expect(req.body.model).toBe('claude-opus-5-5');
    expect(req.body.fallbacks).toBe('default');
    expect(req.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(req.body.output_config).toEqual({ effort: 'low' });
    expect(String(req.body.system)).toContain('<ja>');
  });

  it('проверка текста: структурированный JSON', async () => {
    const r = await runCorrection(client(), { taskTitle: 'Самопредставление', taskDescription: '', register: 'polite', level: 5, text: '私わ学生です。' });
    expect(r.edits[0].corrected).toBe('は');
    const req = seen[seen.length - 1];
    const format = (req.body.output_config as { format: { type: string; schema: { properties: Record<string, unknown> } } }).format;
    expect(format.type).toBe('json_schema');
    expect(Object.keys(format.schema.properties)).toContain('edits');
  });

  it('разбор ответа во время потока', () => {
    expect(parseRoleplayReply('<ja>はい、どう').ja).toBe('はい、どう');
    expect(parseRoleplayReply('просто текст').ja).toBe('просто текст');
  });
});
