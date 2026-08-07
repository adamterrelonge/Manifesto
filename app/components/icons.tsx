// Hand-built sidebar icons, styled to match the lucide-react icons they
// replace (24x24 viewBox, round stroke caps/joins, currentColor) — but
// broken into individually-animatable parts (<g> groups) so each can get
// its own bespoke group-hover keyframe animation (see globals.css). A
// stock icon library can't do part-level animation like this without
// significant wrapping, so these are recreated from scratch instead.

import type { SVGProps } from "react";

const BASE_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  // Every one of these is purely decorative (paired with visible text or
  // redundant with a link/button's own accessible name) — defaulting to
  // hidden here means a call site has to opt back in, not remember to opt
  // out, which is the mistake that left GappedArrowIcon unhidden in
  // EventsListView.tsx while every other usage set it explicitly.
  "aria-hidden": true,
};

const FILL_BOX_CENTER = { transformBox: "fill-box", transformOrigin: "center" } as const;

export function FilterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <line
        x1="4" y1="6" x2="20" y2="6"
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-filter-sift_0.5s_ease-in-out]"
      />
      <line
        x1="7" y1="12" x2="17" y2="12"
        style={{ ...FILL_BOX_CENTER, animationDelay: "0.06s" }}
        className="group-hover:[animation:sidebar-filter-sift_0.5s_ease-in-out]"
      />
      <line
        x1="10" y1="18" x2="14" y2="18"
        style={{ ...FILL_BOX_CENTER, animationDelay: "0.12s" }}
        className="group-hover:[animation:sidebar-filter-sift_0.5s_ease-in-out]"
      />
    </svg>
  );
}

export function ConnectionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <g
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-conn-right_0.5s_ease-in-out]"
      >
        <path d="M21 20v-1.5a4 4 0 0 0-2.7-3.78" />
        <path d="M15 4.14a4 4 0 0 1 0 7.72" />
      </g>
      {/* Front person: fully drawn, on top */}
      <g
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-conn-left_0.5s_ease-in-out]"
      >
        <circle cx="9.5" cy="8" r="3.6" />
        <path d="M3.5 20v-1.5c0-2.9 2.7-5.2 6-5.2s6 2.3 6 5.2V20" />
      </g>
    </svg>
  );
}

export function FavouritesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      {/* 
        Lucide-compatible, hand-verified symmetric heart.
        Left Lobe:  (12, 5.25) -> (2, 9.1) -> (12, 21.35)
        Right Lobe: (12, 21.35) -> (22, 9.1) -> (12, 5.25)
        Exact mirror symmetry along x = 12 with no seam overlap.
      */}
      <path
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-heart-beat_0.5s_ease-in-out]"
      />
    </svg>
  );
}

export function NotificationsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <g
        style={{ transformBox: "fill-box", transformOrigin: "top center" }}
        className="group-hover:[animation:sidebar-bell-jiggle_0.5s_ease-in-out]"
      >
        <path d="M6 8.5a6 6 0 0 1 12 0c0 4.8 1.8 6 1.8 6H4.2S6 13.3 6 8.5" />
        <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
      </g>
    </svg>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <g
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-gear-spin_0.5s_ease-in-out]"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </g>
    </svg>
  );
}

export function ShuffleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <g
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-dice-roll_0.5s_ease-in-out]"
      >
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="8" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="8" cy="16" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="16" r="1.1" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function PriceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <g
        style={{ transformBox: "fill-box", transformOrigin: "7px 7px" }}
        className="group-hover:[animation:sidebar-tag-swing_0.5s_ease-in-out]"
      >
        <path d="M3 3h8l10 10-8 8L3 11V3Z" />
        <circle cx="7" cy="7" r="1.3" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function CategoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <rect
        x="3" y="3" width="7" height="7" rx="1.5"
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-grid-pop_0.5s_ease-in-out]"
      />
      <rect
        x="14" y="3" width="7" height="7" rx="1.5"
        style={{ ...FILL_BOX_CENTER, animationDelay: "0.06s" }}
        className="group-hover:[animation:sidebar-grid-pop_0.5s_ease-in-out]"
      />
      <rect
        x="3" y="14" width="7" height="7" rx="1.5"
        style={{ ...FILL_BOX_CENTER, animationDelay: "0.12s" }}
        className="group-hover:[animation:sidebar-grid-pop_0.5s_ease-in-out]"
      />
      <rect
        x="14" y="14" width="7" height="7" rx="1.5"
        style={{ ...FILL_BOX_CENTER, animationDelay: "0.18s" }}
        className="group-hover:[animation:sidebar-grid-pop_0.5s_ease-in-out]"
      />
    </svg>
  );
}

export function CommunityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <g style={FILL_BOX_CENTER}>
        {/* Stationary outer ring & equator line */}
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />

        {/* 
          Rotating longitude curves: 
          Applying scaleX + transform-origin: center gives a realistic 3D globe rotation 
        */}
        <path
          d="M12 3c2.5 2.5 4 5.8 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.8-4-9s1.5-6.5 4-9Z"
          className="origin-center group-hover:[animation:globe-spin-3d_0.8s_ease-in-out]"
        />
      </g>
    </svg>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <rect
        x="7" y="13" width="4" height="4" rx="0.5"
        fill="currentColor"
        stroke="none"
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-grid-pop_0.5s_ease-in-out]"
      />
    </svg>
  );
}

export function LocationPinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <g
        style={{ transformBox: "fill-box", transformOrigin: "bottom center" }}
        className="group-hover:[animation:sidebar-pin-bounce_0.5s_ease-in-out]"
      >
        <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.3" />
      </g>
    </svg>
  );
}

export function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path
        d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10"
        style={{ transformBox: "fill-box", transformOrigin: "bottom center" }}
        className="group-hover:[animation:sidebar-pin-bounce_0.5s_ease-in-out]"
      />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path
        d="M4 7l8 6 8-6"
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-grid-pop_0.5s_ease-in-out]"
      />
    </svg>
  );
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path
        d="M9 3.5h6a1 1 0 0 1 1 1V7H8V4.5a1 1 0 0 1 1-1Z"
        style={{ transformBox: "fill-box", transformOrigin: "bottom center" }}
        className="group-hover:[animation:sidebar-pin-bounce_0.5s_ease-in-out]"
      />
    </svg>
  );
}

export function GappedArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE_PROPS} strokeWidth={2} strokeLinecap="round" {...props}>
      {/* Horizontal line at top-left — pulls up/left, away from the corner */}
      <line
        x1="10" y1="4" x2="18" y2="4"
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-arrow-top_0.5s_ease-in-out]"
      />

      {/* Vertical line at far right — pulls right/down, away from the corner */}
      <line
        x1="22" y1="8" x2="22" y2="16"
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-arrow-side_0.5s_ease-in-out]"
      />

      {/* Main diagonal arrow shaft — pulls down/left, away from the head */}
      <line
        x1="18" y1="8" x2="8" y2="18"
        style={FILL_BOX_CENTER}
        className="group-hover:[animation:sidebar-arrow-shaft_0.5s_ease-in-out]"
      />
    </svg>
  );
}
