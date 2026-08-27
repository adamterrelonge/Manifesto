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

  // "Be an organiser" signups (app/api/submit/route.ts, mode: "organiser")
  // land here too — a pending row in organisers, not an event.
  const { data: organiserData, error: organiserError } = await admin
    .from("organisers")
    .select("id, name, profile_url, bio, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);

  if (organiserError) {
    return NextResponse.json({ error: organiserError.message }, { status: 500 });
  }

  return NextResponse.json({ submissions: data ?? [], organiserSubmissions: organiserData ?? [] });
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { eventId, organiserId, action } = (body ?? {}) as {
    eventId?: string;
    organiserId?: string;
    action?: "approve" | "reject";
  };

  if ((!eventId && !organiserId) || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (organiserId) {
    if (action === "reject") {
      const { error } = await admin.from("organisers").delete().eq("id", organiserId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const { error } = await admin
      .from("organisers")
      .update({ status: "approved" })
      .eq("id", organiserId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

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
