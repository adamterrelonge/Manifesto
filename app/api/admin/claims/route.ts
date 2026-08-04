import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";
import { sendClaimApprovedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function checkAuth(request: NextRequest) {
  return isValidBearerSecret(request.headers.get("authorization"), process.env.ADMIN_SECRET);
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organiser_claims")
    .select(
      "id, claim_email, message, created_at, organisers(id, name, profile_url, claimed_by)"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ claims: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { claimId, action } = (body ?? {}) as { claimId?: string; action?: "approve" | "reject" };

  if (!claimId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: claim, error: claimError } = await admin
    .from("organiser_claims")
    .select("id, organiser_id, user_id, status, claim_email, organisers(name)")
    .eq("id", claimId)
    .single();

  if (claimError || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }
  if (claim.status !== "pending") {
    return NextResponse.json({ error: "Claim already reviewed" }, { status: 409 });
  }

  if (action === "reject") {
    const { error } = await admin
      .from("organiser_claims")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", claimId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Approve: link the organiser to this user, then close out the claim.
  // Two writes, not a transaction — if the second fails the claim stays
  // "pending" with the organiser already linked, which is safe to re-run
  // (claim_organiser_update only checks claimed_by, not claim status).
  const { error: organiserError } = await admin
    .from("organisers")
    .update({ claimed_by: claim.user_id, claimed_at: new Date().toISOString() })
    .eq("id", claim.organiser_id);

  if (organiserError) {
    return NextResponse.json({ error: organiserError.message }, { status: 500 });
  }

  const { error: claimUpdateError } = await admin
    .from("organiser_claims")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", claimId);

  if (claimUpdateError) {
    return NextResponse.json({ error: claimUpdateError.message }, { status: 500 });
  }

  // Best-effort — never fails the approval itself (see lib/email.ts).
  const organiserName = (claim.organisers as unknown as { name: string } | null)?.name ?? "your organiser listing";
  await sendClaimApprovedEmail(claim.claim_email, organiserName);

  return NextResponse.json({ ok: true });
}
