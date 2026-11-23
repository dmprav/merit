const inFlight = new Map<string, { attempt: string; controller: AbortController }>();

export const beginModelRequest = (chat: string, attempt: string) => {
  inFlight.get(chat)?.controller.abort();
  const controller = new AbortController();
  inFlight.set(chat, { attempt, controller });
  return controller.signal;
};

export const endModelRequest = (chat: string, attempt?: string) => {
  const request = inFlight.get(chat);
  if (request && (attempt === undefined || request.attempt === attempt)) {
    request.controller.abort();
    inFlight.delete(chat);
  }
};
