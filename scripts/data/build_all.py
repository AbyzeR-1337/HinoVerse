#!/usr/bin/env python3
"""
Сборка открытых данных HinoVerse.

Скачивает (при необходимости) открытые словари и собирает компактные JSON-файлы
в public/data/. Используется только стандартная библиотека Python 3.10+.

Источники и лицензии (см. DATA_LICENSES.md):
  * JMdict (EDRDG, CC BY-SA 4.0) — словарь, русские переводы, части речи
  * KANJIDIC2 + KRADFILE (EDRDG, CC BY-SA 4.0) — иероглифы, чтения, составные части
  * KanjiVG (Ulrich Apel, CC BY-SA 3.0) — порядок черт
  * Tatoeba (CC BY 2.0 FR) — пары предложений японский ↔ русский
  * kanjium accents (CC BY-SA 4.0) — тональное ударение
  * kanji-data, David Gouveia (MIT) — уровни JLPT для кандзи
  * open-anki-jlpt-decks, Jamie Sinclair (MIT) — списки слов JLPT N5–N1

Запуск:  python3 scripts/data/build_all.py [--cache DIR] [--out DIR]
"""
from __future__ import annotations

import argparse
import bz2
import csv
import gzip
import io
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SOURCES = {
    "JMdict.gz": "http://ftp.edrdg.org/pub/Nihongo/JMdict.gz",
    "kanjidic2.xml.gz": "http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz",
    "kradfile.gz": "http://ftp.edrdg.org/pub/Nihongo/kradfile.gz",
    "kanjivg.zip": "https://github.com/KanjiVG/kanjivg/releases/download/r20240807/kanjivg-20240807-main.zip",
    "accents.txt": "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt",
    "kanji-data.json": "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json",
    "jpn-rus_links.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/jpn/jpn-rus_links.tsv.bz2",
    "jpn_sentences.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2",
    "rus_sentences.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/rus/rus_sentences.tsv.bz2",
}
for _lvl in ("n5", "n4", "n3", "n2", "n1"):
    SOURCES[f"jlpt_{_lvl}.csv"] = (
        f"https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/{_lvl}.csv"
    )

XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
KANJI_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿々]")
KANA_ONLY_RE = re.compile(r"^[぀-ヿー・]+$")


def log(*args):
    print("[data]", *args, file=sys.stderr, flush=True)


def fetch(cache: Path, name: str) -> Path:
    path = cache / name
    if path.exists() and path.stat().st_size > 0:
        return path
    url = SOURCES[name]
    log("скачиваю", url)
    cache.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as resp, open(path, "wb") as out:
        while chunk := resp.read(1 << 20):
            out.write(chunk)
    return path


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    log(f"→ {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} КБ)")


# ───────────────────────────── JMdict ─────────────────────────────

GLOSS_NUM_RE = re.compile(r"^\s*(?:\d+\)|[а-я]\))\s*:?\s*")


def clean_gloss(text: str) -> str:
    """Приводит русские глоссы JMdict (из Warodai) к читаемому виду."""
    t = text.strip()
    t = GLOSS_NUM_RE.sub("", t)
    t = re.sub(r"^:\s*", "", t)
    t = t.replace("{", "(").replace("}", ")")
    t = re.sub(r"\s+", " ", t).strip(" ;,")
    # Отбрасываем служебные строки: перекрёстные ссылки, пометы без перевода, «1», «(сущ.)».
    outside = re.sub(r"\([^)]*\)|\[[^\]]*\]", "", t)
    if t.startswith("(ср.)") or not re.search(r"[а-яё]{2}", outside, re.I) or t.endswith(":)"):
        return ""
    return t


def priority_score(pri: list[str]) -> int:
    score = 0
    for p in set(pri):
        if p in ("news1", "ichi1", "spec1", "gai1"):
            score += 20
        elif p in ("news2", "ichi2", "spec2", "gai2"):
            score += 8
        elif p.startswith("nf"):
            try:
                score += max(0, 50 - int(p[2:]))
            except ValueError:
                pass
    return score


def parse_entity_map(jmdict_path: Path) -> dict[str, str]:
    """JMdict хранит части речи как XML-сущности; ElementTree их раскрывает,
    поэтому строим обратную таблицу «описание → код»."""
    rev = {}
    ent_re = re.compile(r'<!ENTITY\s+(\S+)\s+"([^"]*)">')
    with gzip.open(jmdict_path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.startswith("<JMdict>"):
                break
            m = ent_re.search(line)
            if m:
                rev[m.group(2)] = m.group(1)
    return rev


def parse_jmdict(path: Path):
    rev = parse_entity_map(path)
    entries = []
    with gzip.open(path, "rb") as f:
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag != "entry":
                continue
            seq = int(el.findtext("ent_seq"))
            kebs, rebs, pri = [], [], []
            for k in el.findall("k_ele"):
                inf = [rev.get(i.text, i.text) for i in k.findall("ke_inf")]
                if any(x in ("sK", "oK", "iK", "rK") for x in inf):
                    continue
                kebs.append(k.findtext("keb"))
                pri += [p.text for p in k.findall("ke_pri")]
            for r in el.findall("r_ele"):
                inf = [rev.get(i.text, i.text) for i in r.findall("re_inf")]
                if any(x in ("sk", "ok", "ik") for x in inf):
                    continue
                rebs.append(r.findtext("reb"))
                pri += [p.text for p in r.findall("re_pri")]
            pos, rus, eng, fields, misc = [], [], [], [], []
            for s in el.findall("sense"):
                for p in s.findall("pos"):
                    code = rev.get(p.text, p.text)
                    if code not in pos:
                        pos.append(code)
                for fe in s.findall("field"):
                    code = rev.get(fe.text, fe.text)
                    if code not in fields:
                        fields.append(code)
                for mi in s.findall("misc"):
                    code = rev.get(mi.text, mi.text)
                    if code not in misc:
                        misc.append(code)
                for g in s.findall("gloss"):
                    lang = g.get(XML_LANG, "eng")
                    if not g.text:
                        continue
                    if lang == "rus":
                        c = clean_gloss(g.text)
                        if c and not c.startswith("(см.)"):
                            rus.append(c)
                    elif lang == "eng" and len(eng) < 4:
                        eng.append(g.text)
            if rebs:
                entries.append(
                    {
                        "seq": seq,
                        "k": kebs,
                        "r": rebs,
                        "pos": pos,
                        "rus": rus,
                        "eng": eng,
                        "field": fields,
                        "misc": misc,
                        "score": priority_score(pri),
                    }
                )
            el.clear()
    log(f"JMdict: {len(entries)} статей, с русским переводом: {sum(1 for e in entries if e['rus'])}")
    return entries


# ───────────────────────────── ударения ─────────────────────────────


def parse_accents(path: Path) -> dict[tuple[str, str], str]:
    acc = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            word, reading, raw = parts[0], parts[1] or parts[0], parts[2]
            nums = re.findall(r"\d+", re.sub(r"\([^)]*\)", " ", raw))
            if nums:
                acc[(word, reading)] = ",".join(dict.fromkeys(nums))
    log(f"ударения: {len(acc)}")
    return acc


def accent_for(acc, word: str, reading: str) -> str:
    return acc.get((word, reading)) or acc.get((reading, reading)) or ""


# ───────────────────────────── Tatoeba ─────────────────────────────


def read_bz2_tsv(path: Path):
    with bz2.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            yield line.rstrip("\n").split("\t")


def parse_tatoeba(cache: Path):
    jpn = {int(r[0]): r[2] for r in read_bz2_tsv(fetch(cache, "jpn_sentences.tsv.bz2")) if len(r) >= 3}
    links = defaultdict(list)
    rus_needed = set()
    for r in read_bz2_tsv(fetch(cache, "jpn-rus_links.tsv.bz2")):
        if len(r) >= 2:
            j, ru = int(r[0]), int(r[1])
            if j in jpn:
                links[j].append(ru)
                rus_needed.add(ru)
    rus = {}
    for r in read_bz2_tsv(fetch(cache, "rus_sentences.tsv.bz2")):
        if len(r) >= 3:
            i = int(r[0])
            if i in rus_needed:
                rus[i] = r[2]
    pairs = []
    seen = set()
    for j, rus_ids in links.items():
        text = jpn[j].strip()
        if text in seen or len(text) > 70:
            continue
        tr = next((rus[x] for x in rus_ids if x in rus), None)
        if not tr:
            continue
        seen.add(text)
        pairs.append([j, text, tr.strip()])
    pairs.sort(key=lambda p: (len(p[1]), p[0]))
    log(f"Tatoeba: {len(pairs)} пар японский↔русский")
    return pairs


class SentenceIndex:
    """Индекс подстрок предложений для быстрого поиска примеров."""

    def __init__(self, pairs, max_len=6):
        self.pairs = pairs
        self.max_len = max_len
        self.idx: dict[str, list[int]] = defaultdict(list)
        for i, (_, text, _) in enumerate(pairs):
            seen = set()
            n = len(text)
            for a in range(n):
                for b in range(a + 1, min(n, a + max_len) + 1):
                    s = text[a:b]
                    if s not in seen:
                        seen.add(s)
                        self.idx[s].append(i)

    def find(self, needles: list[str], limit=2) -> list[int]:
        out: list[int] = []
        for nd in needles:
            if not nd:
                continue
            if len(nd) <= self.max_len:
                cand = self.idx.get(nd, [])
            else:
                cand = [i for i in self.idx.get(nd[: self.max_len], []) if nd in self.pairs[i][1]]
            for i in cand:  # список уже упорядочен от коротких предложений к длинным
                if i not in out:
                    out.append(i)
                if len(out) >= limit:
                    return out
        return out


GODAN_ROWS = {
    "v5u": "わいうえおっ", "v5k": "かきくけこい", "v5k-s": "かきくけこっ", "v5g": "がぎぐげごい",
    "v5s": "さしすせそ", "v5t": "たちつてとっ", "v5n": "なにぬねのん", "v5b": "ばびぶべぼん",
    "v5m": "まみむめもん", "v5r": "らりるれろっ", "v5r-i": "らりるれろっ", "v5aru": "らりるれろっい",
}


def example_needles(word: str, pos: list[str]) -> list[str]:
    """Формы слова, по которым ищутся примеры (учитывая спряжение)."""
    if KANA_ONLY_RE.match(word) and len(word) < 3:
        return []
    for p in pos:
        if p in GODAN_ROWS and len(word) >= 2:
            stem = word[:-1]
            return [word] + [stem + k for k in GODAN_ROWS[p]]
        if p in ("v1", "v1-s") and len(word) >= 2:
            stem = word[:-1]
            return [word] + [stem + k for k in ("ま", "た", "て", "な", "ら", "よ", "れ", "さ")]
        if p == "adj-i" and len(word) >= 2:
            stem = word[:-1]
            return [word] + [stem + k for k in ("く", "かっ", "けれ", "さ")]
        if p in ("vs-i", "vs-s") and word.endswith("する"):
            stem = word[:-2]
            return [word] + [stem + k for k in ("し", "さ", "せ")]
    return [word]


# ───────────────────────────── кандзи ─────────────────────────────


def parse_kanjidic(path: Path):
    out = {}
    with gzip.open(path, "rb") as f:
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag != "character":
                continue
            lit = el.findtext("literal")
            misc = el.find("misc")
            grade = misc.findtext("grade") if misc is not None else None
            strokes = misc.findtext("stroke_count") if misc is not None else None
            freq = misc.findtext("freq") if misc is not None else None
            jlpt_old = misc.findtext("jlpt") if misc is not None else None
            rad = None
            for rv in el.findall("radical/rad_value"):
                if rv.get("rad_type") == "classical":
                    rad = int(rv.text)
            on, kun, nanori, mean = [], [], [], []
            rm = el.find("reading_meaning")
            if rm is not None:
                for g in rm.findall("rmgroup"):
                    for r in g.findall("reading"):
                        if r.get("r_type") == "ja_on":
                            on.append(r.text)
                        elif r.get("r_type") == "ja_kun":
                            kun.append(r.text)
                    for m in g.findall("meaning"):
                        if m.get("m_lang") is None:
                            mean.append(m.text)
                nanori = [n.text for n in rm.findall("nanori")]
            out[lit] = {
                "grade": int(grade) if grade else 0,
                "strokes": int(strokes) if strokes else 0,
                "freq": int(freq) if freq else 0,
                "jlpt_old": int(jlpt_old) if jlpt_old else 0,
                "rad": rad or 0,
                "on": on,
                "kun": kun,
                "nanori": nanori[:4],
                "en": mean[:5],
            }
            el.clear()
    log(f"KANJIDIC2: {len(out)} иероглифов")
    return out


def parse_kradfile(path: Path) -> dict[str, list[str]]:
    parts = {}
    with gzip.open(path, "rb") as f:
        text = f.read().decode("euc_jp", errors="replace")
    for line in text.splitlines():
        if not line or line.startswith("#") or " : " not in line:
            continue
        k, comps = line.split(" : ", 1)
        parts[k.strip()] = comps.split()
    return parts


# ───────────────────────────── KanjiVG ─────────────────────────────

PATH_D_RE = re.compile(r'<path[^>]*\sid="kvg:[0-9a-f]+-s(\d+)"[^>]*\sd="([^"]+)"')
PATH_D_RE2 = re.compile(r'<path[^>]*\sd="([^"]+)"[^>]*\sid="kvg:[0-9a-f]+-s(\d+)"')


def parse_kanjivg(path: Path, wanted: set[str]) -> dict[str, list[str]]:
    strokes = {}
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            m = re.match(r"kanji/([0-9a-f]{5})\.svg$", name)
            if not m:
                continue
            ch = chr(int(m.group(1), 16))
            if wanted and ch not in wanted:
                continue
            svg = z.read(name).decode("utf-8")
            found = [(int(n), d) for n, d in PATH_D_RE.findall(svg)]
            found += [(int(n), d) for d, n in PATH_D_RE2.findall(svg)]
            if not found:
                continue
            found = sorted(dict(found).items())
            strokes[ch] = [re.sub(r"\s+", " ", d.strip()) for _, d in found]
    log(f"KanjiVG: {len(strokes)} символов с порядком черт")
    return strokes


# ───────────────────────────── сборка ─────────────────────────────

POS_KEEP = {
    "n", "pn", "v1", "v1-s", "v5u", "v5k", "v5k-s", "v5g", "v5s", "v5t", "v5n", "v5b", "v5m", "v5r",
    "v5r-i", "v5aru", "vk", "vs", "vs-i", "vs-s", "vz", "adj-i", "adj-ix", "adj-na", "adj-no",
    "adj-pn", "adv", "adv-to", "conj", "int", "prt", "suf", "pref", "ctr", "exp", "aux", "aux-v",
    "aux-adj", "num", "cop", "vt", "vi",
}

MISC_KEEP = {"uk", "col", "hon", "hum", "pol", "sl", "vulg", "arch", "abbr", "on-mim", "id", "yoji", "male", "fem"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=str(ROOT / "scripts/data/.cache"))
    ap.add_argument("--out", default=str(ROOT / "public/data"))
    args = ap.parse_args()
    cache, out = Path(args.cache), Path(args.out)

    for name in SOURCES:
        fetch(cache, name)

    entries = parse_jmdict(cache / "JMdict.gz")
    acc = parse_accents(cache / "accents.txt")
    pairs = parse_tatoeba(cache)
    sidx = SentenceIndex(pairs)
    log("индекс предложений построен")

    by_form: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        for f in e["k"] + e["r"]:
            by_form[f].append(e)

    # ── JLPT-словарь ──
    jlpt_of_seq: dict[int, int] = {}
    vocab_levels = {}
    total_vocab = 0
    for lvl in (5, 4, 3, 2, 1):
        rows = []
        with open(cache / f"jlpt_n{lvl}.csv", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                rows.append(row)
        words = []
        for row in rows:
            expr = row["expression"].split(";")[0].strip()
            reading = row["reading"].split(";")[0].strip()
            cands = [e for e in by_form.get(expr, []) if reading in e["r"]] or by_form.get(expr, [])
            cands = sorted(cands, key=lambda e: (-bool(e["rus"]), -e["score"]))
            e = cands[0] if cands else None
            pos = [p for p in (e["pos"] if e else []) if p in POS_KEEP][:4]
            ru = e["rus"][:4] if e else []
            if e and e["seq"] not in jlpt_of_seq:
                jlpt_of_seq[e["seq"]] = lvl
            ex = sidx.find(example_needles(expr, pos), limit=2)
            if e and reading not in e["r"]:
                reading = e["r"][0]
            w = {
                "w": expr,
                "r": reading,
                "ru": ru,
                "en": row["meaning"],
                "pos": pos,
                "a": accent_for(acc, expr, reading),
                "ex": [[pairs[i][1], pairs[i][2]] for i in ex],
            }
            if e:
                w["id"] = e["seq"]
                misc = [m for m in e["misc"] if m in MISC_KEEP]
                if misc:
                    w["m"] = misc
            words.append(w)
        # порядок уроков: частотность (по JMdict) — сначала самые нужные слова
        score_of = {e["seq"]: e["score"] for e in entries}
        words.sort(key=lambda w: -score_of.get(w.get("id", -1), 0))
        vocab_levels[lvl] = words
        total_vocab += len(words)
        with_ru = sum(1 for w in words if w["ru"])
        log(f"N{lvl}: {len(words)} слов, с русским переводом {with_ru}, с примерами {sum(1 for w in words if w['ex'])}")
        write_json(out / f"vocab/n{lvl}.json", words)

    # ── словарь (все статьи с русским переводом) ──
    dict_rows = []
    for e in entries:
        if not e["rus"]:
            continue
        k, r = e["k"][:3], e["r"][:3]
        a = accent_for(acc, (k or r)[0], r[0])
        pos = [p for p in e["pos"] if p in POS_KEEP][:4]
        misc = [m for m in e["misc"] if m in MISC_KEEP][:3]
        dict_rows.append([e["seq"], k, r, e["rus"][:6], pos, e["score"], a, jlpt_of_seq.get(e["seq"], 0), misc])
    dict_rows.sort(key=lambda x: (-x[5], x[0]))
    shard = (len(dict_rows) + 3) // 4
    for i in range(4):
        write_json(out / f"dict/d{i}.json", dict_rows[i * shard : (i + 1) * shard])

    # ── предложения ──
    sent_rows = [[p[1], p[2]] for p in pairs]
    half = (len(sent_rows) + 1) // 2
    write_json(out / "sentences/s0.json", sent_rows[:half])
    write_json(out / "sentences/s1.json", sent_rows[half:])

    # ── кандзи ──
    kd = parse_kanjidic(cache / "kanjidic2.xml.gz")
    krad = parse_kradfile(cache / "kradfile.gz")
    with open(cache / "kanji-data.json", encoding="utf-8") as f:
        kdata = json.load(f)

    vocab_words = [w for lvl in (5, 4, 3, 2, 1) for w in vocab_levels[lvl] if w["ru"]]
    frequent_by_char: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        if e["rus"] and e["score"] >= 20 and e["k"]:
            for ch in set(KANJI_RE.findall(e["k"][0])):
                frequent_by_char[ch].append(e)
    for lst in frequent_by_char.values():
        lst.sort(key=lambda e: (-e["score"], len(e["k"][0])))

    def russian_meaning(ch: str) -> list[str]:
        cands = [e for e in by_form.get(ch, []) if ch in e["k"] and e["rus"]]
        cands.sort(key=lambda e: -e["score"])
        res = []
        for e in cands[:2]:
            for g in e["rus"][:2]:
                g = re.sub(r"\([^)]*\)", "", g).strip(" ;,")
                g = g.split(";")[0].strip()
                if g and g not in res and len(g) <= 40 and not re.search(r"[\u3040-\u30ff\u4e00-\u9fff]", g):
                    res.append(g)
        return res[:3]

    kanji_core, kanji_rare = [], []
    for ch, info in kd.items():
        jd = kdata.get(ch) or {}
        jlpt = jd.get("jlpt_new") or 0
        ru = russian_meaning(ch)
        row = {
            "c": ch,
            "s": info["strokes"],
            "g": info["grade"],
            "f": info["freq"],
            "j": jlpt,
            "on": info["on"],
            "kun": info["kun"],
            "rad": info["rad"],
            "p": krad.get(ch, []),
        }
        if ru:
            row["ru"] = ru
        if info["en"]:
            row["en"] = info["en"][:3]
        core = bool(info["grade"] or jlpt or info["freq"])
        if core:
            ex = []
            for w in vocab_words:
                if ch in w["w"] and w["w"] != ch:
                    ex.append([w["w"], w["r"], w["ru"][0]])
                if len(ex) >= 6:
                    break
            if len(ex) < 6:
                for e in frequent_by_char.get(ch, []):
                    item = [e["k"][0], e["r"][0], e["rus"][0]]
                    if item[0] != ch and all(item[0] != x[0] for x in ex):
                        ex.append(item)
                    if len(ex) >= 6:
                        break
            row["ex"] = ex
            row["nan"] = info["nanori"]
            kanji_core.append(row)
        else:
            kanji_rare.append(row)
    kanji_core.sort(key=lambda r: (-(r["j"] or 0), r["g"] or 99, r["f"] or 9999))
    write_json(out / "kanji/core.json", kanji_core)
    write_json(out / "kanji/rare.json", kanji_rare)
    log(f"кандзи: основных {len(kanji_core)}, редких {len(kanji_rare)}, "
        f"с русским значением {sum(1 for r in kanji_core + kanji_rare if 'ru' in r)}")

    # ── порядок черт ──
    wanted = set(kd.keys())
    wanted |= {chr(c) for c in range(0x3041, 0x3097)} | {chr(c) for c in range(0x30A1, 0x30FB)} | {"ー"}
    strokes = parse_kanjivg(cache / "kanjivg.zip", wanted)
    shards: dict[int, dict] = defaultdict(dict)
    for ch, paths in strokes.items():
        shards[ord(ch) % 64][ch] = paths
    for i in range(64):
        write_json(out / f"strokes/{i}.json", shards.get(i, {}))

    manifest = {
        "dictEntries": len(dict_rows),
        "dictShards": 4,
        "sentences": len(sent_rows),
        "sentenceShards": 2,
        "vocab": {f"n{l}": len(vocab_levels[l]) for l in (5, 4, 3, 2, 1)},
        "kanjiCore": len(kanji_core),
        "kanjiByLevel": {f"n{l}": sum(1 for k in kanji_core if k["j"] == l) for l in (5, 4, 3, 2, 1)},
        "kanjiTotal": len(kanji_core) + len(kanji_rare),
        "strokeChars": len(strokes),
        "strokeShards": 64,
    }
    write_json(out / "manifest.json", manifest)
    log("готово:", json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
