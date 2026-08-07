"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/browser";

// Same auth-subscription shape as Sidebar.tsx's inline `user` state — kept
// as a separate copy rather than a shared refactor of Sidebar (which owns
// several other auth-flow concerns) so AppShell's main content, a sibling
// of Sidebar rather than a child, can know the signed-in state too for the
// favourite-toggle affordances on cards/list rows/map popups.
export function useUser(): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    try {
      const supabase = createBrowserClient();
      supabase.auth.getUser().then(({ data }) => setUser(data.user));
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_, session) => {
        setUser(session?.user ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch {
      // NEXT_PUBLIC_SUPABASE_* not set — treated as signed-out
    }
    return () => unsubscribe?.();
  }, []);

  return user;
}
