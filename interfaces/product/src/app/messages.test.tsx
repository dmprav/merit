import { render, screen, fireEvent, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useTranslation } from "react-i18next";
import { describe, expect, it, vi } from "vite-plus/test";

import { createMessages, defaultLocale, MessagesProvider, useLocaleSettings } from "@merit/i18n";
import { Calendar } from "@merit/ui/calendar";

import { WebMessagesProvider, webMessages } from "./messages";

describe("messages", () => {
  it("honors an explicit common catalog without changing another provider's defaults", () => {
    const Example = () => {
      const { t } = useTranslation("common");
      return <p>{t("validation.email")}</p>;
    };

    render(
      <>
        <MessagesProvider messages={{ common: { validation: { email: "Translated email" } } }}>
          <Example />
        </MessagesProvider>
        <MessagesProvider messages={{}}>
          <Example />
        </MessagesProvider>
      </>,
    );

    expect(screen.getByText("Translated email")).toBeVisible();
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
  });

  it("renders translated labels on the server and escapes interpolated content", () => {
    const Example = () => {
      const { t } = useTranslation(["fundingRounds", "common"]);
      return (
        <button aria-label={t("editor.openFor", { title: "<em>Application</em>" })}>
          {t("common:cancel")}
        </button>
      );
    };

    const html = renderToString(
      <WebMessagesProvider>
        <Example />
      </WebMessagesProvider>,
    );

    expect(html).toContain('aria-label="Edit recommendation for &lt;em&gt;Application&lt;/em&gt;"');
    expect(html).toContain(">Cancel</button>");
  });

  it("inherits locale settings through nested catalogs while keeping sibling providers isolated", () => {
    const Example = () => {
      const { t } = useTranslation("common");
      const locale = useLocaleSettings();
      return <p>{`${locale.language}, ${locale.formatLocale}: ${t("cancel")}`}</p>;
    };

    render(
      <>
        <MessagesProvider messages={{}} locale={{ ...defaultLocale, formatLocale: "en-US" }}>
          <MessagesProvider messages={{ common: { cancel: "Nested cancel" } }}>
            <Example />
          </MessagesProvider>
        </MessagesProvider>
        <MessagesProvider messages={{}}>
          <Example />
        </MessagesProvider>
      </>,
    );

    expect(screen.getByText("en, en-US: Nested cancel")).toBeVisible();
    expect(screen.getByText("en, en-GB: Cancel")).toBeVisible();
  });

  it("uses the inherited regional format for calendar controls", () => {
    render(
      <MessagesProvider messages={{}} locale={{ ...defaultLocale, formatLocale: "en-GB" }}>
        <WebMessagesProvider>
          <section aria-label="British calendar">
            <Calendar label="Choose date" value="2027-01-21" onChange={vi.fn()} />
          </section>
        </WebMessagesProvider>
        <MessagesProvider messages={{}} locale={{ ...defaultLocale, formatLocale: "en-US" }}>
          <section aria-label="American calendar">
            <Calendar label="Choose date" value="2027-01-21" onChange={vi.fn()} />
          </section>
        </MessagesProvider>
      </MessagesProvider>,
    );

    expect(
      within(screen.getByRole("region", { name: "British calendar" })).getByRole("button", {
        name: "Friday, 22 January 2027",
      }),
    ).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "American calendar" })).getByRole("button", {
        name: "Friday, January 22, 2027",
      }),
    ).toBeVisible();
  });

  it("updates changed catalogs and regional formats without remounting unfinished work", () => {
    const Example = () => {
      const { t } = useTranslation("fundingRounds");
      const { formatLocale } = useLocaleSettings();

      return (
        <>
          <p>{t("evidence.version")}</p>
          <p>{new Intl.NumberFormat(formatLocale).format(1234.5)}</p>
          <input aria-label="Draft" defaultValue="" />
        </>
      );
    };

    const { rerender } = render(
      <MessagesProvider messages={webMessages}>
        <Example />
      </MessagesProvider>,
    );
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unfinished work" } });
    expect(screen.getByText("1,234.5")).toBeVisible();
    rerender(
      <MessagesProvider
        locale={{ ...defaultLocale, formatLocale: "de-DE" }}
        messages={{
          ...webMessages,
          fundingRounds: {
            ...webMessages.fundingRounds,
            evidence: { ...webMessages.fundingRounds.evidence, version: "Submission version" },
          },
        }}
      >
        <Example />
      </MessagesProvider>,
    );

    expect(screen.getByText("Submission version")).toBeVisible();
    expect(screen.getByText("1.234,5")).toBeVisible();
    expect(screen.getByLabelText("Draft")).toHaveValue("Unfinished work");
  });

  it("requires interpolation arguments in typed message calls", () => {
    const t = createMessages({}).getFixedT("en", "common");

    // @ts-expect-error Missing interpolation arguments must remain a TypeScript error.
    t("recordedBy");

    expect(t("recordedBy", { name: "Dana" })).toBe("Recorded by Dana");
  });

  it("keeps message changes isolated between instances and the source catalog", () => {
    const first = createMessages(webMessages);
    const second = createMessages(webMessages);
    first.addResource("en", "fundingRounds", "editor.title", "Changed for this instance");

    expect(first.t("editor.title", { ns: "fundingRounds" })).toBe("Changed for this instance");
    expect(second.t("editor.title", { ns: "fundingRounds" })).toBe("Edit recommendation");
    expect(webMessages.fundingRounds.editor.title).toBe("Edit recommendation");
  });
});
