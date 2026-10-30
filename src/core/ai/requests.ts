// Запросы к Claude: ролевые диалоги, проверка письма, план ИИ-преподавателя.
// Этот модуль общий для сервера (server/index.ts) и прямого режима в браузере,
// поэтому он принимает уже созданный клиент Anthropic.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

export const MODEL = 'claude-opus-5-5';
// Если основная модель отклонит запрос по правилам безопасности, сервер API сам повторит его
// на рекомендованной резервной модели («default» — маршрутизация по категории отказа).
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Persona {
  id: string;
  nameJa: string;
  roleRu: string;
  setting: string; // описание ситуации (на русском)
  register: 'keigo' | 'teinei' | 'casual';
  goal?: string; // что должен сделать ученик
}

export interface RoleplayInput {
  persona: Persona;
  level: number; // 5..1 (N5..N1), 0 — не знаю
  history: ChatTurn[];
  learnerName?: string;
}

export interface TeacherInput {
  level: number;
  history: ChatTurn[];
  topic?: string;
}

const LEVEL_GUIDE: Record<number, string> = {
  5: 'JLPT N5 (absolute beginner): very short sentences, basic です/ます forms, only the ~100 most basic kanji (otherwise write words in hiragana), common everyday words.',
  4: 'JLPT N4: short sentences, polite forms, て-form, basic conjunctions, only N5–N4 kanji.',
  3: 'JLPT N3: natural everyday speech at a moderate pace, common kanji, some casual contractions are fine.',
  2: 'JLPT N2: natural native-like speech, wide vocabulary, idiomatic expressions.',
  1: 'JLPT N1: fully natural native speech, including idioms, nuance and complex grammar.',
  0: 'unknown level: start simple (N5–N4) and adapt to how well the learner writes.',
};

const REGISTER_GUIDE: Record<Persona['register'], string> = {
  keigo: 'Use honorific/humble business Japanese (敬語: いらっしゃいませ, 少々お待ちください, etc.) as a real staff member would.',
  teinei: 'Use polite です/ます Japanese.',
  casual: 'Use casual plain-form Japanese (タメ口) as between friends.',
};

export function roleplaySystem(input: RoleplayInput): string {
  const { persona, level } = input;
  return [
    `You are ${persona.nameJa}, ${persona.roleRu} (role description in Russian). Situation: ${persona.setting}`,
    persona.goal ? `The learner's task in this scene: ${persona.goal}` : '',
    'This is a spoken role-play inside a Japanese course for Russian speakers. Stay in character as a real person in this situation would: react naturally, ask follow-up questions, move the scene forward, and do not lecture.',
    `Language level: ${LEVEL_GUIDE[level] ?? LEVEL_GUIDE[0]}`,
    REGISTER_GUIDE[persona.register],
    'Your lines are read aloud by speech synthesis, so keep each reply to 1–3 short sentences and never use romaji, emoji or stage directions.',
    'If the learner writes in Russian, asks what something means, or is clearly stuck, answer in simple Japanese and help them in the <fix> block in Russian, then continue the scene.',
    'Reply in exactly this format:',
    '<ja>your Japanese line</ja>',
    '<ru>its natural Russian translation</ru>',
    '<fix>only if the learner\'s last message had a mistake or was unnatural: a short friendly correction in Russian with the correct Japanese phrase; omit this block otherwise</fix>',
  ]
    .filter(Boolean)
    .join('\n');
}

export function teacherSystem(input: TeacherInput): string {
  return [
    'You are a patient, precise Japanese teacher for Russian speakers inside the HinoVerse app.',
    'Answer in Russian. Explain Japanese grammar, vocabulary, kanji, pronunciation and culture in plain words, compare with Russian where it helps, and always give 2–4 short Japanese examples with kana reading in parentheses and a Russian translation.',
    `Learner level: ${LEVEL_GUIDE[input.level] ?? LEVEL_GUIDE[0]}`,
    input.topic ? `Current lesson topic: ${input.topic}` : '',
    'Keep answers focused (under ~250 words unless the learner asks for more). Use simple Markdown: short paragraphs, bullet lists, **bold** for key forms.',
  ]
    .filter(Boolean)
    .join('\n');
}

export type ChatKind = 'roleplay' | 'teacher';

export type ChatInput = ({ kind: 'roleplay' } & RoleplayInput) | ({ kind: 'teacher' } & TeacherInput);

function chatParams(input: ChatInput) {
  const system = input.kind === 'roleplay' ? roleplaySystem(input) : teacherSystem(input);
  const history = input.history.length ? input.history : [{ role: 'user' as const, content: 'こんにちは' }];
  return {
    model: MODEL,
    max_tokens: input.kind === 'roleplay' ? 2048 : 8000,
    system,
    messages: history.map((t) => ({ role: t.role, content: t.content })),
    // Живой диалог чувствителен к задержке: низкое усилие даёт быстрый первый ответ.
    output_config: { effort: input.kind === 'roleplay' ? ('low' as const) : ('medium' as const) },
    betas: [FALLBACK_BETA],
    fallbacks: 'default' as const,
  };
}

export class AiRefusalError extends Error {
  constructor() {
    super('Модель отказалась отвечать на этот запрос. Попробуйте переформулировать.');
  }
}

/** Потоковый ответ. onText получает кусочки текста по мере генерации. */
export async function runChatStream(
  client: Anthropic,
  input: ChatInput,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; stopReason: string | null }> {
  const stream = client.beta.messages.stream(chatParams(input), { signal });
  stream.on('text', (delta) => onText(delta));
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw new AiRefusalError();
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return { text, stopReason: message.stop_reason };
}

// ───────────────────────── проверка письменных работ ─────────────────────────

export const CorrectionSchema = z.object({
  corrected: z.string().describe('The full corrected Japanese text, keeping the learner’s meaning and register'),
  natural: z.string().describe('How a native speaker would naturally write the same thing'),
  score: z.number().describe('Overall score 0-100 for accuracy and naturalness at the stated level'),
  level_estimate: z.string().describe('Estimated JLPT level of the text: N5, N4, N3, N2 or N1'),
  summary_ru: z.string().describe('2-3 sentence overall feedback in Russian'),
  edits: z
    .array(
      z.object({
        original: z.string(),
        corrected: z.string(),
        category: z.enum(['grammar', 'particle', 'vocabulary', 'kanji', 'spelling', 'politeness', 'style', 'punctuation', 'format']),
        explanation_ru: z.string().describe('Why this change is needed, in Russian, with the rule'),
      }),
    )
    .describe('Every individual correction, in text order'),
  tips_ru: z.array(z.string()).describe('2-4 concrete tips in Russian for this learner'),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export interface CorrectionInput {
  taskTitle: string;
  taskDescription: string;
  register: 'casual' | 'polite' | 'formal';
  level: number;
  text: string;
}

export async function runCorrection(client: Anthropic, input: CorrectionInput): Promise<Correction> {
  const message = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [
      'You are an expert Japanese writing teacher for Russian-speaking learners.',
      'Correct the learner’s text: fix grammar, particles, word choice, kanji, okurigana, spelling and register; keep their meaning and voice.',
      'Explain every edit in Russian clearly enough that the learner understands the rule. Do not invent content they did not write.',
      'If the text is already correct, return it unchanged with an empty edits list and say what is good about it.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `Задание: ${input.taskTitle}. ${input.taskDescription}`,
          `Требуемый стиль: ${input.register === 'casual' ? 'разговорный (простая форма)' : input.register === 'polite' ? 'вежливый (です/ます)' : 'официальный, деловой (敬語)'}`,
          `Уровень ученика: ${input.level ? `N${input.level}` : 'не указан'}`,
          'Текст ученика:',
          input.text,
        ].join('\n'),
      },
    ],
    output_config: { effort: 'medium', format: betaZodOutputFormat(CorrectionSchema) },
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
  });
  if (message.stop_reason === 'refusal') throw new AiRefusalError();
  if (!message.parsed_output) throw new Error('Не удалось разобрать ответ модели.');
  return message.parsed_output;
}

// ───────────────────────── план ИИ-преподавателя ─────────────────────────

export const PLAN_ROUTES = ['/review', '/course', '/kana', '/kanji', '/grammar', '/speak', '/talk', '/write', '/read', '/city', '/exam', '/dict'] as const;

export const TutorPlanSchema = z.object({
  summary_ru: z.string().describe('Short analysis of the learner’s current state, in Russian'),
  strengths_ru: z.array(z.string()),
  weaknesses_ru: z.array(z.string()),
  steps: z
    .array(
      z.object({
        title_ru: z.string(),
        minutes: z.number(),
        route: z.enum(PLAN_ROUTES),
        reason_ru: z.string(),
      }),
    )
    .describe('Ordered plan for the next study session'),
  focus_items: z.array(z.string()).describe('Specific Japanese words, kanji or grammar points to repeat'),
  motivation_ru: z.string(),
});
export type TutorPlan = z.infer<typeof TutorPlanSchema>;

export async function runTutorPlan(client: Anthropic, statsReport: string): Promise<TutorPlan> {
  const message = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [
      'You are the personal AI teacher inside the HinoVerse Japanese course for Russian speakers.',
      'From the learner statistics, diagnose strengths and weaknesses and build a concrete plan for the next session (20–40 minutes total).',
      `Each step must use one of these app sections (route): ${PLAN_ROUTES.join(', ')}. Prioritise overdue reviews and the most frequent mistakes.`,
      'Write all human-readable fields in Russian; be specific (name words, kanji, grammar points from the data).',
    ].join('\n'),
    messages: [{ role: 'user', content: statsReport }],
    output_config: { effort: 'medium', format: betaZodOutputFormat(TutorPlanSchema) },
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
  });
  if (message.stop_reason === 'refusal') throw new AiRefusalError();
  if (!message.parsed_output) throw new Error('Не удалось разобрать ответ модели.');
  return message.parsed_output;
}

/** Разбор ответа ролевого персонажа на части <ja>, <ru>, <fix> (в том числе во время потока). */
export function parseRoleplayReply(text: string): { ja: string; ru: string; fix: string } {
  const grab = (tag: string) => {
    const open = text.indexOf(`<${tag}>`);
    if (open < 0) return '';
    const start = open + tag.length + 2;
    const close = text.indexOf(`</${tag}>`, start);
    return text.slice(start, close < 0 ? undefined : close).trim();
  };
  const ja = grab('ja');
  return { ja: ja || (text.includes('<') ? '' : text.trim()), ru: grab('ru'), fix: grab('fix') };
}
