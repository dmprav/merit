import { env } from "cloudflare:workers";

import { createRequestDatabase as connectRequestDatabase } from "@merit/db";

export const createRequestDatabase = () => connectRequestDatabase(env.HYPERDRIVE.connectionString);
