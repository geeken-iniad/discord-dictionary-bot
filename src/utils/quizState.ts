const activeQuizChannels = new Set<string>();

export function markQuizChannelActive(channelId: string): void {
  activeQuizChannels.add(channelId);
}

export function unmarkQuizChannelActive(channelId: string): void {
  activeQuizChannels.delete(channelId);
}

export function isQuizChannelActive(channelId: string): boolean {
  return activeQuizChannels.has(channelId);
}
