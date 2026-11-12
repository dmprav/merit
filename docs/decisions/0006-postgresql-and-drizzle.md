# Use PostgreSQL and Drizzle for persistence

Accepted 7 November 2026.

Use PostgreSQL for application data. Its transactions fit workflows that check
permissions, versions, and remaining budget, then commit a business change and
its audit record together.

Prefer Drizzle over Prisma for SQL-oriented access and control over queries and
transactions as workflows become more complex. Keep business rules independent
of the persistence library.
