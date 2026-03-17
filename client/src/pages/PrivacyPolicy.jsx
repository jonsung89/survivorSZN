import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function PrivacyPolicy() {
  const { isDark } = useTheme();

  return (
    <div className="max-w-3xl mx-auto px-4 pb-16">
      <Link to="/schedule" className="inline-flex items-center gap-1.5 text-sm text-fg/60 hover:text-fg transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h1 className="text-3xl font-display font-bold text-fg mb-2">Privacy Policy</h1>
      <p className="text-fg/60 text-sm mb-8">Last updated: March 17, 2026</p>

      <div className="space-y-8 text-fg/80 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">1. Introduction</h2>
          <p>
            SurvivorSZN ("we," "us," or "our") operates the website survivorszn.com (the "Service").
            This Privacy Policy explains how we collect, use, and protect your personal information when you use our Service.
            By using SurvivorSZN, you agree to the collection and use of information as described in this policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">2. Information We Collect</h2>

          <h3 className="font-semibold text-fg mt-4 mb-2">Account Information</h3>
          <p>When you create an account, we collect:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Display name (username)</li>
            <li>First and last name (optional)</li>
            <li>Email address (via Google sign-in or manually entered)</li>
            <li>Phone number (if you sign in via phone verification)</li>
            <li>Profile picture (if you upload one)</li>
          </ul>

          <h3 className="font-semibold text-fg mt-4 mb-2">Authentication Data</h3>
          <p>
            We use Firebase Authentication (a Google service) to handle sign-in. Firebase processes your credentials
            securely — we never store your passwords. Firebase may collect device identifiers, IP addresses,
            and other authentication metadata as described in{' '}
            <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Firebase's Privacy Policy
            </a>.
          </p>

          <h3 className="font-semibold text-fg mt-4 mb-2">Gameplay Data</h3>
          <p>We collect data related to your use of the Service, including:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>League memberships and settings</li>
            <li>Survivor pool picks and results</li>
            <li>Bracket challenge entries and scores</li>
            <li>Chat messages sent within leagues</li>
            <li>Timestamps of account activity (login times, pick submissions)</li>
          </ul>

          <h3 className="font-semibold text-fg mt-4 mb-2">Uploaded Content</h3>
          <p>
            If you upload a profile picture, it is stored on Cloudflare R2 (cloud storage) and is publicly
            accessible via a unique URL tied to your account.
          </p>

          <h3 className="font-semibold text-fg mt-4 mb-2">Usage Analytics</h3>
          <p>To understand how our features are used and improve the Service, we collect:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Page views and navigation patterns</li>
            <li>Feature interactions (which features you use and for how long)</li>
            <li>Device type (mobile, desktop, or tablet) detected from your browser's user agent</li>
            <li>Anonymous session identifiers stored in your browser's local storage (for non-authenticated visitors)</li>
          </ul>
          <p className="mt-2">
            This data is used solely for internal analytics and is never shared with third parties for advertising or marketing purposes.
            Admin users are excluded from analytics tracking.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">3. Information We Do NOT Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Payment information:</strong> SurvivorSZN does not process payments or store credit card, bank account, or financial information. Entry fees for leagues are tracked manually by league commissioners and settled outside the platform.</li>
            <li><strong>Advertising data:</strong> We do not use advertising trackers, retargeting pixels, or share your data with ad networks.</li>
            <li><strong>Tracking cookies:</strong> We do not set tracking cookies. We use localStorage for preferences and anonymous session identifiers only.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">4. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Create and manage your account</li>
            <li>Enable you to join and participate in survivor pools and bracket challenges</li>
            <li>Display your username and profile picture to other league members</li>
            <li>Facilitate league chat and communication between members</li>
            <li>Show standings, picks, and results within your leagues</li>
            <li>Respond to support requests</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">5. Third-Party Services</h2>
          <p>We use the following third-party services:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Firebase (Google):</strong> Authentication, user identity management, and usage analytics</li>
            <li><strong>Supabase (PostgreSQL):</strong> Database hosting for user and gameplay data</li>
            <li><strong>Cloudflare R2:</strong> Storage for profile images</li>
            <li><strong>ESPN:</strong> Public sports data (scores, schedules, team information) — no user data is sent to ESPN</li>
            <li><strong>Google Fonts:</strong> Font delivery (standard web request, may log IP addresses)</li>
          </ul>
          <p className="mt-2">
            These services have their own privacy policies governing their handling of data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">6. Data Sharing</h2>
          <p>We do not sell, rent, or share your personal information with third parties for marketing purposes. Your information may be visible to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>League members:</strong> Your display name, profile picture, picks, and chat messages are visible to other members of your leagues.</li>
            <li><strong>League commissioners:</strong> Commissioners can view member information and manage league settings.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">7. Data Security</h2>
          <p>
            We take reasonable measures to protect your information, including secure authentication via Firebase,
            encrypted database connections, and access controls. However, no method of electronic transmission
            or storage is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">8. Data Retention & Deletion</h2>
          <p>
            Your account data is retained as long as your account is active. If you wish to delete your account
            and all associated data, please contact us at{' '}
            <a href="mailto:support@survivorszn.com" className="text-accent hover:underline">support@survivorszn.com</a>.
            We will process deletion requests within 30 days.
          </p>
          <p className="mt-2">
            When a league is deleted by its commissioner, all associated data (picks, chat messages, standings)
            is permanently removed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">9. Children's Privacy</h2>
          <p>
            SurvivorSZN is not intended for users under the age of 13. We do not knowingly collect personal
            information from children under 13. If we become aware that we have collected information from a
            child under 13, we will take steps to delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">10. Analytics & Consent (GDPR)</h2>
          <p>
            We collect anonymous usage analytics to improve the Service, including page views, feature usage, and device type.
            This data helps us understand which features are popular and where to invest our development effort.
          </p>

          <h3 className="font-semibold text-fg mt-4 mb-2">For EU/EEA Users</h3>
          <p>
            If you are located in the European Union or European Economic Area, we will ask for your explicit consent
            before collecting analytics data, in compliance with the General Data Protection Regulation (GDPR).
            You may accept or decline analytics tracking via the consent banner shown on your first visit.
            If you decline, no analytics data will be collected from your activity.
          </p>
          <p className="mt-2">
            You can change your preference at any time by clearing your browser's local storage for this site,
            which will cause the consent banner to reappear on your next visit.
          </p>

          <h3 className="font-semibold text-fg mt-4 mb-2">For Non-EU Users</h3>
          <p>
            If you are located outside the EU/EEA, analytics are collected by default as described in this policy.
            This data is used solely for internal product improvement and is never sold or shared with third parties
            for advertising or marketing purposes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">11. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your personal information</li>
            <li>Object to or restrict certain processing of your data</li>
            <li>Withdraw consent for analytics tracking (EU/EEA residents, under GDPR)</li>
            <li>Lodge a complaint with a supervisory authority (EU/EEA residents)</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:support@survivorszn.com" className="text-accent hover:underline">support@survivorszn.com</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify users of significant changes
            by posting the updated policy on this page with a revised "Last updated" date. Your continued use
            of the Service after changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">13. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, contact us at{' '}
            <a href="mailto:support@survivorszn.com" className="text-accent hover:underline">support@survivorszn.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
