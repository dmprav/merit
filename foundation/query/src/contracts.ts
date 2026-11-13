export type PageSource<T> = {
  queryKey: readonly unknown[];
  /** Return null for denied or missing resources; throw for a retryable read failure. */
  read: (
    after: string | undefined,
    signal: AbortSignal,
  ) => Promise<{ entries: T[]; nextCursor: string | null } | null>;
};
