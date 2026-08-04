import { Resend } from "resend";

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
