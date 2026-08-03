import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";

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
    .from("events")
    .select(
      "id, title, description, start_at, end_at, is_free, price_min, source_url, quality_score, quality_flags, created_at, venues(name, address, city, postcode), event_buckets(confidence, assigned_by, buckets(slug, label))"
    )
    .eq("status", "draft")
    .eq("source_provider", "manual")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submissions: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { eventId, action } = (body ?? {}) as { eventId?: string; action?: "approve" | "reject" };

  if (!eventId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "reject") {
    const { error } = await admin.from("events").delete().eq("id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Approve: publish the event. The bucket gate in app/page.tsx handles
  // whether it actually appears — organiser self-tags (confidence 1.0) pass
  // immediately; AI-tagged buckets below HIGH_CONFIDENCE_THRESHOLD stay in
  // the bucket review queue until a moderator confirms them.
  const { error } = await admin
    .from("events")
    .update({ status: "published" })
    .eq("id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
