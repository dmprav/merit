# Run Merit on Node.js

Accepted 7 November 2026. Revised 26 November 2026.

Use Vite on Node.js for development and local preview of the application build.
The public site, product, admin interface, and MCP share one origin. Package the
built TanStack server and Temporal worker in one Node.js image with independent
entry points. On a single Docker host, nginx switches traffic after the incoming
web and worker are ready. The [deployment guide](../guides/deployment.md) covers
the release procedure and local rehearsal.

Document processing may require native tools, filesystem access, or longer-running
work. Developing on Node.js lets Merit evaluate those tools with representative
grant material before choosing how to run them in production. The application
continues to use PostgreSQL for transactional grant work.
