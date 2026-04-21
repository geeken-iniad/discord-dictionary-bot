const activeQuizChannels = new Set<string>();
const activeQuizGuilds = new Set<string>();

export function markQuizChannelActive(channelId: string): void {
  activeQuizChannels.add(channelId);
}

export function unmarkQuizChannelActive(channelId: string): void {
  activeQuizChannels.delete(channelId);
}

export function isQuizChannelActive(channelId: string): boolean {
  return activeQuizChannels.has(channelId);
}

export function markQuizGuildActive(guildId: string): void {
  activeQuizGuilds.add(guildId);
}

export function unmarkQuizGuildActive(guildId: string): void {
  activeQuizGuilds.delete(guildId);
}

export function isQuizGuildActive(guildId: string): boolean {
  return activeQuizGuilds.has(guildId);
}
