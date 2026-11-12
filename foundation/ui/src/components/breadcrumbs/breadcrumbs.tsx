import { Children, type ReactNode } from "react";

import styles from "./breadcrumbs.module.css";

/** Supply parent links in hierarchy order, followed by a non-link current-page label. */
export const Breadcrumbs = ({ label, items }: { label: string; items: readonly ReactNode[] }) => {
  const crumbs = Children.toArray(items);
  if (!crumbs.length) {
    return null;
  }

  return (
    <nav aria-label={label} className={styles.breadcrumbs}>
      <ol className={styles.list} role="list">
        {crumbs.map((item, index) => (
          <li key={index} className={styles.item}>
            {index > 0 && (
              <span aria-hidden="true" className={styles.separator}>
                /
              </span>
            )}
            {index === crumbs.length - 1 ? <span aria-current="page">{item}</span> : item}
          </li>
        ))}
      </ol>
    </nav>
  );
};
