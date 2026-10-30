// Виртуальная Япония: город, где все NPC говорят только по-японски.
// Управление: стрелки / WASD, нажатие на карту, экранный джойстик. E или «Войти» — разговор.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { SCENES, sceneById } from '../content/scenes';
import { useProgress } from '../store/progress';
import { Modal } from '../components/Modal';
import { ScenePlayer } from './lesson/ScenePlayer';
import { AiChat } from './Talk';
import { aiAvailable } from '../core/ai/client';
import { useAsync } from '../hooks';
import { useSpeak } from '../components/AudioButton';

const W = 36;
const H = 24;
const TILE = 24;

type Tile = 'grass' | 'road' | 'walk' | 'wall' | 'roof' | 'door' | 'tree' | 'water' | 'rail' | 'plaza' | 'bridge';

interface Place {
  id: string;
  sign: string; // вывеска (японский)
  hint: string; // подсказка (русский)
  x: number;
  y: number;
  w: number;
  h: number;
  door: [number, number];
  color: string;
  scenes: string[];
  open?: boolean; // открытая площадка без стен
}

const PLACES: Place[] = [
  { id: 'station', sign: '駅', hint: 'Станция', x: 20, y: 1, w: 8, h: 4, door: [23, 4], color: '#7b8794', scenes: ['station'] },
  { id: 'konbini', sign: 'コンビニ', hint: 'Круглосуточный магазин', x: 2, y: 6, w: 6, h: 4, door: [5, 9], color: '#3a9d5d', scenes: ['konbini'] },
  { id: 'cafe', sign: 'カフェ', hint: 'Кафе (здесь же ищут сотрудников)', x: 9, y: 6, w: 5, h: 4, door: [11, 9], color: '#a0673a', scenes: ['cafe', 'job-interview'] },
  { id: 'hospital', sign: '病院', hint: 'Больница', x: 24, y: 6, w: 7, h: 4, door: [27, 9], color: '#d9dde3', scenes: ['doctor'] },
  { id: 'apartment', sign: 'アパート', hint: 'Ваш дом и соседи', x: 32, y: 6, w: 4, h: 4, door: [33, 9], color: '#c9a66b', scenes: ['neighbor'] },
  { id: 'hotel', sign: 'ホテル', hint: 'Гостиница', x: 2, y: 14, w: 6, h: 5, door: [5, 14], color: '#5b6dc4', scenes: ['hotel'] },
  { id: 'school', sign: '学校', hint: 'Языковая школа', x: 9, y: 14, w: 6, h: 5, door: [12, 14], color: '#d1b06b', scenes: ['teacher'] },
  { id: 'koban', sign: '交番', hint: 'Полицейская будка', x: 20, y: 14, w: 3, h: 3, door: [21, 14], color: '#4a5a8a', scenes: ['police'] },
  { id: 'office', sign: '会社', hint: 'Офис компании', x: 24, y: 14, w: 6, h: 5, door: [27, 14], color: '#6f7f8f', scenes: ['colleague', 'boss'] },
  { id: 'festival', sign: '神社・祭り', hint: 'Храм — сегодня летний фестиваль', x: 31, y: 14, w: 5, h: 5, door: [33, 14], color: '#c0392b', scenes: ['festival'], open: true },
  { id: 'park', sign: '公園', hint: 'Парк — там гуляет ваш друг', x: 9, y: 1, w: 8, h: 4, door: [12, 4], color: '#6bb36b', scenes: ['friend'], open: true },
  { id: 'airport', sign: '空港行きバス', hint: 'Автобус в аэропорт', x: 0, y: 11, w: 1, h: 1, door: [0, 11], color: '#e0a030', scenes: ['airport'], open: true },
];

const QUESTS: { id: string; scene: string; title: string; xp: number }[] = [
  { id: 'q-konbini', scene: 'konbini', title: 'Купить онигири в комбини', xp: 30 },
  { id: 'q-passerby', scene: 'passerby', title: 'Спросить дорогу у прохожего', xp: 30 },
  { id: 'q-station', scene: 'station', title: 'Найти свою платформу на станции', xp: 30 },
  { id: 'q-cafe', scene: 'cafe', title: 'Заказать кофе в кафе', xp: 30 },
  { id: 'q-neighbor', scene: 'neighbor', title: 'Познакомиться с соседом', xp: 30 },
  { id: 'q-friend', scene: 'friend', title: 'Договориться с другом о выходных', xp: 30 },
  { id: 'q-teacher', scene: 'teacher', title: 'Задать вопрос учителю', xp: 30 },
  { id: 'q-doctor', scene: 'doctor', title: 'Сходить к врачу', xp: 40 },
  { id: 'q-hotel', scene: 'hotel', title: 'Заселиться в гостиницу', xp: 40 },
  { id: 'q-police', scene: 'police', title: 'Сообщить о потерянном кошельке', xp: 40 },
  { id: 'q-colleague', scene: 'colleague', title: 'Помочь коллеге', xp: 40 },
  { id: 'q-festival', scene: 'festival', title: 'Купить такояки на фестивале', xp: 40 },
  { id: 'q-airport', scene: 'airport', title: 'Пройти регистрацию в аэропорту', xp: 40 },
  { id: 'q-job', scene: 'job-interview', title: 'Устроиться на подработку', xp: 60 },
  { id: 'q-boss', scene: 'boss', title: 'Отпроситься у начальника', xp: 60 },
];

function buildMap(): Tile[][] {
  const m: Tile[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 'grass' as Tile));
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < W && y < H) m[y][x] = t;
  };
  for (let x = 0; x < W; x++) {
    set(x, 0, 'rail');
    set(x, 10, 'walk');
    set(x, 11, 'road');
    set(x, 12, 'road');
    set(x, 13, 'walk');
    set(x, 21, 'water');
    set(x, 22, 'water');
  }
  for (let y = 0; y < H; y++) {
    set(17, y, 'road');
    set(18, y, 'road');
    set(16, y, m[y][16] === 'road' ? 'road' : 'walk');
    set(19, y, m[y][19] === 'road' ? 'road' : 'walk');
  }
  set(17, 0, 'rail');
  set(18, 0, 'rail');
  for (const y of [21, 22]) {
    set(17, y, 'bridge');
    set(18, y, 'bridge');
  }
  // тротуары к дверям
  for (let x = 1; x < W - 1; x++) set(x, 5, 'walk');
  for (let y = 5; y < 10; y++) set(8, y, 'walk');
  for (let x = 1; x < W - 1; x++) set(x, 19, 'walk');
  for (let y = 13; y < 20; y++) set(30, y, 'walk');
  // деревья
  for (const [x, y] of [[1, 2], [3, 3], [5, 1], [29, 2], [31, 3], [33, 1], [34, 3], [1, 16], [15, 8], [22, 8], [21, 7], [14, 16], [15, 17], [31, 11 - 1], [34, 20], [2, 20], [6, 20], [10, 20], [26, 20], [30, 20]] as [number, number][]) {
    if (m[y][x] === 'grass') set(x, y, 'tree');
  }
  for (const p of PLACES) {
    if (p.open) {
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (m[y][x] === 'grass') set(x, y, 'plaza');
      if (p.id === 'park') {
        set(10, 2, 'tree');
        set(15, 2, 'tree');
        set(13, 1, 'tree');
      }
    } else {
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) set(x, y, y === p.y ? 'roof' : 'wall');
    }
    set(p.door[0], p.door[1], 'door');
  }
  return m;
}

const PASSABLE: Tile[] = ['grass', 'road', 'walk', 'door', 'plaza', 'bridge', 'rail'];
const COLORS: Record<Tile, string> = {
  grass: '#9cc98a',
  road: '#5d6066',
  walk: '#cfc6b5',
  wall: '#b9b0a3',
  roof: '#8d5a4a',
  door: '#f2d36b',
  tree: '#3f7d3a',
  water: '#5aa7d6',
  rail: '#8a7a6a',
  plaza: '#e3d5b5',
  bridge: '#a08060',
};

interface Npc {
  id: string;
  x: number;
  y: number;
  emoji: string;
  scene: string;
  label: string;
  wander?: boolean;
}

export function CityPage() {
  const map = useMemo(buildMap, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState({ x: 33, y: 10 });
  const [npcs, setNpcs] = useState<Npc[]>([
    { id: 'walker', x: 14, y: 13, emoji: '🧑', scene: 'passerby', label: '通行人', wander: true },
    { id: 'walker2', x: 25, y: 10, emoji: '👩', scene: 'passerby', label: '通行人', wander: true },
    { id: 'friend', x: 13, y: 3, emoji: '🧑‍🎓', scene: 'friend', label: 'ゆうと' },
    { id: 'neighbor', x: 34, y: 10, emoji: '👴', scene: 'neighbor', label: '田村さん' },
  ]);
  const [open, setOpen] = useState<{ title: string; hint: string; scenes: string[] } | null>(null);
  const [scene, setScene] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [hints, setHints] = useState(true);
  const quests = useProgress((s) => s.quests);
  const completeQuest = useProgress((s) => s.completeQuest);
  const settings = useProgress((s) => s.settings);
  const { data: ai } = useAsync(() => aiAvailable(settings), [settings.aiMode, settings.apiKey]);
  const say = useSpeak();

  const passable = useCallback((x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && PASSABLE.includes(map[y][x]), [map]);

  const placeAt = (x: number, y: number) => PLACES.find((p) => p.door[0] === x && p.door[1] === y);
  const npcNear = (x: number, y: number) => npcs.find((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 1);
  const here = placeAt(player.x, player.y);
  const nearNpc = npcNear(player.x, player.y);

  const move = useCallback(
    (dx: number, dy: number) => {
      if (open) return;
      setPlayer((p) => {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!passable(nx, ny) || npcs.some((n) => n.x === nx && n.y === ny)) return p;
        return { x: nx, y: ny };
      });
    },
    [open, passable, npcs],
  );

  const interact = useCallback(() => {
    const place = placeAt(player.x, player.y);
    if (place) {
      setOpen({ title: place.sign, hint: place.hint, scenes: place.scenes });
      void say(place.sign === '空港行きバス' ? 'くうこういきバス' : place.sign);
      return;
    }
    const n = npcNear(player.x, player.y);
    if (n) setOpen({ title: n.label, hint: 'Прохожий / знакомый', scenes: [n.scene] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, npcs]);

  // клавиатура
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'w', 'ц'].includes(k)) move(0, -1);
      else if (['arrowdown', 's', 'ы'].includes(k)) move(0, 1);
      else if (['arrowleft', 'a', 'ф'].includes(k)) move(-1, 0);
      else if (['arrowright', 'd', 'в'].includes(k)) move(1, 0);
      else if (['e', 'у', 'enter', ' '].includes(k)) interact();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, interact, open]);

  // прохожие гуляют по тротуарам
  useEffect(() => {
    const t = setInterval(() => {
      setNpcs((list) =>
        list.map((n) => {
          if (!n.wander) return n;
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
          for (const [dx, dy] of dirs) {
            const nx = n.x + dx;
            const ny = n.y + dy;
            const t2 = map[ny]?.[nx];
            if ((t2 === 'walk' || t2 === 'plaza') && !(nx === player.x && ny === player.y)) return { ...n, x: nx, y: ny };
          }
          return n;
        }),
      );
    }, 900);
    return () => clearInterval(t);
  }, [map, player]);

  // отрисовка
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * TILE * dpr;
    c.height = H * TILE * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = map[y][x];
        g.fillStyle = COLORS[t];
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (t === 'road' && y === 11) {
          g.fillStyle = '#e8e2c8';
          if (x % 3 === 0) g.fillRect(x * TILE + 4, (y + 1) * TILE - 1, 12, 2);
        }
        if (t === 'rail') {
          g.fillStyle = '#5a4a3a';
          g.fillRect(x * TILE, y * TILE + 6, TILE, 3);
          g.fillRect(x * TILE, y * TILE + 15, TILE, 3);
        }
        if (t === 'tree') {
          g.fillStyle = '#2f6a2b';
          g.beginPath();
          g.arc(x * TILE + 12, y * TILE + 11, 10, 0, Math.PI * 2);
          g.fill();
        }
        if (t === 'water') {
          g.fillStyle = 'rgba(255,255,255,0.25)';
          if ((x + y) % 4 === 0) g.fillRect(x * TILE + 3, y * TILE + 10, 10, 2);
        }
      }
    for (const p of PLACES) {
      if (!p.open) {
        g.fillStyle = p.color;
        g.fillRect(p.x * TILE + 2, (p.y + 1) * TILE, p.w * TILE - 4, (p.h - 1) * TILE - 2);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let x = p.x + 1; x < p.x + p.w - 1; x += 2) g.fillRect(x * TILE + 4, (p.y + 1) * TILE + 6, 14, 10);
      }
      if (p.id === 'festival') {
        // тории
        const tx = p.door[0] * TILE;
        const ty = p.door[1] * TILE;
        g.fillStyle = '#c0392b';
        g.fillRect(tx - 6, ty + 2, TILE + 12, 4);
        g.fillRect(tx - 2, ty + 8, TILE + 4, 3);
        g.fillRect(tx, ty + 2, 3, TILE);
        g.fillRect(tx + TILE - 3, ty + 2, 3, TILE);
        for (let i = 0; i < 4; i++) {
          g.fillStyle = '#ff7043';
          g.beginPath();
          g.arc((p.x + 0.5 + i) * TILE + 12, (p.y + 2) * TILE, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
      // вывеска
      g.font = `bold ${p.sign.length > 4 ? 11 : 14}px "Noto Sans JP", sans-serif`;
      const tw = g.measureText(p.sign).width + 10;
      const sx = (p.door[0] + 0.5) * TILE - tw / 2;
      const sy = p.open ? p.y * TILE + 2 : p.y * TILE + 4;
      g.fillStyle = 'rgba(20,16,24,0.82)';
      g.fillRect(Math.max(0, sx), sy, tw, 18);
      g.fillStyle = '#fff8f0';
      g.fillText(p.sign, Math.max(5, sx + 5), sy + 14);
    }
    // двери поверх стен
    for (const p of PLACES) {
      const [dx, dy] = p.door;
      g.fillStyle = '#f2d36b';
      g.fillRect(dx * TILE + 3, dy * TILE + 3, TILE - 6, TILE - 3);
      g.strokeStyle = '#7a5a20';
      g.lineWidth = 2;
      g.strokeRect(dx * TILE + 3, dy * TILE + 3, TILE - 6, TILE - 3);
    }
    // NPC
    g.font = '18px sans-serif';
    for (const n of npcs) g.fillText(n.emoji, n.x * TILE + 2, n.y * TILE + 19);
    // игрок
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.arc(player.x * TILE + 12, player.y * TILE + 12, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 12px "Noto Sans JP", sans-serif';
    g.fillText('私', player.x * TILE + 6, player.y * TILE + 17);
  }, [map, npcs, player]);

  // нажатие на карту — идём к точке (поиск пути в ширину)
  const onCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tx = Math.floor(((e.clientX - r.left) / r.width) * W);
    const ty = Math.floor(((e.clientY - r.top) / r.height) * H);
    const prev = new Map<string, string | null>([[`${player.x},${player.y}`, null]]);
    const q: [number, number][] = [[player.x, player.y]];
    let found: string | null = null;
    while (q.length) {
      const [x, y] = q.shift()!;
      if (x === tx && y === ty) {
        found = `${x},${y}`;
        break;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (!prev.has(key) && passable(nx, ny)) {
          prev.set(key, `${x},${y}`);
          q.push([nx, ny]);
        }
      }
    }
    if (!found) return;
    const path: [number, number][] = [];
    for (let k: string | null = found; k && k !== `${player.x},${player.y}`; k = prev.get(k) ?? null) path.unshift(k.split(',').map(Number) as [number, number]);
    path.forEach(([x, y], i) => setTimeout(() => setPlayer({ x, y }), i * 90));
  };

  const finishScene = (id: string) => {
    const quest = QUESTS.find((qq) => qq.scene === id);
    if (quest && !quests[quest.id]) completeQuest(quest.id, quest.xp);
  };

  const doneCount = QUESTS.filter((qq) => quests[qq.id]).length;
  return (
    <div>
      <div className="page-head row between">
        <div>
          <h1>Виртуальная Япония</h1>
          <p>Город, где все говорят только по-японски. Подойдите к двери или к человеку и нажмите «Войти».</p>
        </div>
        <label className="switch small">
          <input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} /> подсказки на русском
        </label>
      </div>
      <div className="city-layout">
        <div>
          <div className="city-wrap">
            <canvas ref={canvasRef} onClick={onCanvasClick} style={{ cursor: 'pointer' }} />
          </div>
          <div className="row between" style={{ marginTop: 10, alignItems: 'center' }}>
            <div className="dpad">
              <span />
              <button onClick={() => move(0, -1)} aria-label="вверх">▲</button>
              <span />
              <button onClick={() => move(-1, 0)} aria-label="влево">◀</button>
              <button onClick={interact} aria-label="войти" style={{ fontSize: '0.8rem' }}>
                E
              </button>
              <button onClick={() => move(1, 0)} aria-label="вправо">▶</button>
              <span />
              <button onClick={() => move(0, 1)} aria-label="вниз">▼</button>
              <span />
            </div>
            <div className="card flat" style={{ flex: 1, minWidth: 200 }}>
              {here ? (
                <>
                  <div className="ja" style={{ fontSize: '1.4rem' }}>{here.sign}</div>
                  {hints && <div className="small muted">{here.hint}</div>}
                  <button className="btn primary small" style={{ marginTop: 6 }} onClick={interact}>
                    Войти (E)
                  </button>
                </>
              ) : nearNpc ? (
                <>
                  <div className="ja" style={{ fontSize: '1.2rem' }}>
                    {nearNpc.emoji} {nearNpc.label}
                  </div>
                  <button className="btn primary small" style={{ marginTop: 6 }} onClick={interact}>
                    Заговорить (E)
                  </button>
                </>
              ) : (
                <div className="small muted">Стрелки / WASD — идти, нажатие на карту — пойти туда. Жёлтые клетки — двери.</div>
              )}
            </div>
          </div>
        </div>
        <div className="card">
          <h3>📋 Задания</h3>
          <div className="progress green" style={{ marginBottom: 10 }}>
            <div style={{ width: `${(doneCount / QUESTS.length) * 100}%` }} />
          </div>
          <div className="small faint" style={{ marginBottom: 8 }}>
            Выполнено {doneCount} из {QUESTS.length}
          </div>
          {QUESTS.map((qq) => (
            <div key={qq.id} className="row small" style={{ padding: '4px 0', flexWrap: 'nowrap' }}>
              <span>{quests[qq.id] ? '✅' : '⬜'}</span>
              <span style={{ flex: 1, textDecoration: quests[qq.id] ? 'line-through' : undefined, color: quests[qq.id] ? 'var(--text-3)' : undefined }}>{qq.title}</span>
              <span className="tiny faint">+{qq.xp}</span>
            </div>
          ))}
        </div>
      </div>
      {open && (
        <Modal
          wide
          onClose={() => {
            setOpen(null);
            setScene(null);
          }}
        >
          {!scene ? (
            <div>
              <div className="ja" style={{ fontSize: '2rem' }}>{open.title}</div>
              {hints && <p className="muted">{open.hint}</p>}
              <div className="grid grid-2">
                {open.scenes.map((sid) => {
                  const sc = sceneById(sid)!;
                  const q = QUESTS.find((qq) => qq.scene === sid);
                  return (
                    <button key={sid} className="card link" style={{ textAlign: 'left', border: '1px solid var(--line)' }} onClick={() => setScene(sid)}>
                      <div style={{ fontSize: '1.6rem' }}>{sc.icon}</div>
                      <div className="ja" style={{ fontWeight: 700 }}>{sc.persona.nameJa}</div>
                      {hints && <div className="small muted">{sc.persona.goal}</div>}
                      {q && quests[q.id] && <span className="chip green">✓ выполнено</span>}
                    </button>
                  );
                })}
              </div>
              {ai && (
                <label className="switch small" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> свободный разговор с ИИ вместо сценария
                </label>
              )}
            </div>
          ) : useAi && ai ? (
            <AiChat scene={sceneById(scene)!} level={sceneById(scene)!.level} />
          ) : (
            <ScenePlayer scene={sceneById(scene)!} onFinish={() => finishScene(scene)} />
          )}
          {scene && useAi && ai && (
            <button className="btn small" style={{ marginTop: 10 }} onClick={() => finishScene(scene)}>
              Задание выполнено ✓
            </button>
          )}
        </Modal>
      )}
      <p className="tiny faint" style={{ marginTop: 10 }}>
        Мест в городе: {PLACES.length}, персонажей: {SCENES.length}. Каждый разговор засчитывается в навык «Разговор» и в план ИИ-преподавателя.
      </p>
    </div>
  );
}
