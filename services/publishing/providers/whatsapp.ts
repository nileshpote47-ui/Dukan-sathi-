import 'server-only'
import { randomInt } from 'node:crypto'
import { CONNECTOR_SCOPES, META_GRAPH_VERSION } from '@/lib/config/publishing'
import { env } from '../env'
import { HttpTimeoutError, requestJson } from '../http'
import type { ConnectedAccount, Connector, PublishRequest, PublishResult, PublishTarget, StoredCredentials, WhatsAppTemplate } from '../types'
import { PublishingProviderError } from '../types'
import { appSecretProof, graphError, mapGraphError } from './meta-shared'

/*
 * WhatsApp Business Platform (official docs: Embedded Signup v4 + onboarding as a Tech
 * Provider, Template fundamentals, Marketing Messages API for WhatsApp, Get opt-in).
 *
 * - Connect: Embedded Signup (Facebook JS SDK, config META_WHATSAPP_CONFIG_ID) returns a code,
 *   the WABA id and the phone number id to the browser; the server exchanges the code for a
 *   business token, subscribes the app to the WABA's webhooks and registers the number.
 * - Send: only APPROVED MARKETING templates, only to customers with a recorded opt-in, through
 *   the Marketing Messages API (Cloud API stops accepting marketing messages on 2027-10-13).
 *   One message per recipient; no bulk lists, no free-form marketing text.
 */

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

interface TemplateRow {
  name: string
  language: string
  status: string
  category: string
  parameter_format?: string
  components?: { type: string; format?: string; text?: string; buttons?: { type: string; url?: string }[] }[]
}

/** Count {{1}}…{{n}} body variables (positional parameters only). */
export function countPositionalParams(text: string): number {
  const numbers = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))
  return numbers.length ? Math.max(...numbers) : 0
}

/** Templates this app can fill: approved MARKETING, optional IMAGE header, positional body params, no variable URL buttons. */
export function usableTemplates(rows: TemplateRow[], maxParams: number): WhatsAppTemplate[] {
  const out: WhatsAppTemplate[] = []
  for (const row of rows) {
    if (row.status !== 'APPROVED' || row.category !== 'MARKETING' || row.parameter_format === 'NAMED') continue
    const header = row.components?.find((c) => c.type === 'HEADER')
    const body = row.components?.find((c) => c.type === 'BODY')
    const buttons = row.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? []
    if (!body?.text) continue
    if (header && !(header.format === 'IMAGE' || (header.format === 'TEXT' && countPositionalParams(header.text ?? '') === 0))) continue
    if (buttons.some((b) => b.type === 'URL' && /\{\{/.test(b.url ?? ''))) continue
    const params = countPositionalParams(body.text)
    if (params > maxParams) continue
    out.push({ name: row.name, language: row.language, category: row.category, bodyText: body.text, bodyParamCount: params, imageHeader: header?.format === 'IMAGE' })
  }
  return out
}

export class WhatsAppConnector implements Connector {
  readonly id = 'whatsapp' as const
  readonly provider = 'meta' as const

  private get config() {
    return { appId: env('META_APP_ID'), appSecret: env('META_APP_SECRET'), configId: env('META_WHATSAPP_CONFIG_ID') }
  }

  isConfigured() {
    const c = this.config
    return Boolean(c.appId && c.appSecret && c.configId)
  }

  private async call<T>(path: string, token: string, init: { method?: string; json?: unknown; params?: Record<string, string> } = {}) {
    const proof = appSecretProof(token, this.config.appSecret!)
    const params = new URLSearchParams({ ...init.params, appsecret_proof: proof })
    return requestJson<T>(`${GRAPH}/${path}?${params}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init.json ? { 'Content-Type': 'application/json' } : {}) },
      body: init.json ? JSON.stringify(init.json) : undefined,
    })
  }

  async completeEmbeddedSignup({ code, wabaId, phoneNumberId }: { code: string; wabaId: string; phoneNumberId: string }): Promise<ConnectedAccount[]> {
    const { appId, appSecret } = this.config
    // Step 1: code (valid 5 minutes) → business integration system user token.
    const token = await requestJson<{ access_token?: string }>(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: appId!, client_secret: appSecret!, code })}`,
    )
    const accessToken = token.data?.access_token
    if (!token.ok || !accessToken) throw new PublishingProviderError('PERMISSION_DENIED', 'WhatsApp signup could not be completed')

    // The token must actually grant this phone number (ids from the browser are only hints).
    const phone = await this.call<{ id?: string; display_phone_number?: string; verified_name?: string }>(phoneNumberId, accessToken, {
      params: { fields: 'id,display_phone_number,verified_name' },
    })
    if (!phone.ok || phone.data?.id !== phoneNumberId) throw new PublishingProviderError('PERMISSION_DENIED', 'The WhatsApp number is not accessible')

    // Step 2: subscribe the app to the WABA's webhooks (message statuses, opt-out replies).
    const sub = await this.call<{ success?: boolean }>(`${wabaId}/subscribed_apps`, accessToken, { method: 'POST' })
    if (!sub.ok) {
      const mapped = mapGraphError(graphError(sub.data), sub.status)
      throw new PublishingProviderError(mapped.code, mapped.message)
    }

    // Step 3: register the number for Cloud API use (two-step verification PIN, kept encrypted).
    const pin = String(randomInt(100000, 1000000))
    const registered = await this.call(`${phoneNumberId}/register`, accessToken, { method: 'POST', json: { messaging_product: 'whatsapp', pin } })
    const credentials: StoredCredentials = { accessToken, expiresAt: null, ...(registered.ok ? { pin } : {}) }
    if (!registered.ok) console.warn('[publishing] whatsapp register skipped', { code: graphError(registered.data)?.code ?? registered.status })

    return [
      {
        channel: 'WHATSAPP',
        provider: 'meta',
        externalId: phoneNumberId,
        name: phone.data.verified_name ? `${phone.data.verified_name} (${phone.data.display_phone_number ?? ''})` : (phone.data.display_phone_number ?? 'WhatsApp'),
        parentId: wabaId,
        scopes: [...CONNECTOR_SCOPES.whatsapp],
        metadata: { display_phone_number: phone.data.display_phone_number ?? null, verified_name: phone.data.verified_name ?? null },
        credentials,
      },
    ]
  }

  async listWhatsAppTemplates(target: PublishTarget, credentials: StoredCredentials): Promise<WhatsAppTemplate[]> {
    if (!target.parentId) return []
    const res = await this.call<{ data?: TemplateRow[] }>(`${target.parentId}/message_templates`, credentials.accessToken, {
      params: { fields: 'name,language,status,category,parameter_format,components', limit: '100' },
    })
    if (!res.ok) {
      const mapped = mapGraphError(graphError(res.data), res.status)
      throw new PublishingProviderError(mapped.code, mapped.message, mapped.accountStatus ?? null)
    }
    return usableTemplates(res.data?.data ?? [], 5)
  }

  async publish({ target, credentials, mediaUrl, whatsapp }: PublishRequest): Promise<PublishResult> {
    if (!whatsapp || !whatsapp.recipients.length) return { ok: false, code: 'INVALID_CONTENT', message: 'No opted-in recipients' }
    const { template } = whatsapp
    if (template.imageHeader && !mediaUrl) return { ok: false, code: 'INVALID_MEDIA', message: 'This template needs a picture' }

    const components: unknown[] = []
    if (template.imageHeader) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: mediaUrl } }] })
    if (template.bodyParams.length) components.push({ type: 'body', parameters: template.bodyParams.map((text) => ({ type: 'text', text })) })

    const messages: { contactId: string; wamid: string | null; errorCode?: string | null }[] = []
    let firstFailure: ReturnType<typeof mapGraphError> | null = null
    for (const recipient of whatsapp.recipients) {
      let res
      try {
        res = await this.call<{ messages?: { id: string }[] }>(`${target.externalId}/marketing_messages`, credentials.accessToken, {
          method: 'POST',
          json: {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient.phone.replace(/^\+/, ''),
            type: 'template',
            template: { name: template.name, language: { code: template.language }, ...(components.length ? { components } : {}) },
          },
        })
      } catch (error) {
        messages.push({ contactId: recipient.contactId, wamid: null, errorCode: error instanceof HttpTimeoutError ? 'timeout' : 'network' })
        continue
      }
      const wamid = res.data?.messages?.[0]?.id ?? null
      if (res.ok && wamid) {
        messages.push({ contactId: recipient.contactId, wamid })
        continue
      }
      const error = graphError(res.data)
      const mapped = mapGraphError(error, res.status)
      messages.push({ contactId: recipient.contactId, wamid: null, errorCode: String(error?.code ?? res.status) })
      firstFailure ??= mapped
      // Authorization or permission problems affect every recipient: stop here.
      if (mapped.code === 'AUTHORIZATION_EXPIRED' || mapped.code === 'PERMISSION_DENIED' || error?.code === 130429) break
    }

    const accepted = messages.filter((m) => m.wamid).length
    const metadata = { recipients: whatsapp.recipients.length, accepted, rejected: messages.length - accepted, template: template.name }
    if (accepted > 0) return { ok: true, externalId: null, externalUrl: null, messages, metadata }
    return {
      ok: false,
      code: firstFailure?.code ?? 'PROVIDER_ERROR',
      message: firstFailure?.message ?? 'No message was accepted',
      accountStatus: firstFailure?.accountStatus ?? null,
      retryInSeconds: null,
      messages,
    }
  }
}
