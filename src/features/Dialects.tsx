import { useState } from 'react';
import { DIALECTS } from '../content/dialects';
import { AudioButton } from '../components/AudioButton';
import { Furigana } from '../components/Furigana';

export function DialectsPage() {
  const [id, setId] = useState(DIALECTS[0].id);
  const d = DIALECTS.find((x) => x.id === id)!;
  return (
    <div>
      <div className="page-head">
        <h1>Диалекты и сленг</h1>
        <p>Как звучит японский в Осаке, Фукуоке, на севере и на Окинаве — и как говорит молодёжь.</p>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        {DIALECTS.map((x) => (
          <button key={x.id} className={`btn small ${x.id === id ? 'primary' : ''}`} onClick={() => setId(x.id)}>
            {x.name.split(' (')[0]}
          </button>
        ))}
      </div>
      <div className="card">
        <h2>{d.name}</h2>
        <div className="chip indigo">📍 {d.region}</div>
        <p style={{ marginTop: 10 }}>{d.description}</p>
        <h3>Особенности</h3>
        <ul>
          {d.features.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
        <h3>Фразы</h3>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Диалект</th>
                <th>Литературный японский</th>
                <th>Перевод</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.phrases.map((p, i) => (
                <tr key={i}>
                  <td className="ja" style={{ fontSize: '1.1rem' }}>
                    <Furigana text={p.d} />
                  </td>
                  <td className="ja muted">{p.std}</td>
                  <td>{p.ru}</td>
                  <td>
                    <AudioButton text={p.d} small />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny faint">Озвучка синтезируется стандартным голосом устройства — интонация диалекта передаётся лишь частично.</p>
      </div>
    </div>
  );
}
