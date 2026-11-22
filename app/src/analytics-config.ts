const readEnvString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const readAnalyticsConfig = () => ({
  apiKey: readEnvString(import.meta.env.VITE_POSTHOG_KEY),
  host: readEnvString(import.meta.env.VITE_POSTHOG_HOST),
});
