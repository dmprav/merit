# Keep a reusable business core

Accepted 7 November 2026.

Keep domain logic independent of interface frameworks, protocols, and persistence
details. Web and MCP use shared application operations that coordinate access,
business rules, and persistence.

Merit may develop complex domain logic. These boundaries protect that logic from
unnecessary complexity and make it reusable across different ways of using the
product. A future public API should be able to reuse the same business behavior.

Adding an interface should primarily require an adapter. Keep business rules in
their owning capability so each interface benefits from the same implementation.
