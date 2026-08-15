import AppShell from "@/app/components/AppShell";
import { fetchQualifyingEvents } from "@/lib/events-query";

// Live DB query — don't let this get prerendered/frozen at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { events, error } = await fetchQualifyingEvents();
  return <AppShell events={events} error={error} />;
}
