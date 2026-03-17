/** 세션 피드백에 허용된 이모지 목록 */
export const CHANGELOG_EMOJIS = [
  { emoji: "👍", label: "확인" },
  { emoji: "❓", label: "질문" },
  { emoji: "🐛", label: "버그" },
  { emoji: "❗", label: "중요" },
] as const;

export const ALLOWED_EMOJI_LIST: string[] = CHANGELOG_EMOJIS.map((e) => e.emoji);
