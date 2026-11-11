import type { Metadata } from "next"

import { LegalPage } from "@/components/daily/legal-page"

export const metadata: Metadata = { title: "Terms of Service · BeHero" }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="November 11, 2026">
      <p>
        This application (&ldquo;BeHero Publisher&rdquo;) is an internal tool operated by BeHero (behero.ge), an online
        platform that helps students prepare for mathematics exams. It is used only by the BeHero team to schedule
        and publish BeHero&rsquo;s own educational videos and images to BeHero&rsquo;s own social media accounts,
        including Facebook, Instagram and TikTok.
      </p>
      <h2>Who may use it</h2>
      <p>
        Access is limited to authorized members of the BeHero team. The tool is not offered to the public and does not
        let anyone else sign up or connect their accounts.
      </p>
      <h2>Content</h2>
      <ul>
        <li>Only content owned by BeHero, or that BeHero has the right to publish, is uploaded and posted.</li>
        <li>Content must follow the terms and community guidelines of each platform it is posted to.</li>
        <li>BeHero reviews captions and media before scheduling them.</li>
      </ul>
      <h2>Connected accounts</h2>
      <p>
        When a BeHero team member connects a social media account, the tool uses the permissions granted only to
        publish the content that the team schedules. Access can be revoked at any time from the connected
        platform&rsquo;s settings.
      </p>
      <h2>Availability</h2>
      <p>
        The tool is provided as is for BeHero&rsquo;s internal use. BeHero may change or stop it at any time.
      </p>
      <h2>Contact</h2>
      <p>Questions about these terms can be sent through behero.ge.</p>
    </LegalPage>
  )
}
