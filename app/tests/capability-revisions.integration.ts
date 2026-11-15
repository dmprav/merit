import { expect } from "vite-plus/test";

import { databaseTest as it } from "@merit/test-support/database";

it("stores capability revisions independently and removes review state with its application", async ({
  database,
}) => {
  await database.client.query(
    "INSERT INTO organizations (id,name,slug) VALUES ('alder','Alder','alder')",
  );
  await database.client.query("BEGIN");
  await database.client.query(
    "INSERT INTO funding_rounds (id,organization_id,manager_name,title,purpose,snapshot_date,decision_status,criteria_version) VALUES ('round-1','alder','Dana','Round','Purpose','2026-11-01','open',1)",
  );
  await database.client.query(
    "INSERT INTO criteria_versions (round_id,version,criteria) VALUES ('round-1',1,'[]')",
  );
  await database.client.query(
    "INSERT INTO application_cases (id,organization_id,round_id,position,material_version,intake_status,revision) VALUES ('reviewed','alder','round-1',0,1,'ready',3),('empty','alder','round-1',1,1,'in_preparation',0)",
  );
  await database.client.query(
    "INSERT INTO material_versions (case_id,version,content,change_kind,source) VALUES ('reviewed',1,'{}','initial','{\"interface\":\"web\"}'),('empty',1,'{}','initial','{\"interface\":\"web\"}')",
  );
  await database.client.query("COMMIT");
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
