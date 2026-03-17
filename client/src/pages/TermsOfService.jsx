import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function TermsOfService() {
  const { isDark } = useTheme();

  return (
    <div className="max-w-3xl mx-auto px-4 pb-16">
      <Link to="/schedule" className="inline-flex items-center gap-1.5 text-sm text-fg/60 hover:text-fg transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h1 className="text-3xl font-display font-bold text-fg mb-2">Terms of Service</h1>
      <p className="text-fg/60 text-sm mb-8">Last updated: March 16, 2026</p>

      <div className="space-y-8 text-fg/80 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">1. Acceptance of Terms</h2>
          <p>
            By accessing or using SurvivorSZN ("the Service"), operated at survivorszn.com, you agree to be
            bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">2. Description of Service</h2>
          <p>
            SurvivorSZN is a free sports entertainment platform that allows users to create and participate
            in survivor pools and bracket challenges for major sports leagues (NFL, NBA, NHL, MLB, NCAAB).
            Users make predictions on game outcomes for fun and competition among friends.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">3. Account Registration</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>You must be at least 13 years old to create an account.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You agree to provide accurate information during registration.</li>
            <li>You may not create multiple accounts or impersonate others.</li>
            <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">4. User Conduct</h2>
          <p>When using SurvivorSZN, you agree not to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Use the Service for any illegal purpose</li>
            <li>Post abusive, harassing, or offensive content in league chats</li>
            <li>Attempt to gain unauthorized access to other users' accounts or data</li>
            <li>Use bots, scripts, or automated tools to interact with the Service</li>
            <li>Interfere with or disrupt the Service's infrastructure</li>
            <li>Exploit bugs or vulnerabilities instead of reporting them</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">5. Leagues & Commissioner Responsibilities</h2>
          <p>
            Users who create leagues ("Commissioners") have additional management capabilities, including
            setting league rules, managing members, and tracking entry fees. Commissioners agree to:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Use commissioner tools fairly and responsibly</li>
            <li>Not abuse administrative powers (e.g., unfairly removing members or manipulating results)</li>
            <li>Take responsibility for any entry fee collection and prize distribution within their league</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">6. Entry Fees & Payments</h2>
          <p>
            Some leagues may involve entry fees set by their commissioners. <strong>SurvivorSZN does not
            collect, process, or handle any payments.</strong> Entry fee tracking within the app is for
            record-keeping purposes only. All financial transactions between league members are conducted
            outside the platform and are solely the responsibility of the participants.
          </p>
          <p className="mt-2">
            SurvivorSZN is not responsible for any disputes regarding entry fees, prize pools, or payments
            between league members. We do not guarantee or facilitate any financial transactions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">7. Not Gambling</h2>
          <p>
            SurvivorSZN is a free sports entertainment and prediction platform. The Service itself does not
            constitute gambling, sports betting, or any form of wagering. We do not accept bets, offer odds,
            or facilitate gambling of any kind. Any entry fees arranged between league members are private
            arrangements outside the scope of this Service.
          </p>
          <p className="mt-2">
            Users are responsible for ensuring their use of the Service complies with all applicable local,
            state, and federal laws in their jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">8. Sports Data & Accuracy</h2>
          <p>
            SurvivorSZN displays sports data sourced from third-party providers (including ESPN). While we
            strive for accuracy, we do not guarantee that scores, schedules, statistics, or other sports
            data are always correct or up to date. The Service should not be relied upon as the sole source
            for sports information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">9. User-Generated Content</h2>
          <p>
            By posting content on SurvivorSZN (including chat messages, league names, and display names), you:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Retain ownership of your content</li>
            <li>Grant us a non-exclusive license to display your content within the Service</li>
            <li>Agree that your content does not violate any laws or third-party rights</li>
            <li>Understand that chat messages and picks are visible to other league members</li>
          </ul>
          <p className="mt-2">
            We reserve the right to remove content that violates these Terms without prior notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">10. Intellectual Property</h2>
          <p>
            The SurvivorSZN name, logo, design, and original code are owned by us. Team logos, names, and
            sports data belong to their respective owners (NCAA, NFL, NBA, NHL, MLB, ESPN, etc.) and are
            used for informational and entertainment purposes. You may not copy, modify, or distribute
            any part of the Service without our permission.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">11. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER
            EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
            OR SECURE. YOUR USE OF THE SERVICE IS AT YOUR OWN RISK.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">12. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, SURVIVORSZN AND ITS OPERATORS SHALL NOT BE LIABLE
            FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR
            USE OF THE SERVICE. THIS INCLUDES, WITHOUT LIMITATION, DAMAGES FOR LOSS OF PROFITS, DATA,
            OR OTHER INTANGIBLE LOSSES, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p className="mt-2">
            IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU HAVE PAID TO US, WHICH IS ZERO
            DOLLARS ($0), AS THE SERVICE IS FREE TO USE.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">13. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless SurvivorSZN, its operators, and affiliates from any
            claims, damages, or expenses arising from your use of the Service, your violation of these Terms,
            or your violation of any rights of another user or third party.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">14. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time, with or without cause,
            and with or without notice. Upon termination, your right to use the Service ceases immediately.
            You may also delete your account at any time by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">15. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Updated Terms will be posted on this page
            with a revised date. Your continued use of the Service after changes constitutes acceptance of
            the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">16. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the United States.
            Any disputes arising from these Terms or the Service shall be resolved in the appropriate courts.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-fg mb-3">17. Contact</h2>
          <p>
            If you have questions about these Terms, contact us at{' '}
            <a href="mailto:support@survivorszn.com" className="text-accent hover:underline">support@survivorszn.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
