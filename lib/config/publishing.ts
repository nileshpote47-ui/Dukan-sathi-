import { Camera, Clock, MapPin, MessageCircle, PlayCircle, ThumbsUp, type LucideIcon } from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'

/*
 * Publishing (Phase 6) configuration. Lists mirrored in database check constraints must match
 * the publishing migration — tests/unit/config-sync.test.ts checks this.
 *
 * Channel limits come from the providers' official documentation (checked 2026-11) and are
 * kept here, in one place, so they are easy to update when a platform changes them.
 */

export const CHANNELS = ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'YOUTUBE', 'GOOGLE_BUSINESS_PROFILE'] as const
export type Channel = (typeof CHANNELS)[number]
export const isChannel = (v: unknown): v is Channel => (CHANNELS as readonly unknown[]).includes(v)

/** Who issues the authorization (one Meta login connects a Facebook Page and its Instagram account). */
export const SOCIAL_PROVIDERS = ['meta', 'google', 'mock'] as const
export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]

export const ACCOUNT_STATUSES = ['CONNECTED', 'EXPIRED', 'REVOKED', 'DISCONNECTED', 'ERROR'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const JOB_STATUSES = ['QUEUED', 'SENDING', 'PUBLISHED', 'FAILED', 'CANCELLED'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const PUBLISH_MODES = ['NOW', 'SCHEDULED'] as const
export type PublishMode = (typeof PUBLISH_MODES)[number]

export const PUBLISHING_ERROR_CODES = [
  'ACCOUNT_NOT_CONNECTED',
  'AUTHORIZATION_EXPIRED',
  'PERMISSION_DENIED',
  'INVALID_MEDIA',
  'INVALID_CONTENT',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'SCHEDULING_ERROR',
  'ENTITLEMENT_LIMIT',
  'UNKNOWN_ERROR',
] as const
export type PublishingErrorCode = (typeof PUBLISHING_ERROR_CODES)[number]
export const isPublishingErrorCode = (v: unknown): v is PublishingErrorCode => (PUBLISHING_ERROR_CODES as readonly unknown[]).includes(v)

/** Mirrors publishing_retryable() in the database: content/media problems need a new post. */
export const isRetryableError = (code: string | null | undefined) =>
  !code || !['INVALID_MEDIA', 'INVALID_CONTENT', 'SCHEDULING_ERROR'].includes(code)
export const MAX_MANUAL_ATTEMPTS = 5

export const WHATSAPP_MESSAGE_STATUSES = ['ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED'] as const
export type WhatsAppMessageStatus = (typeof WHATSAPP_MESSAGE_STATUSES)[number]

/** How the customer agreed to receive messages (WhatsApp Business Messaging Policy: opt-in required). */
export const OPT_IN_SOURCES = ['in_person', 'paper', 'website', 'sms', 'phone_call', 'whatsapp_message'] as const
export type OptInSource = (typeof OPT_IN_SOURCES)[number]

/** Connection flows. One Meta login connects Facebook Pages and their linked Instagram accounts. */
export const CONNECTORS = ['meta', 'whatsapp', 'youtube', 'google_business_profile'] as const
export type ConnectorId = (typeof CONNECTORS)[number]
export const isConnectorId = (v: unknown): v is ConnectorId => (CONNECTORS as readonly unknown[]).includes(v)

export const CONNECTOR_CHANNELS: Record<ConnectorId, readonly Channel[]> = {
  meta: ['FACEBOOK', 'INSTAGRAM'],
  whatsapp: ['WHATSAPP'],
  youtube: ['YOUTUBE'],
  google_business_profile: ['GOOGLE_BUSINESS_PROFILE'],
}
export const CHANNEL_CONNECTOR: Record<Channel, ConnectorId> = {
  FACEBOOK: 'meta',
  INSTAGRAM: 'meta',
  WHATSAPP: 'whatsapp',
  YOUTUBE: 'youtube',
  GOOGLE_BUSINESS_PROFILE: 'google_business_profile',
}

/** Permissions requested per connector (shown to the owner before connecting). */
export const CONNECTOR_SCOPES: Record<ConnectorId, readonly string[]> = {
  // Facebook Login for Business configuration (Meta App Dashboard) must request these.
  meta: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management', 'instagram_basic', 'instagram_content_publish'],
  // Embedded Signup (Cloud API + Marketing Messages API products).
  whatsapp: ['whatsapp_business_management', 'whatsapp_business_messaging'],
  youtube: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
  google_business_profile: ['https://www.googleapis.com/auth/business.manage'],
}

/** Generic icons (no brand logos); the channel name is always shown next to them. */
export const CHANNEL_ICONS: Record<Channel, LucideIcon> = {
  INSTAGRAM: Camera,
  FACEBOOK: ThumbsUp,
  WHATSAPP: MessageCircle,
  YOUTUBE: PlayCircle,
  GOOGLE_BUSINESS_PROFILE: MapPin,
}
export const SCHEDULED_ICON = Clock

export const CHANNEL_LABELS: Record<Channel, MessageKey> = {
  INSTAGRAM: 'publishing.channel.INSTAGRAM',
  FACEBOOK: 'publishing.channel.FACEBOOK',
  WHATSAPP: 'publishing.channel.WHATSAPP',
  YOUTUBE: 'publishing.channel.YOUTUBE',
  GOOGLE_BUSINESS_PROFILE: 'publishing.channel.GOOGLE_BUSINESS_PROFILE',
}

export const ERROR_MESSAGES: Record<PublishingErrorCode, MessageKey> = {
  ACCOUNT_NOT_CONNECTED: 'publishing.error.ACCOUNT_NOT_CONNECTED',
  AUTHORIZATION_EXPIRED: 'publishing.error.AUTHORIZATION_EXPIRED',
  PERMISSION_DENIED: 'publishing.error.PERMISSION_DENIED',
  INVALID_MEDIA: 'publishing.error.INVALID_MEDIA',
  INVALID_CONTENT: 'publishing.error.INVALID_CONTENT',
  RATE_LIMITED: 'publishing.error.RATE_LIMITED',
  PROVIDER_ERROR: 'publishing.error.PROVIDER_ERROR',
  SCHEDULING_ERROR: 'publishing.error.SCHEDULING_ERROR',
  ENTITLEMENT_LIMIT: 'publishing.error.ENTITLEMENT_LIMIT',
  UNKNOWN_ERROR: 'publishing.error.UNKNOWN_ERROR',
}

/**
 * What each channel can publish here. `media`: 'image' = one picture required,
 * 'optional' = text with an optional picture, 'video' = needs a video file (Phase 4 has no
 * video export yet, so these channels cannot publish until it exists), 'template' =
 * WhatsApp approved template sent to opted-in customers.
 */
export interface ChannelRules {
  media: 'image' | 'optional' | 'video' | 'template'
  maxCaption: number
  maxHashtags?: number
  maxMentions?: number
  /** Allowed width / height range for pictures. */
  aspect?: { min: number; max: number }
  /** The provider fetches a JPEG (we convert other formats on the server). */
  jpegOnly?: boolean
  maxBytes?: number
}

export const CHANNEL_RULES: Record<Channel, ChannelRules> = {
  // Instagram Platform › Content Publishing + IG User Media reference: JPEG only, ≤ 8 MB,
  // aspect 4:5 – 1.91:1, caption ≤ 2200 characters, ≤ 30 hashtags, ≤ 20 @ tags.
  INSTAGRAM: { media: 'image', maxCaption: 2200, maxHashtags: 30, maxMentions: 20, aspect: { min: 0.8, max: 1.91 }, jpegOnly: true, maxBytes: 8_000_000 },
  // Pages API › Posts: /{page}/photos (url + caption) or /{page}/feed (message).
  FACEBOOK: { media: 'optional', maxCaption: 5000 },
  // WhatsApp Marketing Messages API: approved MARKETING template, opted-in recipients only.
  WHATSAPP: { media: 'template', maxCaption: 1024 },
  // YouTube Data API videos.insert: video/* only.
  YOUTUBE: { media: 'video', maxCaption: 5000 },
  // Business Profile API localPosts (STANDARD): summary + optional photo.
  GOOGLE_BUSINESS_PROFILE: { media: 'optional', maxCaption: 1500 },
}

/** Channels that can publish with what the app produces today (pictures and text). */
export const canPublishToday = (channel: Channel) => CHANNEL_RULES[channel].media !== 'video'

export const PUBLISHING_LIMITS = {
  /** Scheduled posts: at least this far ahead (the scheduler runs every minute). */
  minLeadMinutes: 5,
  maxDaysAhead: 30,
  /** Upper bound for accounts in one post (the real limit per plan is billing_plans.max_accounts_per_post). */
  maxAccountsPerPostCap: 10,
  /** WhatsApp: recipients per send (no bulk blasting). */
  whatsappMaxRecipients: 50,
  /** WhatsApp template body variables we can fill. */
  whatsappMaxParams: 5,
  /** Automatic retries only for rate limits / temporary provider errors, at most this many attempts. */
  maxAutoAttempts: 3,
  /** Runner batch size per invocation. */
  runnerBatch: 5,
} as const

/** Provider HTTP calls never hang a request. */
export const PROVIDER_TIMEOUT_MS = 20_000

/** Meta Graph API version used by the adapters (current per the official docs, 2026-11). */
export const META_GRAPH_VERSION = 'v27.0'

export const PUBLISHING_PAGE_SIZE = 20

/** Publishing dashboard tabs. "Scheduled" = queued for a future time; "Queued" = due / sending. */
export const PUBLISHING_TABS = ['scheduled', 'queued', 'published', 'failed', 'cancelled'] as const
export type PublishingTab = (typeof PUBLISHING_TABS)[number]
