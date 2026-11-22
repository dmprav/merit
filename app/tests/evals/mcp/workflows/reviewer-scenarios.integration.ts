import { expect } from "vite-plus/test";

import { catalogTest } from "../catalog-trial";

catalogTest("grades the assigned material and criterion independently", async ({ catalog }) => {
  const { grade, scripted } = await catalog("assigned-evidence");
  const confirmation = await scripted();
  expect((await grade(confirmation)).reply.status).toBe("partial");
  // A description of the original material and criterion can omit numerical versions.
  expect(
    (
      await grade(
        "The assigned criterion was Neighbourhood benefit. The application requests €80 for weekly community activities.",
      )
    ).reply.status,
  ).toBe("partial");
  for (const reply of [
    confirmation.replace("8000 cents", "€150"),
    confirmation.replace("Criteria version 2", "Criteria version 3"),
    confirmation.replace("material is version 1", "material is version 2"),
    confirmation.replace("Neighbourhood benefit", "Project sustainability"),
  ]) {
    expect((await grade(reply)).reply.status).toBe("failed");
  }
});
