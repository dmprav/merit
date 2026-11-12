// jsdom component tests drive whole views through user-event. On the 4-vCPU CI runner,
// where package suites run in parallel, they take about three times as long as locally:
// a journey that takes 1.7 s locally took 5.1–5.3 s on CI, past Vitest's 5 s default.
export const componentTestTimeout = 15_000;
