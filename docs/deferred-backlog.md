# Отложенные задачи (фазы 3, 5, 8, 9)

Зафиксировано **2026-09-27**: пользователь сознательно откладывает эти пункты; текущий фокус — **правки** (отдельный поток работ). При возобновлении «закрытия дыр» без Firebase — ориентироваться на порядок в конце файла.

Состояние репозитория на момент записи: **MVP-2 на mock** (фазы 0–10 в основном закрыты); Firebase — scaffold (фаза 11); часть фазы 12 (тесты, CI).

**2026-09-27:** уточнена продуктовая модель языков (forward / reverse scaffold) — см. [product-language-model.md](product-language-model.md); код: `readingLanguageModel.ts`, seed `text-yesterday-bread-ja`.

---

## Фаза 3 — Analysis

| ID | Задача | Статус в плане | Почему не сделано |
|----|--------|----------------|-------------------|
| 3-forms-ui | При сохранении/редактировании конструкции из UI заполнять `GrammarConstruction.forms[]` | `development-plan.md` §3.2 | Нет автора UI; analyzer и типы готовы, данные только seed/ручные |
| 3-jp-templates | Сложные шаблоны конструкций (напр. `〜わけではない`) | §3.1 отложено | MVP: matcher по последовательности токенов; JP-морфология — отдельный эпик |

**Готово по критерию фазы:** pipeline, preview без БД, unit-тесты ru/ja.

---

## Фаза 5 — Каталог Texts

| ID | Задача | Статус в плане | Почему не сделано |
|----|--------|----------------|-------------------|
| 5-series-ui | Карточка серии → список глав по `seriesPosition`; текст без серии | §5.3 MVP-2+ | `SeriesRepository` есть; в seed нет `seriesId`, нет маршрута/экрана |
| 5-contributors-screen | Отдельный экран contributors (не только счётчик на preview) | §5.4 «позже» | Достаточно счётчика для MVP; ближе к v1.0 / Me |

**Готово:** TextCard, фильтры, URL, поиск title/word/construction, preview.

---

## Фаза 8 — Add text / Translation

| ID | Задача | Статус в плане | Почему не сделано |
|----|--------|----------------|-------------------|
| 8-translation-rich-ui | UI однокоренных и конструкций в Translation phase (instruction §22–24) | §8.3 post-MVP | `TextTranslationView` — только unique words; roots/constructions как в instruction — большой UX-блок |
| 8-add-text-series | Поля `seriesId` + position в `AddTextView` | §8.1 | Завязано на 5-series-ui |

**Готово:** analyze → confirm (draft, unknown без Word) → translate → publish.

---

## Фаза 9 — Community

| ID | Задача | Статус в плане | Почему не сделано |
|----|--------|----------------|-------------------|
| 9-extra-to-pool | Добавлять extra words из natural translation в learning pool | §9.3 опционально | Нужна модель (Word vs occurrence); сознательно не размывали фазу 8 |
| 9-report-moderation | Очередь жалоб → `LearningText.status = hidden` | §9.5 post-MVP | Только запись `Report`; admin panel — v1.0 |
| 9-report-targets | Report на переводе / слове (`ReportTargetType`) | §9.5 partial | UI: только `targetType: 'text'` в `TextCommunityView` |
| 9-rating-axes | `uniqueness`, `learningValue` в UI рейтинга | §9.4 «позже» | Completed: usefulness + interestingness |

**Готово:** community page, proposals, votes, suggest correction, natural + `sourceOccurrenceIds`, рейтинг, mock persona.

---

## Рекомендуемый порядок при возобновлении (без Firebase)

1. **5-series-ui** + **8-add-text-series** (seed с одной серией, `SeriesView`, поля в add text).
2. **8-translation-rich-ui** + **3-forms-ui** (конструкции и forms в одном UX-потоке).
3. **9-report-targets** → **9-extra-to-pool** → **9-rating-axes** → **5-contributors-screen** → **9-report-moderation** (по приоритету продукта).
4. **3-jp-templates** — когда будет японский контент в приоритете.

---

## Связанные открытые пункты (другие фазы)

Не входят в «3/5/8/9», но в том же духе отложено:

- Фаза 12: meta без sentences в списке; lazy sentences на Reading; a11y focus; loading/error везде.
- Фаза 11: Firestore seed-скрипт; Apple/email auth; Cloud Function (опционально).
- Фаза 10: Saved texts / Contributions / About — `MeStubView`, favorites не как полная фича.

---

_Обновлять этот файл при закрытии пунктов или смене приоритетов._
