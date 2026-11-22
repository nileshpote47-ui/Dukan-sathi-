import type { Metadata } from 'next'
import { ContactLine, LegalPage } from '@/components/layout/legal-page'

export const metadata: Metadata = { title: 'Privacy Policy', alternates: { canonical: '/privacy' } }

/*
 * Privacy Policy. Describes only what the app really does (keep it in sync with the code and the providers
 * listed in docs/DEPLOYMENT.md). Required for Google OAuth verification and Meta App Review.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Dukaan Sathi is a marketing assistant for small shops in India. This policy explains what information the app
        collects, why, who processes it, and how you can see, change or delete it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account: your name, email address, phone number (if you add it) and preferred language.</li>
        <li>Your business: shop name, category, address, contact details, opening hours and marketing preferences you enter.</li>
        <li>Content you create: posts, offers, prices, reel scripts, voiceover lines, posters, pictures and voiceovers.</li>
        <li>Connected accounts: the name and id of the Facebook Page, Instagram, WhatsApp, YouTube or Google Business Profile you connect, and the access tokens the platform gives us (stored encrypted).</li>
        <li>Publishing: what was posted where and when, the result, and post statistics the platform shares (views, likes, comments) for your own posts.</li>
        <li>WhatsApp customers you add yourself, with their consent record.</li>
        <li>Billing: your plan, payments and invoices (card and UPI details are handled by Razorpay, never stored by us).</li>
        <li>Usage and security logs: what features were used, errors and sign-in events, to keep the service working and safe.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the app for you: create content, make posters, reel previews and voiceovers, and publish or schedule posts only to the accounts you connect and only when you ask (or, with Premium Autopilot, after you approve each post).</li>
        <li>To show your plan, usage and analytics, and to process payments.</li>
        <li>To protect the service (limits against abuse, security logs) and to fix problems.</li>
      </ul>
      <p>We do not sell your data, we do not use it for advertising, and we do not use your content to train AI models.</p>

      <h2>Service providers that process data for us</h2>
      <ul>
        <li>Supabase (database, sign-in, file storage, Mumbai region) and Vercel (app hosting, Mumbai region).</li>
        <li>Google Gemini (writing post text), OpenAI (AI-designed posters), Sarvam AI (voiceovers): they receive only the text needed for the request you made, with your business details for context.</li>
        <li>Pixabay (free stock photo search): receives the search words you type.</li>
        <li>Razorpay (payments).</li>
        <li>Meta (Facebook, Instagram, WhatsApp) and Google (YouTube, Google Business Profile): receive the posts you publish to your own accounts.</li>
      </ul>

      <h2>Google user data</h2>
      <p>
        When you connect YouTube or Google Business Profile, Dukaan Sathi uses the access you grant only to show your
        channel or business location in the app, to publish the posts you create to it, and to read the results of
        those posts. Dukaan Sathi&apos;s use and transfer of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We do not use Google user data for advertising, do not sell it, do not
        let people read it except with your consent, for security or as required by law, and do not use it to train AI
        models.
      </p>

      <h2>Keeping your data safe</h2>
      <p>
        Every row of data is tied to its owner and protected by database access rules, files are private and shown only
        through short-lived links, platform tokens are encrypted, and keys stay on our servers. No system is perfectly
        secure, but we work to protect your information and fix problems quickly.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account exists. Content, pictures and voiceovers you delete are removed. When you
        disconnect a platform, its tokens are removed and scheduled posts to it are cancelled. Payment records are kept as
        long as the law requires.
      </p>

      <h2>Your choices and data deletion</h2>
      <ul>
        <li>See and change your business details, content and settings in the app at any time.</li>
        <li>Delete content, pictures and posters in the app; disconnect any platform from Connected accounts.</li>
        <li>
          To delete your whole account and all its data, <ContactLine /> from the email address of your account. We delete
          it within 30 days and confirm by email. Facebook, Instagram, YouTube and Google permissions can also be removed
          from those platforms&apos; own settings.
        </li>
      </ul>

      <h2>Children</h2>
      <p>Dukaan Sathi is for business owners and is not meant for children under 18.</p>

      <h2>Changes</h2>
      <p>If we change this policy we update the date above and, for important changes, tell you in the app.</p>

      <h2>Contact</h2>
      <p>
        For any question about your data, <ContactLine />.
      </p>
    </LegalPage>
  )
}
