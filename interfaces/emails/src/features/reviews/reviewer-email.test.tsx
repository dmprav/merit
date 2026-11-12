import { expect, it } from "vite-plus/test";

import { renderReviewerEmail } from "./reviewer-email";

it.each(["invitation", "submission"] as const)(
  "renders a %s with escaped content and a working plain-text destination",
  async (kind) => {
    const message = {
      kind,
      id: "message",
      to: "sam@example.test",
      organization: "Alder",
      title: '<Application & Co><img src="x">',
      applicant: "Community group",
      reviewer: "Sam",
      manager: "Dana",
      managerEmail: "dana@example.test",
      dueDate: "2026-12-01",
      url: "https://merit.test/reviews/assignment?one=1&two=2",
    };
    const { subject, text, html } = await renderReviewerEmail(message);
    expect(subject).toContain(message.title);
    expect(html).toContain("&lt;Application &amp; Co&gt;");
    expect(html).not.toContain('<img src="x"');
    expect(text).toContain(message.url);
    expect(text).toContain(kind === "invitation" ? "sam@example.test" : "Sam");
    expect(text).not.toContain("<table");
  },
);
