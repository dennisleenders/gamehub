import { useCallback, useEffect, useState } from "react";

// Reveal a long list incrementally to keep first paint cheap: render the first
// `step` items, then expand by another `step` as the bottom sentinel nears the
// viewport. `resetKey` snaps back to the first page when it changes (e.g. a
// filter/sort/search edit) — pass a STABLE value (a string of the filters, not
// the array), so a background re-render that produces a fresh array reference
// can't keep resetting the page count.
//
// The sentinel is a CALLBACK ref backed by state, not a useRef. That matters
// when the list lives inside an always-mounted parent (e.g. the collection tab
// of a multi-view screen): a plain ref + effect can run while the sentinel is
// still unmounted and then never re-run when it appears, so nothing ever
// attaches. Keying the observer effect on the node fixes that, and also
// re-observes after each growth so a sentinel that's still in view keeps the
// pages coming.
export function useLazyList<T>(total: number, resetKey: T, step = 20) {
  const [count, setCount] = useState(step);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const sentinel = useCallback((n: HTMLDivElement | null) => setNode(n), []);

  useEffect(() => { setCount(step); }, [resetKey, step]);

  useEffect(() => {
    if (!node || count >= total) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setCount((c) => Math.min(total, c + step));
    }, { rootMargin: "800px 0px" });
    io.observe(node);
    return () => io.disconnect();
  }, [node, count, total, step]);

  return { count: Math.min(count, total), sentinel, hasMore: count < total };
}
