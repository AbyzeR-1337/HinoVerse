# Лицензии данных

Каталог `public/data/` создан скриптом `scripts/data/build_all.py` из открытых источников. Производные файлы распространяются на условиях лицензий соответствующих источников.

| Данные | Источник | Лицензия | Где используются |
|---|---|---|---|
| Словарные статьи, русские и английские переводы, части речи | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html), © Electronic Dictionary Research and Development Group. Русские переводы в JMdict основаны на словаре [Warodai](https://warodai.ru) | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) | `dict/`, `vocab/`, `kanji/` (примеры) |
| Иероглифы: чтения, число черт, частотность, ключи | [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), © EDRDG | CC BY-SA 4.0 | `kanji/` |
| Составные части иероглифов | [KRADFILE](https://www.edrdg.org/krad/kradinf.html), © EDRDG | CC BY-SA 4.0 | `kanji/` |
| Порядок черт | [KanjiVG](https://kanjivg.tagaini.net), © Ulrich Apel | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | `strokes/` |
| Предложения японский ↔ русский | [Tatoeba](https://tatoeba.org) | [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) | `sentences/`, примеры в `vocab/` |
| Тональное ударение | [kanjium](https://github.com/mifunetoshiro/kanjium), mifunetoshiro | CC BY-SA 4.0 | `dict/`, `vocab/` |
| Уровни JLPT для кандзи | [kanji-data](https://github.com/davidluzgouveia/kanji-data), David Gouveia | MIT | `kanji/` |
| Списки слов JLPT N5–N1 | [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks), Jamie Sinclair (на основе списков Jonathan Waller) | MIT | `vocab/` |

Официальные списки JLPT не публикуются организаторами экзамена; уровни слов и кандзи — общепринятые ориентировочные списки.

Авторские материалы HinoVerse (`src/content/`: вводные уроки, мнемоники, заметки к кандзи, грамматика, тематические словари, истории, сцены, задания) созданы для этого проекта.
