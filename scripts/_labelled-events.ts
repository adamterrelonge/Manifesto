// Shared loader for the offline classification scripts. Reads every live
// (published, non-duplicate) event with its organiser and existing bucket
// tags, paginating past PostgREST's 1000-row cap.

import { createAdminClient } from "@/lib/supabase/admin";
import type { LabelSourceEvent } from "@/lib/semantic";

const PAGE_SIZE = 1000;

interface Row {
  id: string;
  title: string;
  description: string | null;
  is_free: boolean;
  source_provider: string;
  organisers: { name: string; source_type: string; profile_url: string | null } | null;
  event_buckets: { confidence: number | null; assigned_by: string; buckets: { slug: string } | null }[];
}

export type Admin = ReturnType<typeof createAdminClient>;

export async function loadLabelledEvents(admin: Admin): Promise<LabelSourceEvent[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("events")
      .select(
        "id, title, description, is_free, source_provider, organisers(name, source_type, profile_url), event_buckets(confidence, assigned_by, buckets(slug))"
      )
      .eq("status", "published")
      .eq("is_duplicate", false)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1)
      .returns<Row[]>();
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    isFree: r.is_free,
    sourceProvider: r.source_provider,
    organiserSourceType: r.organisers?.source_type ?? null,
    organiserProfileUrl: r.organisers?.profile_url ?? null,
    organiserName: r.organisers?.name ?? null,
    tags: r.event_buckets
      .filter((eb) => eb.buckets)
      .map((eb) => ({ bucketSlug: eb.buckets!.slug, confidence: eb.confidence, assignedBy: eb.assigned_by })),
  }));
}

/** Organiser-level identity for "distinct sources" counts. */
export function sourceKey(event: LabelSourceEvent): string {
  return event.organiserName ? `${event.sourceProvider}:${event.organiserName}` : event.sourceProvider;
}
