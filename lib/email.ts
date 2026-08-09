import { Resend } from "resend";
import { formatEventDate } from "@/lib/format";

// Best-effort — a missing RESEND_API_KEY logs and no-ops rather than
// throwing, so approving a claim never fails because email isn't set up.
// To activate: create a Resend account, set RESEND_API_KEY (and optionally
// RESEND_FROM_EMAIL once a sending domain is verified) in .env.local.
export async function sendClaimApprovedEmail(to: string, organiserName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY not set — skipping claim-approved email to ${to}`);
    return;
  }

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Manifesto <onboarding@resend.dev>",
      to,
      subject: `Your claim for "${organiserName}" was approved`,
      text: `Good news — your claim for "${organiserName}" on Manifesto has been approved. You can now edit your listing at /organiser/manage.`,
    });
  } catch (err) {
    console.error("Failed to send claim-approved email:", (err as Error).message);
  }
}

export interface DigestEvent {
  title: string;
  startAt: string;
  venueName: string | null;
  sourceUrl: string | null;
}

// Same no-op-without-a-key posture as sendClaimApprovedEmail above — the
// notification-delivery worker (lib/notifications.ts) still records the
// match in event_notifications either way, so nothing gets silently
// re-sent once RESEND_API_KEY is actually set.
export async function sendNotificationDigestEmail(to: string, events: DigestEvent[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY not set — skipping notification digest email to ${to}`);
    return;
  }
  if (events.length === 0) return;

  const lines = events.map((event) => {
    const when = formatEventDate(event.startAt);
    const where = event.venueName ?? "venue TBC";
    const link = event.sourceUrl ? ` — ${event.sourceUrl}` : "";
    return `- ${event.title} (${when}, ${where})${link}`;
  });

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Manifesto <onboarding@resend.dev>",
      to,
      subject: `${events.length} new event${events.length === 1 ? "" : "s"} matching your interests`,
      text: `New events matching your saved buckets/location on Manifesto:\n\n${lines.join("\n")}\n\nManage what you're notified about anytime in Settings.`,
    });
  } catch (err) {
    console.error("Failed to send notification digest email:", (err as Error).message);
  }
}
