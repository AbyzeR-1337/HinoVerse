// Анимация порядка черт и тренажёр письма от руки с проверкой каждой черты.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { getStrokes } from '../core/data';
import { checkStroke, pathToPoints, KVG_SIZE, type Pt, type StrokeCheck } from '../core/strokes';
import { useProgress } from '../store/progress';

export function useStrokeData(ch: string) {
  const [paths, setPaths] = useState<string[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setPaths(undefined);
    getStrokes(ch)
      .then((p) => alive && setPaths(p))
      .catch(() => alive && setPaths(null));
    return () => {
      alive = false;
    };
  }, [ch]);
  return paths;
}

function Grid() {
  return (
    <g className="draw-grid">
      <line x1={KVG_SIZE / 2} y1={0} x2={KVG_SIZE / 2} y2={KVG_SIZE} strokeWidth={0.5} />
      <line x1={0} y1={KVG_SIZE / 2} x2={KVG_SIZE} y2={KVG_SIZE / 2} strokeWidth={0.5} />
    </g>
  );
}

/** Анимация написания: черты появляются по порядку, с номерами. */
export function StrokeAnimator({ ch, size = 220, speed = 1 }: { ch: string; size?: number; speed?: number }) {
  const paths = useStrokeData(ch);
  const [run, setRun] = useState(0);
  const [showNums, setShowNums] = useState(true);
  if (paths === undefined) return <div className="draw-box" style={{ width: size }} />;
  if (paths === null)
    return (
      <div className="draw-box ja-serif" style={{ width: size, display: 'grid', placeItems: 'center', fontSize: size * 0.6 }}>
        {ch}
      </div>
    );
  const per = 0.6 / speed;
  return (
    <div className="col" style={{ alignItems: 'center' }}>
      <div className="draw-box" style={{ width: size }}>
        <svg viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} key={run}>
          <Grid />
          {paths.map((d, i) => (
            <path key={`g${i}`} d={d} className="stroke-ghost" fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {paths.map((d, i) => (
            <path
              key={i}
              d={d}
              className="stroke-anim"
              fill="none"
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: 1,
                animation: `draw ${per}s ease ${i * (per + 0.15)}s forwards`,
              }}
            />
          ))}
          {showNums &&
            paths.map((d, i) => {
              const p = pathToPoints(d, 2)[0];
              return (
                <text key={`n${i}`} x={p.x - 3} y={p.y - 2} fontSize={7} fill="var(--indigo)" fontWeight={700}>
                  {i + 1}
                </text>
              );
            })}
        </svg>
        <style>{'@keyframes draw { to { stroke-dashoffset: 0; } }'}</style>
      </div>
      <div className="row">
        <button className="btn small" onClick={() => setRun((r) => r + 1)}>
          ▶ Повторить
        </button>
        <label className="switch small">
          <input type="checkbox" checked={showNums} onChange={(e) => setShowNums(e.target.checked)} /> номера
        </label>
        <span className="small faint">черт: {paths.length}</span>
      </div>
    </div>
  );
}

export interface DrawResult {
  score: number;
  mistakes: StrokeCheck[];
}

/**
 * Пишем символ пальцем или мышью. Каждая черта сразу проверяется: форма, направление,
 * положение, порядок. После 2 ошибок на одной черте показывается подсказка.
 */
export function DrawPad({ ch, onDone, guide = true, size }: { ch: string; onDone?: (r: DrawResult) => void; guide?: boolean; size?: number }) {
  const paths = useStrokeData(ch);
  const leniency = useProgress((s) => s.settings.strokeLeniency);
  const ref = useRef<SVGSVGElement>(null);
  const [done, setDone] = useState<string[]>([]);
  const [current, setCurrent] = useState<Pt[] | null>(null);
  const [message, setMessage] = useState<StrokeCheck | null>(null);
  const [fails, setFails] = useState(0);
  const [mistakes, setMistakes] = useState<StrokeCheck[]>([]);
  const [finished, setFinished] = useState(false);
  const refStrokes = useMemo(() => (paths ? paths.map((d) => pathToPoints(d)) : []), [paths]);

  useEffect(() => {
    setDone([]);
    setCurrent(null);
    setMessage(null);
    setFails(0);
    setMistakes([]);
    setFinished(false);
  }, [ch]);

  const toLocal = (e: PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * KVG_SIZE, y: ((e.clientY - r.top) / r.height) * KVG_SIZE };
  };

  const onDown = (e: PointerEvent) => {
    if (!paths || finished) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setCurrent([toLocal(e)]);
  };
  const onMove = (e: PointerEvent) => {
    if (!current) return;
    setCurrent((c) => (c ? [...c, toLocal(e)] : c));
  };
  const onUp = () => {
    if (!current || !paths) return;
    const idx = done.length;
    const res = checkStroke(current, refStrokes, idx, leniency);
    setCurrent(null);
    setMessage(res);
    if (res.ok) {
      const next = [...done, paths[idx]];
      setDone(next);
      setFails(0);
      if (next.length === paths.length) {
        setFinished(true);
        const score = Math.max(0, 1 - mistakes.length / (paths.length * 2));
        onDone?.({ score, mistakes });
      }
    } else {
      setFails((f) => f + 1);
      setMistakes((m) => [...m, res]);
      if (fails + 1 >= 3) {
        // после трёх ошибок черта засчитывается, чтобы не застревать
        const next = [...done, paths[idx]];
        setDone(next);
        setFails(0);
        if (next.length === paths.length) {
          setFinished(true);
          onDone?.({ score: Math.max(0, 1 - (mistakes.length + 1) / (paths.length * 2)), mistakes: [...mistakes, res] });
        }
      }
    }
  };

  const reset = () => {
    setDone([]);
    setMessage(null);
    setFails(0);
    setMistakes([]);
    setFinished(false);
  };

  if (paths === undefined) return <div className="draw-box" />;
  if (paths === null) return <div className="muted small">Для этого символа нет данных о порядке черт.</div>;
  const hintIdx = done.length;
  return (
    <div className="col" style={{ alignItems: 'center' }}>
      <div className="draw-box" style={size ? { width: size } : undefined}>
        <svg
          ref={ref}
          viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setCurrent(null)}
        >
          <Grid />
          {guide && paths.map((d, i) => <path key={`g${i}`} d={d} className="stroke-ghost" fill="none" strokeWidth={3} strokeLinecap="round" />)}
          {!finished && (fails >= 2 || (!guide && fails >= 1)) && paths[hintIdx] && (
            <path d={paths[hintIdx]} className="stroke-hint" fill="none" strokeWidth={4} strokeLinecap="round" strokeDasharray="3 3" />
          )}
          {done.map((d, i) => (
            <path key={i} d={d} className="stroke-done" fill="none" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {current && current.length > 1 && (
            <polyline points={current.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--indigo)" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </div>
      <div className="small" style={{ minHeight: 22, color: message?.ok ? 'var(--green)' : 'var(--accent)' }}>
        {finished ? `Готово! Ошибок: ${mistakes.length}` : message ? message.message : `Черта ${hintIdx + 1} из ${paths.length}`}
      </div>
      <div className="row">
        <button className="btn small" onClick={reset}>
          ↺ Заново
        </button>
      </div>
    </div>
  );
}
