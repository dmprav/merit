import type { Actor } from "@merit/auth";
import type { DatabaseRunner } from "@merit/db";

import type { FileObjects } from "../api/files";
import { writeFile } from "./commands/write-file";
import { readFile } from "./queries/read-file";

export const createFileService = (database: DatabaseRunner, objects: FileObjects) => ({
  writeFile: (actor: Actor, input: Parameters<typeof writeFile>[3]) =>
    database((db) => writeFile(db, objects, actor, input)),
  readFile: (actor: Actor, input: Parameters<typeof readFile>[3]) =>
    database((db) => readFile(db, objects, actor, input)),
});
