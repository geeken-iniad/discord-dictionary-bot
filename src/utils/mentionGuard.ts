const DISALLOWED_MENTION_PATTERN =
  /<@!?\d+>|<@&\d+>|<#\d+>|@everyone|@here/i;

export function hasDisallowedMention(text: string) {
  return DISALLOWED_MENTION_PATTERN.test(text);
}

export const MENTION_BLOCK_MESSAGE =
  "❌ 意味欄にメンションは含められません。@everyone/@here/ユーザー・ロール・チャンネルメンションを削除してください。";