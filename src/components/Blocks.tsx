// Рендер блоков учебного контента (статьи, объяснения грамматики).
import { useState } from 'react';
import type { Block } from '../content/types';
import { Furigana, RichText } from './Furigana';
import { AudioButton } from './AudioButton';
import { TapText } from './TapText';

function Quiz({ block }: { block: Extract<Block, { t: 'quiz' }> }) {
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <div className="card flat" style={{ margin: '16px 0' }}>
      <div className="ex-prompt">
        🧩 <RichText text={block.q} />
      </div>
      <div className="options">
        {block.options.map((o, i) => (
          <button
            key={i}
            className={`option ${chosen !== null && i === block.answer ? 'right' : ''} ${chosen === i && i !== block.answer ? 'wrong' : ''}`}
            disabled={chosen !== null}
            onClick={() => setChosen(i)}
          >
            <span className="key">{i + 1}</span>
            <span>
              <Furigana text={o} />
            </span>
          </button>
        ))}
      </div>
      {chosen !== null && (
        <div className={`feedback ${chosen === block.answer ? 'good' : 'bad'}`}>
          <span>{chosen === block.answer ? '✓' : '✗'}</span>
          <span className="fb-body">
            <RichText text={block.explain} />
          </span>
        </div>
      )}
    </div>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p':
            return (
              <p key={i}>
                <RichText text={b.text} />
              </p>
            );
          case 'h':
            return (
              <h3 key={i} style={{ marginTop: 22 }}>
                <RichText text={b.text} />
              </h3>
            );
          case 'ex':
            return (
              <div key={i} className="example">
                <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <div className="ja-line" style={{ flex: 1 }}>
                    <TapText text={b.ja} />
                  </div>
                  <AudioButton text={b.ja} small />
                </div>
                <div className="ru-line">{b.ru}</div>
                {b.note && (
                  <div className="small faint" style={{ marginTop: 4 }}>
                    <RichText text={b.note} />
                  </div>
                )}
              </div>
            );
          case 'tip':
            return (
              <div key={i} className="callout tip">
                💡 <RichText text={b.text} />
              </div>
            );
          case 'warn':
            return (
              <div key={i} className="callout warn">
                ⚠️ <RichText text={b.text} />
              </div>
            );
          case 'list':
            return (
              <ul key={i}>
                {b.items.map((it, k) => (
                  <li key={k} style={{ marginBottom: 6 }}>
                    <RichText text={it} />
                  </li>
                ))}
              </ul>
            );
          case 'table':
            return (
              <div key={i} className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      {b.head.map((h, k) => (
                        <th key={k}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, k) => (
                      <tr key={k}>
                        {r.map((c, j) => (
                          <td key={j} className={/[぀-鿿]/.test(c) ? 'ja' : ''}>
                            <RichText text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'compare':
            return (
              <div key={i} className="example">
                <div className="small faint">По-русски</div>
                <div style={{ marginBottom: 8 }}>{b.ru}</div>
                <div className="small faint">По-японски</div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <div className="ja-line" style={{ flex: 1 }}>
                    <TapText text={b.ja} />
                  </div>
                  <AudioButton text={b.ja} small />
                </div>
                <div className="small faint">Дословно</div>
                <div className="ru-line">{b.literal}</div>
                {b.note && (
                  <div className="callout" style={{ marginBottom: 0 }}>
                    <RichText text={b.note} />
                  </div>
                )}
              </div>
            );
          case 'scheme':
            return (
              <div key={i}>
                <div className="scheme">
                  {b.parts.map((p, k) => (
                    <div key={k} className={`scheme-part ${p.kind ?? ''}`}>
                      <div className="ja-line">
                        <Furigana text={p.text} />
                      </div>
                      <div className="role">{p.role}</div>
                    </div>
                  ))}
                </div>
                {b.ru && <div className="muted small">→ {b.ru}</div>}
              </div>
            );
          case 'quiz':
            return <Quiz key={i} block={b} />;
        }
      })}
    </div>
  );
}
