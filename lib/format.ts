import type { EventListItem } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEventDate(startAt: string): string {
  return dateFormatter.format(new Date(startAt));
}

export function formatEventPrice(
  event: Pick<EventListItem, "is_free" | "price_min" | "currency">
): string | null {
  if (event.is_free) return "Free";
  if (event.price_min == null) return null;
  return `From ${event.currency} ${event.price_min}`;
}
