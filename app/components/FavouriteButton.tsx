"use client";

import { useEffect, useState } from "react";
import { FavouritesIcon } from "@/app/components/icons";

interface FavouriteButtonProps {
  favourited: boolean;
  onToggle: () => void;
  label: string;
  itemName: string;
  className?: string;
}

const BURST_PARTICLE_ANGLES = [0, 60, 120, 180, 240, 300];
const BURST_DURATION_MS = 550;
const PILL_VISIBLE_MS = 1800;
const PILL_OUT_DURATION_MS = 350;

// Heart toggle reused on event cards and list rows (favourites scope,
// docs/PROJECT_PLAN.md Phase 5) — not map popups, which build their own
// hearts with raw DOM APIs since a MapLibre Popup isn't a React tree.
// Cards/rows wrap the whole item in an <a> to the source URL, so clicks
// here must not bubble into that link.
//
// Favouriting (never un-favouriting) plays a burst animation on the heart
// and extends a "{itemName} favourited" pill to the right, self-contained
// so every call site gets it for free.
export default function FavouriteButton({
  favourited,
  onToggle,
  label,
  itemName,
  className,
}: FavouriteButtonProps) {
  const [bursting, setBursting] = useState(false);
  const [pillPhase, setPillPhase] = useState<"in" | "out" | null>(null);

  useEffect(() => {
    if (!bursting) return;
    const timer = setTimeout(() => setBursting(false), BURST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [bursting]);

  useEffect(() => {
    if (pillPhase !== "in") return;
    const timer = setTimeout(() => setPillPhase("out"), PILL_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [pillPhase]);

  useEffect(() => {
    if (pillPhase !== "out") return;
    const timer = setTimeout(() => setPillPhase(null), PILL_OUT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pillPhase]);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const willFavourite = !favourited;
    onToggle();
    if (willFavourite) {
      setBursting(true);
      setPillPhase("in");
    } else {
      setBursting(false);
      setPillPhase(null);
    }
  }

  return (
    <span className={`relative inline-flex ${className ?? "h-5 w-5 text-white drop-shadow"}`}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={favourited}
        onClick={handleClick}
        className="h-full w-full"
      >
        <FavouritesIcon
          className={`h-full w-full ${bursting ? "animate-fav-heart-pop" : ""}`}
          fill={favourited ? "currentColor" : "none"}
        />
      </button>

      {bursting && (
        <span aria-hidden className="pointer-events-none absolute inset-0 text-rose-500">
          <span className="absolute inset-0 rounded-full bg-current animate-fav-burst-ring" />
          {BURST_PARTICLE_ANGLES.map((angle) => (
            <span
              key={angle}
              className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-current animate-fav-burst-particle"
              style={{ "--fav-particle-angle": `${angle}deg` } as React.CSSProperties}
            />
          ))}
        </span>
      )}

      {pillPhase && (
        <span
          role="status"
          className={`pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#1f271a] px-3 py-1 text-xs font-medium text-white shadow-md dark:bg-white dark:text-[#1f271a] ${
            pillPhase === "in" ? "animate-fav-pill-in" : "animate-fav-pill-out"
          }`}
        >
          {itemName} favourited
        </span>
      )}
    </span>
  );
}
