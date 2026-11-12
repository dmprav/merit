import { withDatabase } from "@merit/db";
import { seedExampleRounds } from "@merit/grantmaking/testing";

const [clerkUserId] = process.argv.slice(2);
const connectionString = process.env.DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname)) {
  throw new Error("Example seeding is limited to a local database.");
}
if (clerkUserId && !/^user_[a-zA-Z0-9]+$/.test(clerkUserId)) {
  throw new Error("Expected a Clerk development user ID, starting with user_.");
}
await withDatabase(connectionString, (db) => seedExampleRounds(db, clerkUserId));
console.log("Local example organizations seeded.");
