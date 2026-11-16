import { z } from "zod";

/** Public record identifier produced by the `merit_public_id()` database default. */
export const publicIdSchema = z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/);
