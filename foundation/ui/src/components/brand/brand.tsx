import styles from "./brand.module.css";

/** Merit's mark and wordmark; the containing link owns navigation and its accessible name. */
export const Brand = () => (
  <span className={styles.brand}>
    <svg className={styles.mark} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M41 19C51.23 19 72 42.45 72 54S51.23 89 41 89S10 65.55 10 54S30.77 19 41 19ZM59 11C69.23 11 90 34.45 90 46S69.23 81 59 81S28 57.55 28 46S48.77 11 59 11Z"
      />
    </svg>
    <span>merit</span>
  </span>
);
