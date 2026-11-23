import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/assistant/$workspaceSlug")({
  server: {
    handlers: {
      POST: ({ context, params, request }) => context.assistant(request, params.workspaceSlug),
    },
  },
});
