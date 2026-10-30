import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCourse, courseStats, flattenLessons, ALL_GRAMMAR } from '../src/content/curriculum';
import { KANA_GROUPS, KANA_INFO } from '../src/content/kana';
import { SCENES } from '../src/content/scenes';
import { RADICALS } from '../src/content/radicals';
import { buildLocalPlan } from '../src/core/tutor';
import { initialData } from '../src/store/progress';
import { parseFurigana, readingOf, stripFurigana } from '../src/components/Furigana';
import type { DataManifest } from '../src/core/data';

const manifest = JSON.parse(readFileSync(new URL('../public/data/manifest.json', import.meta.url), 'utf-8')) as DataManifest;

describe('курс', () => {
  const stages = buildCourse(manifest);
  const lessons = flattenLessons(stages);
  it('строится от нуля до N1', () => {
    expect(stages.map((s) => s.id)).toEqual(['start', 'kana', 'n5', 'n4', 'n3', 'n2', 'n1']);
    const stats = courseStats(stages);
    console.log('Структура курса:', stats);
    expect(stats.chapters).toBeGreaterThan(300);
    expect(stats.lessons).toBeGreaterThan(1500);
  });
  it('у уроков уникальные id и в каждой главе есть проверка', () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    for (const st of stages.slice(2)) for (const ch of st.chapters) expect(ch.lessons[ch.lessons.length - 1].kind).toBe('exam');
  });
  it('все слова и кандзи уровня покрыты уроками', () => {
    for (const level of [5, 4, 3, 2, 1]) {
      const v = lessons.filter((l) => l.kind === 'vocab' && l.level === level);
      expect(v[v.length - 1].slice![1]).toBe(manifest.vocab[`n${level}`]);
      const k = lessons.filter((l) => l.kind === 'kanji' && l.level === level);
      expect(k[k.length - 1].slice![1]).toBe(manifest.kanjiByLevel![`n${level}`]);
    }
  });
  it('все темы грамматики входят в курс', () => {
    const ids = new Set(lessons.filter((l) => l.kind === 'grammar').map((l) => l.ref));
    for (const g of ALL_GRAMMAR) expect(ids.has(g.id)).toBe(true);
  });
});

describe('контент', () => {
  it('у всей основной каны есть заметки', () => {
    for (const g of KANA_GROUPS.filter((x) => /-(a|k|s|t|n|h|m|y|w)$/.test(x.id))) for (const ch of g.chars) expect(KANA_INFO[ch], ch).toBeDefined();
  });
  it('сцены: переходы ведут на существующие узлы', () => {
    for (const s of SCENES) {
      const ids = new Set(s.nodes.map((n) => n.id));
      for (const n of s.nodes) for (const o of n.options) if (o.next !== null) expect(ids.has(o.next), `${s.id}:${n.id}→${o.next}`).toBe(true);
    }
  });
  it('214 ключей', () => {
    expect(RADICALS).toHaveLength(214);
    expect(RADICALS[71].ch).toBe('日');
  });
  it('грамматика: ответы в пределах вариантов, токены собирают пример', () => {
    for (const g of ALL_GRAMMAR) {
      for (const q of g.questions ?? []) expect(q.answer).toBeLessThan(q.options.length);
      for (const ex of g.examples) if (ex.tokens) expect(ex.tokens.split('|').join('')).toBe(stripFurigana(ex.ja).replace(/[。、！？]/g, '').replace(/\s/g, ''));
    }
  });
  it('фуригана', () => {
    expect(parseFurigana('日本{にほん}語{ご}です')).toEqual([{ text: '日本', reading: 'にほん' }, { text: '語', reading: 'ご' }, { text: 'です' }]);
    expect(readingOf('食{た}べます')).toBe('たべます');
    expect(stripFurigana('食{た}べます')).toBe('食べます');
  });
});

describe('ИИ-преподаватель (локальный план)', () => {
  it('предлагает повторение и подтягивание слабого навыка', () => {
    const d = initialData();
    d.cards.x = { id: 'x', state: 'review', due: 0, s: 1, d: 5, reps: 3, lapses: 4, last: 1 };
    d.items.x = { t: 'word', f: '猫', b: 'кошка' };
    d.skills.grammar = { correct: 2, total: 10, recent: [0, 0, 1, 0, 0, 1, 0, 0, 0, 0] };
    const plan = buildLocalPlan(d);
    expect(plan.due).toBe(1);
    expect(plan.leeches).toContain('猫');
    expect(plan.steps.some((s) => s.route === '/grammar')).toBe(true);
  });
});
