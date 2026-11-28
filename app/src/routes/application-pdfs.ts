import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/application-pdfs/$workspaceSlug")({
  server: {
    handlers: {
      GET: ({ context, params, request }) => context.applicationPdfs(request, params.workspaceSlug),
      POST: ({ context, params, request }) =>
        context.applicationPdfs(request, params.workspaceSlug),
    },
  },
});
