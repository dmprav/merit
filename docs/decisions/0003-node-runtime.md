# Run Merit on Node.js

Accepted 7 November 2026. Revised 18 November 2026.

Use Vite on Node.js for development and local preview of the application build.
The public site, product, admin interface, and MCP share one origin. Choose the
production HTTP server and hosting provider when Merit is ready to deploy.

Document processing may require native tools, filesystem access, or longer-running
work. Developing on Node.js lets Merit evaluate those tools with representative
grant material before choosing how to run them in production. The application
continues to use PostgreSQL for transactional grant work.
