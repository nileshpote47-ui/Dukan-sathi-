import { z } from 'zod'
import { msg, requiredText } from './fields'

const email = z
  .string(msg('validation.required'))
  .trim()
  .toLowerCase()
  .min(1, msg('validation.required'))
  .pipe(z.email(msg('validation.email')))

export const loginSchema = z.object({
  email,
  password: z.string(msg('validation.required')).min(1, msg('validation.required')),
})

export const signupSchema = z.object({
  fullName: requiredText(2, 100),
  email,
  password: z
    .string(msg('validation.required'))
    .min(8, msg('validation.tooShort', { min: 8 }))
    .max(72, msg('validation.tooLong', { max: 72 })),
})

export type LoginInput = z.input<typeof loginSchema>
export type SignupInput = z.input<typeof signupSchema>

/** Only allow redirects to paths inside this app (prevents open redirects). */
export function safeNextPath(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback
  }
  return value
}
