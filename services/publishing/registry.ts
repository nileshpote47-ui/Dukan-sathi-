import 'server-only'
import { CHANNEL_CONNECTOR, type Channel, type ConnectorId } from '@/lib/config/publishing'
import { isMockPublishing } from './env'
import { BusinessProfileConnector, YouTubeConnector } from './providers/google'
import { MetaConnector } from './providers/meta'
import { MockConnector } from './providers/mock'
import { WhatsAppConnector } from './providers/whatsapp'
import type { Connector } from './types'

/**
 * The connector (provider adapter) for a connection flow. Adding a platform = one adapter in
 * providers/, one entry here and its channel in lib/config/publishing.ts (+ the DB check list).
 */
export function getConnector(id: ConnectorId): Connector {
  if (isMockPublishing()) return new MockConnector(id)
  switch (id) {
    case 'meta':
      return new MetaConnector()
    case 'whatsapp':
      return new WhatsAppConnector()
    case 'youtube':
      return new YouTubeConnector()
    case 'google_business_profile':
      return new BusinessProfileConnector()
  }
}

/** The adapter that publishes to an account: chosen by the provider stored on the account. */
export function getPublisher(channel: Channel, provider: string): Connector {
  const id = CHANNEL_CONNECTOR[channel]
  if (provider === 'mock') {
    // Mock accounts only work while mock publishing is on (tests); never in production.
    if (!isMockPublishing()) throw new Error('Mock accounts cannot publish here')
    return new MockConnector(id)
  }
  return getConnector(id)
}
