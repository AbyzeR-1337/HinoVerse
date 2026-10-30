// Разбор контуров KanjiVG и проверка штрихов, нарисованных пользователем.
// Координаты KanjiVG лежат в квадрате 109×109.

export interface Pt {
  x: number;
  y: number;
}

export const KVG_SIZE = 109;

/** Превращает атрибут d SVG-пути (M, L, C, S, Q, H, V, Z — абсолютные и относительные) в ломаную. */
export function pathToPoints(d: string, samplesPerCurve = 12): Pt[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCtrl: Pt | null = null;
  const num = () => parseFloat(tokens[i++]);
  const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
    for (let k = 1; k <= samplesPerCurve; k++) {
      const t = k / samplesPerCurve;
      const u = 1 - t;
      pts.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        cx = ox + num();
        cy = oy + num();
        sx = cx;
        sy = cy;
        pts.push({ x: cx, y: cy });
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L': {
        cx = ox + num();
        cy = oy + num();
        pts.push({ x: cx, y: cy });
        lastCtrl = null;
        break;
      }
      case 'H': {
        cx = (rel ? cx : 0) + num();
        pts.push({ x: cx, y: cy });
        lastCtrl = null;
        break;
      }
      case 'V': {
        cy = (rel ? cy : 0) + num();
        pts.push({ x: cx, y: cy });
        lastCtrl = null;
        break;
      }
      case 'C': {
        const p1 = { x: ox + num(), y: oy + num() };
        const p2 = { x: ox + num(), y: oy + num() };
        const p3 = { x: ox + num(), y: oy + num() };
        cubic({ x: cx, y: cy }, p1, p2, p3);
        lastCtrl = p2;
        cx = p3.x;
        cy = p3.y;
        break;
      }
      case 'S': {
        const p1 = lastCtrl ? { x: 2 * cx - lastCtrl.x, y: 2 * cy - lastCtrl.y } : { x: cx, y: cy };
        const p2 = { x: ox + num(), y: oy + num() };
        const p3 = { x: ox + num(), y: oy + num() };
        cubic({ x: cx, y: cy }, p1, p2, p3);
        lastCtrl = p2;
        cx = p3.x;
        cy = p3.y;
        break;
      }
      case 'Q': {
        const q = { x: ox + num(), y: oy + num() };
        const p3 = { x: ox + num(), y: oy + num() };
        const p1 = { x: cx + (2 / 3) * (q.x - cx), y: cy + (2 / 3) * (q.y - cy) };
        const p2 = { x: p3.x + (2 / 3) * (q.x - p3.x), y: p3.y + (2 / 3) * (q.y - p3.y) };
        cubic({ x: cx, y: cy }, p1, p2, p3);
        lastCtrl = null;
        cx = p3.x;
        cy = p3.y;
        break;
      }
      case 'Z': {
        cx = sx;
        cy = sy;
        pts.push({ x: cx, y: cy });
        lastCtrl = null;
        break;
      }
      default:
        i++; // неизвестная команда — пропускаем
    }
  }
  return pts;
}

export function pathLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Равномерная передискретизация ломаной в n точек. */
export function resample(pts: Pt[], n = 32): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const total = pathLength(pts);
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const step = total / (n - 1);
  const out: Pt[] = [{ ...pts[0] }];
  let acc = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length && out.length < n; i++) {
    let cur = pts[i];
    let seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    while (acc + seg >= step && out.length < n) {
      const t = (step - acc) / seg;
      const np = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(np);
      prev = np;
      seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      acc = 0;
    }
    acc += seg;
    prev = cur;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out;
}

function avgDist(a: Pt[], b: Pt[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return s / a.length;
}

function centroid(p: Pt[]): Pt {
  const c = p.reduce((acc, q) => ({ x: acc.x + q.x, y: acc.y + q.y }), { x: 0, y: 0 });
  return { x: c.x / p.length, y: c.y / p.length };
}

function translate(p: Pt[], dx: number, dy: number): Pt[] {
  return p.map((q) => ({ x: q.x + dx, y: q.y + dy }));
}

export type StrokeIssue = 'ok' | 'direction' | 'position' | 'shape' | 'short' | 'long' | 'order';

export interface StrokeCheck {
  ok: boolean;
  score: number; // 0..1
  issue: StrokeIssue;
  message: string;
  matchedIndex: number; // какой черте соответствует рисунок
}

const ISSUE_TEXT: Record<StrokeIssue, string> = {
  ok: 'Отлично!',
  direction: 'Черта проведена в обратном направлении. Японские черты пишутся сверху вниз и слева направо.',
  position: 'Форма верная, но черта смещена. Следите за положением внутри клетки.',
  shape: 'Форма черты отличается от образца. Посмотрите анимацию ещё раз.',
  short: 'Черта слишком короткая.',
  long: 'Черта слишком длинная.',
  order: 'Это другая черта — нарушен порядок написания.',
};

/**
 * Сравнивает нарисованную черту (в координатах 109×109) с ожидаемой.
 * Оценивает форму, положение, длину и направление; проверяет порядок черт.
 */
export function checkStroke(drawn: Pt[], strokes: Pt[][], expectedIndex: number, leniency = 1): StrokeCheck {
  const N = 32;
  const user = resample(drawn, N);
  const result = (issue: StrokeIssue, score: number, idx = expectedIndex): StrokeCheck => ({
    ok: issue === 'ok',
    score,
    issue,
    message: ISSUE_TEXT[issue],
    matchedIndex: idx,
  });
  if (drawn.length < 2 || pathLength(drawn) < 4) return result('short', 0);

  const evalAgainst = (ref: Pt[]) => {
    const r = resample(ref, N);
    const direct = avgDist(user, r);
    const reversed = avgDist([...user].reverse(), r);
    const cu = centroid(user);
    const cr = centroid(r);
    const shape = avgDist(translate(user, cr.x - cu.x, cr.y - cu.y), r);
    const shift = Math.hypot(cu.x - cr.x, cu.y - cr.y);
    const lenRatio = pathLength(drawn) / Math.max(1, pathLength(ref));
    return { direct, reversed, shape, shift, lenRatio };
  };

  const tol = 13 * leniency;
  const exp = strokes[expectedIndex];
  if (!exp) return result('shape', 0);
  const m = evalAgainst(exp);
  const score = Math.max(0, 1 - m.direct / (tol * 2.5));

  if (m.direct <= tol && m.lenRatio > 0.45 && m.lenRatio < 1.9) return result('ok', score);

  // возможно, пользователь нарисовал другую черту
  for (let k = 0; k < strokes.length; k++) {
    if (k === expectedIndex) continue;
    const o = evalAgainst(strokes[k]);
    if (o.direct <= tol * 0.8 && o.direct < m.direct * 0.6) return result('order', 0.2, k);
  }
  if (m.reversed <= tol && m.reversed < m.direct * 0.6) return result('direction', 0.3);
  if (m.lenRatio <= 0.45) return result('short', score);
  if (m.lenRatio >= 1.9) return result('long', score);
  if (m.shape <= tol && m.shift > tol) return result('position', Math.max(score, 0.4));
  // мягкий режим: форма похожа, небольшое смещение
  if (m.direct <= tol * 1.35 && m.shape <= tol) return result('ok', score);
  return result('shape', score);
}
