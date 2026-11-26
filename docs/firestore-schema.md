# Firestore schema (LingLink)

Logical entities are defined in [`dbTypes.ts`](../dbTypes.ts). Physical collections:

| Path | Document |
|------|----------|
| `texts/{textId}` | `LearningText` metadata (sentences in subcollection for production) |
| `texts/{textId}/sentences/{sentenceId}` | `TextSentence` |
| `users/{userId}` | `User` |
| `users/{userId}/wordProgress/{wordId}` | `UserWordProgress` |
| `users/{userId}/textProgress/{textId}` | `UserTextProgress` |
| `users/{userId}/wordTextHistory/{wordId_textId}` | `UserWordTextHistory` |
| `words/{wordId}` | `Word` |
| `grammarConstructions/{id}` | `GrammarConstruction` |
| `topics/{topicId}` | `Topic` |
| `textSeries/{seriesId}` | `TextSeries` |
| `reports/{reportId}` | `Report` |

Denormalized on `LearningText` for queries: `wordIds`, `constructionIds`, `topics`, `language`, `level`, `translationProgress`, `seriesId`, ratings aggregates.

Code reference: [`linglink/src/services/firebase/collections.ts`](../linglink/src/services/firebase/collections.ts).
