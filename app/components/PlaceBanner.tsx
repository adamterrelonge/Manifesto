import Link from "next/link";

interface PlaceBannerProps {
  heading: string;
}

// Visible, real <h1> above the normal app shell for city/region SEO pages —
// AppShell's own "MANIFESTO" title is a <p>, not a heading, and looks
// identical on every page, so without this a visitor landing here from a
// Google search for e.g. "queer events Manchester" would see nothing on
// the page itself confirming they're on the Manchester-specific view.
export default function PlaceBanner({ heading }: PlaceBannerProps) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-200 px-8 py-2 font-jbmono text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <h1 className="normal-case tracking-normal text-sm text-black dark:text-white">{heading}</h1>
      <span aria-hidden>·</span>
      <Link href="/events" className="underline underline-offset-4 hover:text-black dark:hover:text-white">
        All cities &amp; regions
      </Link>
    </div>
  );
}
