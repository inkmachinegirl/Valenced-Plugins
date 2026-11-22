import { Stores } from '@valenced/discord/flux'
import type { JsonStorage } from '@valenced/json-storage'
import type { DiscordChannelLike, PluginSettings } from './types'

export const DEFAULT_SETTINGS: PluginSettings = {
  imageMode: 'hidden',
  nsfwOnly: false,
  hideText: false,
  hiddenUsers: {},
}

let storageRef: JsonStorage<PluginSettings> | null = null

export function bindSettingsStorage(storage: JsonStorage<PluginSettings>) {
  storageRef = storage
}

export function getSettingsStorage(): JsonStorage<PluginSettings> {
  if (!storageRef) {
    throw new Error('Hide User Content storage has not been initialized')
  }
  return storageRef
}

export function getCachedSettings(): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(storageRef?.cache as Partial<PluginSettings> | undefined),
  }
}

export function isUserHidden(settings: PluginSettings, userId?: string): boolean {
  if (!userId) return false
  return Boolean(settings.hiddenUsers[userId])
}

export async function toggleHiddenUser(userId: string): Promise<boolean> {
  const storage = getSettingsStorage()
  const current = await storage.get()
  const nextHidden = !current.hiddenUsers[userId]
  const nextUsers = { ...current.hiddenUsers }
  if (nextHidden) {
    nextUsers[userId] = true
  } else {
    delete nextUsers[userId]
  }
  await storage.set({ hiddenUsers: nextUsers })
  return nextHidden
}

export function isChannelNsfw(channelId?: string): boolean {
  if (!channelId) return false
  const channelStore = (Stores as Record<string, any>).ChannelStore
  const channel: DiscordChannelLike | undefined = channelStore?.getChannel?.(channelId)
  if (!channel) return false
  if (typeof channel.isNSFW === 'function') return Boolean(channel.isNSFW())
  return Boolean(channel.nsfw)
}

export function shouldHideMessage(
  settings: PluginSettings,
  authorId?: string,
  channelId?: string,
): boolean {
  if (!isUserHidden(settings, authorId)) return false
  if (settings.nsfwOnly && !isChannelNsfw(channelId)) return false
  return true
}
