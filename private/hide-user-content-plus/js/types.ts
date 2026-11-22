export type ImageDisplayMode = 'hidden' | 'blurred'

export interface PluginSettings {
  /** Whether images from hidden users are hidden or blurred. */
  imageMode: ImageDisplayMode
  /** Whether hiding only applies inside NSFW channels. */
  nsfwOnly: boolean
  /** Whether only images are hidden (false) or both text and images are hidden (true). */
  hideText: boolean
  /** Map of hidden user IDs keyed by Discord snowflake. */
  hiddenUsers: Record<string, boolean>
}

export interface DiscordChannelLike {
  id: string
  nsfw?: boolean
  isNSFW?: () => boolean
}

export interface DiscordUserLike {
  id: string
  username?: string
  globalName?: string
}

export interface DiscordAttachmentLike {
  id?: string
  url?: string
  proxy_url?: string
  content_type?: string
  width?: number
  height?: number
  spoiler?: boolean
}

export interface DiscordMessageLike {
  id: string
  channel_id?: string
  channelId?: string
  author?: DiscordUserLike
  content?: string
  attachments?: DiscordAttachmentLike[]
  embeds?: Array<{
    type?: string
    image?: { url?: string; proxyURL?: string }
    thumbnail?: { url?: string; proxyURL?: string }
  }>
  flags?: number
}
