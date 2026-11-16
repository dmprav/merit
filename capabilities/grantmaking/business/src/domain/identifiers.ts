import { z } from "zod";

export const publicIdSchema = z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/);
