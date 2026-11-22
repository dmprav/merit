import { useLayoutEffect, useRef, type UIEvent } from "react";

/** How close to the end counts as reading the latest text. */
const nearEnd = 24;

/**
 * Keeps a growing thread scrolled to its end while the person is reading the end, and leaves it
 * where they scrolled to once they move up. Sending a question follows again.
 */
export const useFollowEnd = (content: unknown) => {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && following.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [content]);

  return {
    scroller,
    onScroll: (event: UIEvent<HTMLElement>) => {
      const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
      following.current = scrollHeight - scrollTop - clientHeight <= nearEnd;
    },
    follow: () => {
      following.current = true;
    },
  };
};
