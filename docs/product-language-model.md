# Модель языков LingLink

Зафиксировано по уточнению продукта (2026-09-27).

## Роли языков

| Роль | Пример | Где хранится |
|------|--------|----------------|
| **Язык интерфейса (L_ui)** | Русский | `User.interfaceLanguage`, онбординг |
| **Уже знакомый язык (L_known)** | Русский (часто = L_ui) | `User.knownLanguages`, MVP: ≈ L_ui |
| **Изучаемый язык (L_learn)** | Японский | онбординг → `User.learningLanguages[0]`, `activeLearningLanguage` |

Пользователь **не обязан** читать оригинал на L_learn с первого дня. Удобный вход — текст на **L_known**, постепенная подмена слов на **L_learn**.

## Два типа контента

### 1. Forward (текст на L_known)

- `LearningText.language === L_known` (например тексты **русских** авторов на русском).
- Токены и `TextWordOccurrence.text` — на русском.
- Translation phase: для каждого слова proposals → **слова на L_learn** (японские эквиваленты).
- **Чтение:** неизвестное слово → русский в тексте; известное/в батче → перевод на **L_learn** этого читателя (`Word.translations[L_learn]` или proposal на этом языке). Японский перевод того же текста не подставляется тому, кто учит английский.
- Один текст виден всем, для кого оригинал — знакомый или изучаемый язык, либо есть `finalTranslations` на один из этих языков. Переводы на другие языки добавляются в «Перевод сообщества»: язык выбирается отдельно, `finalTranslations` хранит по записи на каждый язык.

Пример из instruction: «Сегодня я пошёл…» → постепенно «今日 … 行きました …».

### 2. Reverse scaffold (оригинал на L_learn, есть мост на L_known)

- `LearningText.language === L_learn` (оригинал **японца**).
- Сырой японский для новичка тяжёлый.
- Если есть **`finalTranslations[L_known]`** (есть качественный перевод японский → русский), его используют **реверсивно**:
  - каркас чтения для новичка — **русский** из natural/final перевода (по `FinalTranslationWord.sourceOccurrenceIds`);
  - по мере обучения слова подменяются на **японский** из оригинального occurrence.
- Translation phase для такого текста: proposals связывают occurrence (ja) с **глоссами на L_known** (русский), плюс community поддерживает `finalTranslations[L_known]`.

**Чтение:** неизвестное → фрагмент моста (ru); известное/в батче → **оригинал (ja)**.

## Что не путать

- **Language в форме Add text** = язык **оригинала** (`LearningText.language`), не «язык изучения».
- **Translation target** зависит от текста:  
  `text.language === L_learn` → переводим **в** L_known;  
  `text.language === L_known` → переводим **в** L_learn.
- **Final translation** на L_known для ja-текста — не только «вкладка Natural», а **опора для reverse-чтения**.

## MVP в коде

- `domain/learning/readingLanguageModel.ts` — `translationTargetLanguage`, `resolveReadingMode`, мост по occurrence.
- `renderSentence` — режимы `forward` | `reverse_scaffold`.
- Seed: ru-тексты (forward) + ja-текст с `finalTranslations.ru` (reverse).

## Будущее

- Явный выбор L_known ≠ L_ui (мультиязычные пользователи).
- Автовыбор режима чтения в UI + подпись «Читаете по русскому переводу оригинала».
