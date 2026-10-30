// Визуализация тонального ударения: ожидаемый рисунок и (опционально) контур голоса пользователя.
import { accentPattern, parseAccent, type PitchAnalysis } from '../core/pitch';

export function PitchPattern({ reading, accent, compact }: { reading: string; accent: string | number; compact?: boolean }) {
  const nums = typeof accent === 'number' ? [accent] : parseAccent(accent);
  if (!nums.length || !reading) return null;
  const p = accentPattern(reading, nums[0]);
  const n = p.morae.length;
  const step = compact ? 26 : 38;
  const w = (n + 1) * step + 10;
  const h = compact ? 46 : 64;
  const y = (lv: 'H' | 'L') => (lv === 'H' ? (compact ? 10 : 12) : compact ? 26 : 34);
  const pts = [...p.levels, p.particle].map((lv, i) => ({ x: 10 + i * step + step / 2, y: y(lv) }));
  return (
    <div title={`${p.name}: ${p.description}`} style={{ display: 'inline-block' }}>
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        <polyline points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {pts.map((q, i) => (
          <circle key={i} cx={q.x} cy={q.y} r={4} fill={i === n ? 'var(--bg-elev)' : 'var(--accent)'} stroke="var(--accent)" strokeWidth={2} />
        ))}
        {p.morae.map((m, i) => (
          <text key={i} x={10 + i * step + step / 2} y={h - 2} textAnchor="middle" fontSize={compact ? 12 : 15} fill="var(--text)" fontFamily="var(--font-ja)">
            {m}
          </text>
        ))}
        <text x={10 + n * step + step / 2} y={h - 2} textAnchor="middle" fontSize={compact ? 10 : 12} fill="var(--text-3)">
          (が)
        </text>
      </svg>
      {!compact && (
        <div className="tiny faint">
          {p.name} · [{nums.join(', ')}]
        </div>
      )}
    </div>
  );
}

/** Сравнение: ожидаемые уровни мор и измеренная высота голоса. */
export function PitchCompare({ analysis, morae }: { analysis: PitchAnalysis; morae: string[] }) {
  const n = morae.length;
  const step = 56;
  const w = n * step + 20;
  const h = 150;
  const known = analysis.moraSemitones.filter((x): x is number => x !== null);
  const min = Math.min(-3, ...known);
  const max = Math.max(3, ...known);
  const yUser = (s: number) => 20 + ((max - s) / (max - min || 1)) * 80;
  const yExp = (lv: 'H' | 'L') => (lv === 'H' ? 28 : 92);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: w, height: 'auto' }}>
      <polyline
        points={analysis.expected.map((lv, i) => `${10 + i * step + step / 2},${yExp(lv)}`).join(' ')}
        fill="none"
        stroke="var(--text-3)"
        strokeDasharray="5 4"
        strokeWidth={2}
      />
      {analysis.expected.map((lv, i) => (
        <circle key={`e${i}`} cx={10 + i * step + step / 2} cy={yExp(lv)} r={5} fill="none" stroke="var(--text-3)" strokeWidth={2} />
      ))}
      <polyline
        points={analysis.moraSemitones
          .map((s, i) => (s === null ? null : `${10 + i * step + step / 2},${yUser(s)}`))
          .filter(Boolean)
          .join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={3}
      />
      {analysis.moraSemitones.map((s, i) =>
        s === null ? null : (
          <circle key={`u${i}`} cx={10 + i * step + step / 2} cy={yUser(s)} r={6} fill={analysis.matches[i] ? 'var(--green)' : 'var(--accent)'} />
        ),
      )}
      {morae.map((m, i) => (
        <text key={i} x={10 + i * step + step / 2} y={h - 12} textAnchor="middle" fontSize={18} fill="var(--text)" fontFamily="var(--font-ja)">
          {m}
        </text>
      ))}
    </svg>
  );
}
