import { useEffect, useRef, useState } from "react";

import type { DocsPage } from "./docs-navigation";

export const useActiveDocSection = (page: DocsPage) => {
  const articleRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) {
      return;
    }
    const headings = Array.from(article.querySelectorAll<HTMLHeadingElement>("section > h2"));
    const first = headings[0];
    if (!first) {
      return;
    }

    const hashHeading = () => headings.find((heading) => `#${heading.id}` === window.location.hash);

    const update = () => {
      // A guide that fits the viewport has no scroll position to distinguish its sections.
      if (document.documentElement.scrollHeight <= window.innerHeight + 1) {
        setActiveSection(hashHeading()?.id ?? first.id);
        return;
      }

      const readingLine = parseFloat(getComputedStyle(first).scrollMarginTop) + 1;
      const atBottom =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
      const target = hashHeading();
      // Short pages can reach the bottom before the selected heading reaches the reading line.
      if (
        atBottom &&
        target === document.activeElement &&
        target.getBoundingClientRect().top > readingLine
      ) {
        setActiveSection(target.id);
        return;
      }
      const current = atBottom
        ? headings.at(-1)
        : (headings.findLast((heading) => heading.getBoundingClientRect().top <= readingLine) ??
          headings[0]);
      setActiveSection(current?.id ?? null);
    };

    const followHash = () => {
      const heading = hashHeading();
      if (heading) {
        setActiveSection(heading.id);
      }
    };

    update();
    followHash();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("hashchange", followHash);
    const observer = new ResizeObserver(update);
    observer.observe(article);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("hashchange", followHash);
      observer.disconnect();
    };
  }, [page]);

  return { articleRef, activeSection, setActiveSection };
};
