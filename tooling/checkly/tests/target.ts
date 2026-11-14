export const resolveTargetBaseUrl = (
  value: string | undefined = process.env.MERIT_BASE_URL,
): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      "MERIT_BASE_URL must be set to the target Merit origin (for example https://merit.example).",
    );
  }

  const parsed = URL.parse(trimmed);
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
    throw new Error(`MERIT_BASE_URL must be an http(s) URL; received ${JSON.stringify(trimmed)}.`);
  }

  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
};
