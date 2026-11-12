import { expect } from "vite-plus/test";

import { databaseTest as it } from "@merit/test-support/database";

it("stores capability revisions independently and removes review state with its application", async ({
  database,
}) => {
  await database.client.query(
    "INSERT INTO organizations (id,name,slug) VALUES ('alder','Alder','alder')",
  );
  await database.client.query(
    "INSERT INTO application_cases (id,organization_id,intake_status,revision) VALUES ('reviewed','alder','ready',3),('empty','alder','in_preparation',0)",
  );
  await database.client.query(
    "INSERT INTO review_states (case_id,revision) VALUES ('reviewed',7),('empty',0)",
  );
  await database.client.query(
    "INSERT INTO recommendation_versions (case_id,revision,content) VALUES ('reviewed',1,'{\"reasoning\":\"First\"}'),('reviewed',2,'{\"reasoning\":\"Second\"}')",
  );
  const history = (
    await database.client.query("SELECT * FROM recommendation_versions ORDER BY revision")
  ).rows;

  await database.client.query("UPDATE review_states SET revision=8 WHERE case_id='reviewed'");

  expect(
    (await database.client.query("SELECT * FROM review_states ORDER BY case_id")).rows,
  ).toEqual([
    { case_id: "empty", revision: 0 },
    { case_id: "reviewed", revision: 8 },
  ]);
  expect(
    (await database.client.query("SELECT * FROM recommendation_versions ORDER BY revision")).rows,
  ).toEqual(history);
  expect(
    (await database.client.query("SELECT revision FROM application_cases WHERE id='reviewed'"))
      .rows,
  ).toEqual([{ revision: 3 }]);
  await expect(
    database.client.query("UPDATE review_states SET revision=-1 WHERE case_id='reviewed'"),
  ).rejects.toThrow("review_states_revision_check");

  await database.client.query("DELETE FROM application_cases WHERE id='empty'");

  expect(
    (await database.client.query("SELECT * FROM review_states WHERE case_id='empty'")).rows,
  ).toEqual([]);
});
