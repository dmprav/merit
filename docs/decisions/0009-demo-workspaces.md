# Run the demo in isolated, disposable product workspaces

Accepted 11 November 2026.

Run the public demo through ordinary product screens, authorized business
operations, and database records. Give each visitor an isolated workspace with
fictional data and a bounded lifetime.

The earlier browser-local demo maintained separate state and persistence behavior.
That avoided backend provisioning, but product changes also required keeping the
simulation consistent. Using the ordinary application lets visitors exercise its
actual behavior and lets product improvements reach the demo through the same
implementation.

This choice adds operating responsibilities: anonymous identity, workspace
provisioning, access isolation, abuse limits, expiry, and cleanup. Isolation lets
visitors change their own examples without affecting others; disposal bounds the
lifetime of that experimental work. External effects remain subject to the owning
capability's policy.

Reconsider the approach if operating the demo becomes disproportionately costly.
Evaluate alternatives against both the cost of maintaining separate behavior and
how faithfully visitors can experience the product. The
[demo workflow](../workflows/public-demo-and-access.md) owns progress, reset,
account transitions, and the current lifetime.
