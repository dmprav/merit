import { useLayoutEffect, useRef } from "react";

/** How close to the end counts as reading the latest text. */
const nearEnd = 24;

const scrollerOf = (element: HTMLElement) => {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
      return parent;
    }
  }
  return null;
};

const scrollToEnd = (scroller: HTMLElement) => {
  scroller.scrollTop = scroller.scrollHeight;
};

/**
 * Keeps a growing thread scrolled to its end while the person is reading the end, and leaves it
 * where they scrolled to once they move up. Whatever makes the thread taller follows, whether
 * words streaming in or notices and suggestions that appear when a run settles. Asking a new
 * question follows again; pass a key that changes with each question.
 */
export const useFollowEnd = (questionKey: string | undefined) => {
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useLayoutEffect(() => {
    const element = content.current;
    const scroller = element && scrollerOf(element);
    if (!element || !scroller) {
      return;
    }

    const toEnd = () => {
      if (following.current) {
        scrollToEnd(scroller);
      }
    };

    let previousTop = scroller.scrollTop;

    // Only moving up leaves the end: text arriving while a scroll is still settling only makes
    // the thread taller, and must not read as the person scrolling away.
    const track = () => {
      const { scrollHeight, scrollTop, clientHeight } = scroller;
      const movedUp = scrollTop < previousTop;
      previousTop = scrollTop;
      if (scrollHeight - scrollTop - clientHeight <= nearEnd) {
        following.current = true;
      } else if (movedUp) {
        following.current = false;
      }
    };

    scroller.addEventListener("scroll", track, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(toEnd);
    observer?.observe(element);
    toEnd();
    return () => {
      scroller.removeEventListener("scroll", track);
      observer?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const element = content.current;
    const scroller = element && scrollerOf(element);
    following.current = true;
    if (scroller) {
      scrollToEnd(scroller);
    }
  }, [questionKey]);

  return content;
};
