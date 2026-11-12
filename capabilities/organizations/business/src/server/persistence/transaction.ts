import type { Database } from "@merit/db";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
