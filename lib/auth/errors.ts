import type { AuthError } from '@supabase/supabase-js'
import type { MessageKey } from '@/lib/i18n'

/**
 * Turn a Supabase Auth error into a message the user can understand.
 * Raw error text is never shown (it can leak details).
 */
export function authErrorMessage(error: AuthError | null | undefined): MessageKey {
  if (!error) return 'errors.generic'
  switch (error.code) {
    case 'invalid_credentials':
      return 'errors.invalidCredentials'
    case 'email_not_confirmed':
      return 'errors.emailNotConfirmed'
    case 'user_already_exists':
    case 'email_exists':
      return 'errors.userExists'
    case 'weak_password':
      return 'errors.weakPassword'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'errors.rateLimited'
    case 'email_address_not_authorized':
      return 'errors.emailNotAllowed'
    case 'email_address_invalid':
      return 'errors.emailInvalid'
    case 'signup_disabled':
      return 'errors.signupDisabled'
    case 'session_expired':
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'errors.sessionExpired'
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'errors.network'
  return 'errors.generic'
}
