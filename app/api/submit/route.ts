import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEventBuckets, BUCKET_LABELS, type BucketSlug } from "@/lib/buckets";
import { scoreEventQuality } from "@/lib/quality";

export const dynamic = "force-dynamic";

const MAX_TITLE = 200;
const MAX_DESC = 2000;
const MAX_FIELD = 200;

interface SubmitBody {
  mode?: "manual" | "link" | "organiser";
  title?: string;
  description?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venuePostcode?: string;
  category?: string | null;
  sourceUrl?: string;
  isFree?: boolean;
  priceMin?: number | null;
  selfBuckets?: string[];
  // "organiser" mode:
  organiserName?: string;
  _trap?: string;
}

// "link" mode has no title field — derive a short one from the description
// (first sentence, or first MAX_TITLE chars) so the event row has something
// human-readable in the admin queue until a moderator confirms it from the link.
function deriveTitleFromDescription(description: string, fallbackUrl: string): string {
  const trimmed = description.trim();
  if (trimmed) {
    const firstSentence = trimmed.split(/(?<=[.!?])\s/)[0];
    return firstSentence.slice(0, MAX_TITLE);
  }
  try {
    return `Event via ${new URL(fallbackUrl).hostname}`;
  } catch {
    return "Event via link";
  }
}

function buildDateTime(date: string, time?: string): string | null {
  const cleanDate = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return null;

  if (time && /^\d{2}:\d{2}$/.test(time.trim())) {
    const d = new Date(`${cleanDate}T${time.trim()}:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(`${cleanDate}T00:00:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(request: NextRequest) {
  let body: SubmitBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot — bots that fill this field get a silent success, not an error.
  if (body._trap) return NextResponse.json({ ok: true });

  const mode = body.mode ?? "manual";
  const admin = createAdminClient();

  // "organiser" mode isn't an event at all — it's a signup for the
  // organisers table, held as status: "pending" until a moderator approves
  // it on /admin/submissions (see 0017_organiser_signups.sql).
  if (mode === "organiser") {
    const organiserName = (body.organiserName ?? "").trim().slice(0, MAX_FIELD);
    const profileUrl = (body.sourceUrl ?? "").trim().slice(0, MAX_FIELD);
    const bio = (body.description ?? "").trim().slice(0, MAX_DESC) || null;

    if (!organiserName) {
      return NextResponse.json({ error: "Your name or collective name is required" }, { status: 400 });
    }
    if (!profileUrl) {
      return NextResponse.json({ error: "A profile link is required" }, { status: 400 });
    }

    const { error: organiserError } = await admin.from("organisers").insert({
      name: organiserName,
      profile_url: profileUrl,
      bio,
      source_type: "manual",
      status: "pending",
    });

    if (organiserError) {
      console.error("Organiser submit error:", organiserError);
      return NextResponse.json({ error: "Failed to save — please try again" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const sourceUrl = (body.sourceUrl ?? "").trim().slice(0, MAX_FIELD) || null;
  const description = (body.description ?? "").trim().slice(0, MAX_DESC) || null;

  // "link" mode only asks for a link + description — no title or date, so
  // derive a placeholder title and flag the date as unconfirmed rather than
  // rejecting the submission. A moderator confirms both from the link
  // before approving on /admin/submissions.
  let title: string;
  let startAt: string;
  let dateUnconfirmed = false;

  if (mode === "link") {
    if (!sourceUrl) {
      return NextResponse.json({ error: "An event link is required" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: "A short description is required" }, { status: 400 });
    }
    title = deriveTitleFromDescription(description, sourceUrl);
    startAt = new Date().toISOString();
    dateUnconfirmed = true;
  } else {
    title = (body.title ?? "").trim().slice(0, MAX_TITLE);
    if (!title) {
      return NextResponse.json({ error: "Event name is required" }, { status: 400 });
    }

    const builtStartAt = buildDateTime(body.startDate ?? "", body.startTime);
    if (!builtStartAt) {
      return NextResponse.json({ error: "A valid start date is required" }, { status: 400 });
    }
    startAt = builtStartAt;
  }

  const endAt = mode === "manual" && body.endDate ? buildDateTime(body.endDate, body.endTime) : null;
  const venueName = mode === "manual" ? (body.venueName ?? "").trim().slice(0, MAX_FIELD) : "";

  // Venue — always insert a fresh row for manual submissions; the dedup
  // pipeline will merge with an existing venue on the next ingest run.
  let venueId: string | null = null;
  if (venueName) {
    const { data: insertedVenue } = await admin
      .from("venues")
      .insert({
        name: venueName,
        address: (body.venueAddress ?? "").trim().slice(0, MAX_FIELD) || null,
        city: (body.venueCity ?? "").trim().slice(0, MAX_FIELD) || null,
        postcode: (body.venuePostcode ?? "").trim().slice(0, MAX_FIELD) || null,
      })
      .select("id")
      .single();
    venueId = insertedVenue?.id ?? null;
  }

  // Score quality inline so the event already passes the gate when published.
  const { score, flags } = scoreEventQuality({
    title,
    description,
    venueId,
    imageUrl: null,
  });
  if (dateUnconfirmed) flags.unshift("date not provided — confirm from the link before approving");

  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      title,
      description,
      start_at: startAt,
      end_at: endAt,
      venue_id: venueId,
      category: body.category ?? null,
      is_free: body.isFree ?? false,
      price_min: body.priceMin ?? null,
      price_max: null,
      currency: "GBP",
      source_provider: "manual",
      source_id: crypto.randomUUID(),
      source_url: sourceUrl,
      // Submitted events land as drafts — admin must publish before they're visible.
      status: "draft",
      is_duplicate: false,
      quality_score: score,
      quality_flags: flags,
      scraped_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (eventError) {
    console.error("Submit error:", eventError);
    return NextResponse.json({ error: "Failed to save — please try again" }, { status: 500 });
  }

  // Keyword classifier on the submitted text
  const classifierMatches = classifyEventBuckets({
    title,
    description,
    isFree: body.isFree ?? false,
  });

  // Self-tagged buckets override classifier where both match the same slug
  const bucketMap = new Map<string, { confidence: number; evidence: string; assignedBy: string }>();
  for (const m of classifierMatches) {
    bucketMap.set(m.bucketSlug, { confidence: m.confidence, evidence: m.evidence, assignedBy: "ai" });
  }
  for (const slug of body.selfBuckets ?? []) {
    if (slug in BUCKET_LABELS) {
      bucketMap.set(slug as BucketSlug, {
        confidence: 1.0,
        evidence: "organiser self-tagged",
        assignedBy: "organiser",
      });
    }
  }

  if (bucketMap.size > 0) {
    const { data: bucketRows } = await admin
      .from("buckets")
      .select("id, slug")
      .in("slug", [...bucketMap.keys()]);

    if (bucketRows?.length) {
      await admin.from("event_buckets").insert(
        bucketRows.map((b) => {
          const entry = bucketMap.get(b.slug)!;
          return {
            event_id: event.id,
            bucket_id: b.id,
            confidence: entry.confidence,
            evidence: entry.evidence,
            assigned_by: entry.assignedBy,
          };
        })
      );
    }
  }

  return NextResponse.json({ ok: true });
}
