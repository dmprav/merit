/** Shared by every feature that sends work to the configured OpenAI model. */
export const openAiProvider = "OpenAI";

const timeoutMs = 90_000;

const replyLimit = 1_048_576;

const readReply = async (response: Response): Promise<unknown> => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Provider returned no response body.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) {
      break;
    }
    size += part.value.byteLength;
    if (size > replyLimit) {
      await reader.cancel();
      throw new Error("Provider response exceeded its limit.");
    }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

/** One Chat Completions call, abandoned after 90 s and never following redirects. The body is already shaped by the caller. */
export const requestChatCompletion = async (
  config: { apiKey: string; model: string },
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> => {
  if (!config.apiKey || !config.model) {
    throw new Error("Provider is unavailable.");
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, store: false, ...body }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Provider request failed.");
  }
  return readReply(response);
};
