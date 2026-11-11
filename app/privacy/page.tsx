import type { Metadata } from "next"

import { LegalPage } from "@/components/daily/legal-page"

export const metadata: Metadata = { title: "Privacy Policy · BeHero" }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 11, 2026">
      <p>
        BeHero Publisher is an internal tool that BeHero (behero.ge) uses to publish its own educational content to its
        own social media accounts. This policy explains what the tool stores and why.
      </p>
      <h2>What we store</h2>
      <ul>
        <li>
          Media files and captions that the BeHero team uploads for publishing. Files are deleted from storage after
          they are published.
        </li>
        <li>
          Access tokens for the BeHero social media accounts that the team connects (Facebook Page, Instagram,
          TikTok), and the basic account identifiers returned with them. They are stored on the server only and are
          used solely to publish the scheduled content.
        </li>
        <li>Publishing results, such as post IDs and error messages, to show the team what was published.</li>
      </ul>
      <h2>What we do not do</h2>
      <ul>
        <li>We do not collect data about other users, followers or viewers.</li>
        <li>We do not sell, share or use any data for advertising.</li>
        <li>We do not read, download or analyze content from connected accounts beyond what publishing requires.</li>
      </ul>
      <h2>Disconnecting</h2>
      <p>
        A connected account can be disconnected at any time from that platform&rsquo;s settings (for TikTok: Settings
        and privacy → Security → Manage app permissions). Stored tokens are then no longer valid and can be deleted on
        request.
      </p>
      <h2>Contact</h2>
      <p>Questions about privacy can be sent through behero.ge.</p>
    </LegalPage>
  )
}
