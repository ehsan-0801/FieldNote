"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * After a client-side navigation, moves focus to the main region so keyboard and
 * screen-reader users start at the new page's content instead of the old position.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
