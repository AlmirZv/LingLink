/**
 * Firestore physical layout (logical types stay in dbTypes.ts).
 *
 * texts/{textId}
 * texts/{textId}/sentences/{sentenceId}
 * texts/{textId}/views/{userId}
 * texts/{textId}/likes/{userId}
 * texts/{textId}/dislikes/{userId}
 * texts/{textId}/comments/{commentId}
 * texts/{textId}/commentReactions/{userId__commentId}
 * users/{userId}/savedTexts/{textId}
 * users/{userId}
 * users/{userId}/wordProgress/{wordId}
 * users/{userId}/textProgress/{textId}
 * users/{userId}/wordTextHistory/{wordId_textId}
 * users/{userId}/notifications/{notificationId}
 * words/{wordId}
 * grammarConstructions/{constructionId}
 * topics/{topicId}
 * textRatings/{ratingId}
 * translationVotes/{voteId}
 * textContributors/{id}
 * textSeries/{seriesId}
 * appConfig/client
 * reports/{reportId}
 */
export const COLLECTIONS = {
  texts: 'texts',
  sentences: 'sentences',
  textViews: 'views',
  textLikes: 'likes',
  textDislikes: 'dislikes',
  comments: 'comments',
  commentReactions: 'commentReactions',
  savedTexts: 'savedTexts',
  users: 'users',
  wordProgress: 'wordProgress',
  textProgress: 'textProgress',
  wordTextHistory: 'wordTextHistory',
  notifications: 'notifications',
  words: 'words',
  grammarConstructions: 'grammarConstructions',
  topics: 'topics',
  textRatings: 'textRatings',
  translationVotes: 'translationVotes',
  textContributors: 'textContributors',
  textSeries: 'textSeries',
  appConfig: 'appConfig',
  reports: 'reports',
  wordEdits: 'wordEdits',
  wordEditVotes: 'wordEditVotes',
  editBans: 'editBans',
} as const
