import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";

// Writes profiles.is_trusted_moderator — never prerender/cache.
export const dynamic = "force-dynamic";

// Grants/revokes the community-moderator trust flag
// (0016_bucket_flags_and_trust.sql). ADMIN_SECRET-gated like /api/admin/review
// — deliberately manual, no self-service application flow, since the whole
// point of a trust network is that trust is vetted by an admin first.
export async function POST(request: NextRequest) {
  if (!isValidBearerSecret(request.headers.get("authorization"), process.env.ADMIN_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { email, trusted } = body as { email?: string; trusted?: boolean };
  if (!email || typeof trusted !== "boolean") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();

  // supabase-js's admin API has no getUserByEmail — page through listUsers
  // instead. Fine at this app's current user scale; revisit if it ever
  // grows enough for this to matter.
  let userId: string | null = null;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      userId = match.id;
      break;
    }
    if (data.users.length < 200) break;
  }

  if (!userId) {
    return NextResponse.json({ error: "No user with that email" }, { status: 404 });
  }

  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, is_trusted_moderator: trusted }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
