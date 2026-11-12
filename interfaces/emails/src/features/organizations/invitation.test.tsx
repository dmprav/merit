import { render, toPlainText } from "react-email";
import { expect, it } from "vite-plus/test";

import { createMessages, defaultLocale, ServerMessagesProvider } from "@merit/i18n/server";

import { InvitationEmail } from "./invitation";
import { invitationFixtures } from "./invitation.fixtures";
import { en } from "./messages.en";
import { renderInvitationEmail } from "./render-invitation";

it.each(Object.entries(invitationFixtures))(
  "renders the %s invitation in HTML and plain text",
  async (_name, message) => {
    const { subject, html, text } = await renderInvitationEmail(message, defaultLocale);

    expect(subject).toBe(`Join ${message.organizationName} on Merit`);
    expect(html).toMatch(/<html[^>]*lang="en"/);
    expect(html).toMatch(/<html[^>]*dir="ltr"/);
    expect(html).toContain(`href="${message.url}"`);
    expect(text.replace(/\s+/g, " ").toLowerCase()).toContain(
      message.organizationName.toLowerCase(),
    );
    expect(text).toContain(message.to);
    expect(text).toContain(message.url);
    expect(text).toContain("16 November 2026");
    expect(text).toContain("12:00 UTC");
    expect(text).toContain("If you were not expecting this invitation");
    expect(text).not.toContain("<table");
  },
);

it("describes administration independently of grant access", async () => {
  const admin = await renderInvitationEmail(invitationFixtures.administrator, defaultLocale);

  expect(admin.text).toContain("Organization administrator");
  expect(admin.text).toContain("No grant-work access");
  expect(admin.text).not.toContain("Program manager");

  const manager = await renderInvitationEmail(invitationFixtures.programManager, defaultLocale);

  expect(manager.text).toContain("No organization administration");
  expect(manager.text).toContain("Program manager (access to grant work)");
});

it("escapes user content and preserves invitation URLs", async () => {
  const organizationName = '<Alder & Co><img src="x">';
  const url = `${invitationFixtures.owner.url}?one=1&two=2`;
  const { html, text } = await renderInvitationEmail(
    {
      ...invitationFixtures.owner,
      organizationName,
      url,
    },
    defaultLocale,
  );

  expect(html).toContain("&lt;Alder &amp; Co&gt;&lt;img");
  expect(html).not.toContain('<img src="x"');
  expect(html).toContain("one=1&amp;two=2");
  expect(text.toLowerCase()).toContain(organizationName.toLowerCase());
  expect(text).toContain(url);
});

it("uses the supplied regional format independently for concurrent renders", async () => {
  const [british, american] = await Promise.all([
    renderInvitationEmail(invitationFixtures.owner, defaultLocale),
    renderInvitationEmail(invitationFixtures.owner, { ...defaultLocale, formatLocale: "en-US" }),
  ]);

  expect(british.text).toContain("16 November 2026");
  expect(british.text).toContain("12:00 UTC");
  expect(american.text).toContain("November 16, 2026");
  expect(american.text).toContain("12:00 PM UTC");
  expect(american.subject).toBe(british.subject);
});

it("renders catalog overrides and preserves escaped recipient emphasis", async () => {
  const recipient = '<img src="x">@example.test';
  const html = await render(
    <ServerMessagesProvider
      instance={createMessages({
        invitationEmail: {
          ...en,
          title: "Catalog title {{organizationName}}",
          recipient: "For <recipient>{{email}}</recipient>, translated.",
          review: "Catalog review",
        },
      })}
      locale={defaultLocale}
    >
      <InvitationEmail {...invitationFixtures.owner} to={recipient} />
    </ServerMessagesProvider>,
  );
  const text = toPlainText(html);

  expect(text).toContain("CATALOG TITLE ALDER FOUNDATION");
  expect(text).toContain("Catalog review");
  expect(html).toContain('<strong style="font-weight:600">');
  expect(html).toContain("&lt;img");
  expect(html).not.toContain('<img src="x"');
  expect(text).toContain("translated.");
});
