import type { Metadata } from 'next'
import { ContactLine, LegalPage } from '@/components/layout/legal-page'

export const metadata: Metadata = { title: 'Terms of Service', alternates: { canonical: '/terms' } }

/* Terms of Service (plain language). Plans, prices and limits are shown on the pricing page (database). */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms apply when you use Dukaan Sathi. By creating an account you agree to them. Please read them; they are
        written to be simple.
      </p>

      <h2>The service</h2>
      <p>
        Dukaan Sathi helps you create marketing content for your shop (text, posters, reel storyboards, voiceovers) with
        the help of AI, and publish or schedule it to the social accounts you connect. Features and monthly limits depend
        on your plan, as shown on the <a href="/pricing">pricing page</a>.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give correct details and keep your password safe. You are responsible for what happens in your account.</li>
        <li>One business per account. You must be allowed to act for the business and for every account you connect.</li>
      </ul>

      <h2>Your content and AI</h2>
      <ul>
        <li>You own the content you create. You give us permission to store and process it only to run the service for you.</li>
        <li>AI can make mistakes. Check every post, price and offer before publishing; you are responsible for what is published from your account. Nothing is published without your action or your approval.</li>
        <li>Do not create or publish anything illegal, misleading, hateful, or that breaks someone else&apos;s rights or a platform&apos;s rules.</li>
      </ul>

      <h2>Connected platforms</h2>
      <p>
        Facebook, Instagram, WhatsApp, YouTube and Google Business Profile have their own terms, limits and review rules.
        They may refuse a post or remove access; we show the result and do not control their decisions.
      </p>

      <h2>Plans and payments</h2>
      <ul>
        <li>Paid plans are monthly subscriptions paid through Razorpay and renew until you cancel. Cancelling stops the next renewal; you keep the plan until the end of the paid month.</li>
        <li>Monthly limits reset each month and unused amounts do not carry over.</li>
        <li>We may change prices or plans with notice in the app; changes apply from your next renewal.</li>
      </ul>

      <h2>Availability and liability</h2>
      <p>
        We work to keep Dukaan Sathi running and your data safe, but the service is provided &quot;as is&quot; and may
        sometimes be unavailable. To the extent the law allows, we are not responsible for indirect losses such as lost
        sales, and our total responsibility is limited to the amount you paid us in the last three months.
      </p>

      <h2>Ending the service</h2>
      <p>
        You can stop using the service and ask us to delete your account at any time (see the <a href="/privacy">Privacy
        Policy</a>). We may suspend accounts that break these terms or misuse the service.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of India.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <ContactLine />.
      </p>
    </LegalPage>
  )
}
