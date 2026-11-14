import { useEffect, useRef, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import {
  searchGroupOrder,
  workspaceSearchQueryLimit,
  type SearchedApplication,
  type SearchedRound,
  type WorkspaceSearch,
} from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { ModalDialog } from "@merit/ui/dialog";
import {
  SearchPalette,
  type SearchPaletteGroup,
  type SearchPaletteItem,
  type SearchPaletteLinkProps,
} from "@merit/ui/search-palette";

import type { WorkspaceSearchData } from "../../contracts/search";
import { useWorkspaceSearch } from "../../controllers/search/use-workspace-search";

/** A record a search result opens. */
export type SearchDestination =
  | { kind: "round"; round: SearchedRound }
  | { kind: "application"; application: SearchedApplication };

/** The interface supplies each result's address and its router link. */
export type SearchLinks = {
  href: (destination: SearchDestination) => string;
  /** Render the router's link with the row's props, keeping the row's own handlers. */
  render: (destination: SearchDestination, props: SearchPaletteLinkProps) => ReactElement;
};

type WorkspaceSearchDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  data: WorkspaceSearchData;
  links: SearchLinks;
  /** Changes when the person asks to search again while the box is open. */
  focusRequest?: number;
};

/**
 * Jump to a funding round or application by name or applicant. The box opens empty each
 * time, keeps the typed text and the page underneath untouched when a search fails, and
 * closes when a result opens in this tab.
 */
export const WorkspaceSearchDialog = ({
  isOpen,
  onOpenChange,
  data,
  links,
  focusRequest,
}: WorkspaceSearchDialogProps) => {
  const { t } = useTranslation("fundingRounds");

  return (
    <ModalDialog
      appearance="search"
      title={t("search.title")}
      closeLabel={t("search.close")}
      trigger={null}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      {({ close }) => (
        <SearchSession data={data} links={links} close={close} focusRequest={focusRequest} />
      )}
    </ModalDialog>
  );
};

type Translate = ReturnType<typeof useTranslation<"fundingRounds">>["t"];

const SearchSession = ({
  data,
  links,
  close,
  focusRequest,
}: Pick<WorkspaceSearchDialogProps, "data" | "links" | "focusRequest"> & {
  close: () => void;
}) => {
  const { t } = useTranslation("fundingRounds");
  const { calendarDate } = useFormat();
  const search = useWorkspaceSearch(data);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRequest) {
      input.current?.focus();
    }
  }, [focusRequest]);

  const shown = search.status === "results" ? search : undefined;
  const groups = shown ? searchGroups(shown.search, links, t, calendarDate) : [];
  // Waiting covers the first request and a retry, which reads again from a clean slate.
  const busy = shown ? shown.busy : search.status === "waiting";
  const { message, announcement } = searchFeedback(search, groups.length === 0, t);

  return (
    <SearchPalette
      label={t("search.field")}
      resultsLabel={t("search.results")}
      maxLength={workspaceSearchQueryLimit}
      value={search.typed}
      onValueChange={search.onChange}
      groups={groups}
      busy={busy}
      resultsId={shown?.updatedAt}
      message={message}
      announcement={announcement}
      announcementId={shown ? shown.updatedAt : search.status}
      inputRef={input}
      onOpen={close}
      // Escape closes even with text in the field, which would otherwise only clear it.
      onEscape={close}
    />
  );
};

/** Guidance, an empty result, or a failure instead of the results, and what to announce. */
const searchFeedback = (
  search: ReturnType<typeof useWorkspaceSearch>,
  noGroups: boolean,
  t: Translate,
) => {
  if (search.status === "failed") {
    return {
      message: (
        <>
          <span>{t("search.unavailable")}</span>{" "}
          <Button variant="secondary" size="small" onPress={search.retry}>
            {t("search.retry")}
          </Button>
        </>
      ),
      announcement: t("search.unavailable"),
    };
  }
  if (search.status === "empty") {
    return { message: t("search.hint"), announcement: "" };
  }
  if (search.status === "waiting") {
    // The first results are on their way: no guidance, only the busy indication.
    return { message: undefined, announcement: "" };
  }
  return {
    message: noGroups ? t("search.noMatches", { query: search.query }) : undefined,
    announcement: search.busy ? "" : announcementFor(search.search, t),
  };
};

const searchGroups = (
  search: WorkspaceSearch,
  links: SearchLinks,
  t: Translate,
  calendarDate: (date: string) => string,
): SearchPaletteGroup[] => {
  const roundItems = search.rounds.results.map((round): SearchPaletteItem => {
    const destination = { kind: "round", round } as const;
    const detail =
      round.meetingDate === null ? t("search.notScheduled") : calendarDate(round.meetingDate);
    return {
      id: `round:${round.id}`,
      textValue: `${round.title}, ${detail}`,
      href: links.href(destination),
      renderLink: (props) => links.render(destination, props),
      title: round.title,
      detail,
    };
  });
  const applicationItems = search.applications.results.map((application): SearchPaletteItem => {
    const destination = { kind: "application", application } as const;
    const detail = t("search.applicantInRound", {
      applicant: application.applicant ?? t("search.applicantUnknown"),
      round: application.roundTitle,
    });
    // Withdrawn takes precedence over in preparation; ready applications carry no label.
    const status = application.withdrawn
      ? "withdrawn"
      : application.intakeStatus === "in_preparation"
        ? "preparing"
        : undefined;
    const labelText =
      status === "withdrawn"
        ? t("applications.withdrawn")
        : status === "preparing"
          ? t("intake.preparing")
          : undefined;
    const label = status === "withdrawn" ? <Badge>{labelText}</Badge> : labelText;
    return {
      id: `application:${application.id}`,
      textValue: `${application.title}, ${detail}${labelText ? `, ${labelText}` : ""}`,
      href: links.href(destination),
      renderLink: (props) => links.render(destination, props),
      title: application.title,
      detail,
      label,
    };
  });
  const byGroup = {
    rounds: {
      id: "rounds",
      heading: t("search.rounds"),
      items: roundItems,
      note:
        search.rounds.total > roundItems.length
          ? t("search.moreRounds", { shown: roundItems.length, total: search.rounds.total })
          : undefined,
    },
    applications: {
      id: "applications",
      heading: t("search.applications"),
      items: applicationItems,
      note:
        search.applications.total > applicationItems.length
          ? t("search.moreApplications", {
              shown: applicationItems.length,
              total: search.applications.total,
            })
          : undefined,
    },
  };
  return searchGroupOrder(search)
    .map((group) => byGroup[group])
    .filter((group) => group.items.length > 0);
};

/** "2 funding rounds, 10 of 43 applications", or "No results". */
const announcementFor = (search: WorkspaceSearch, t: Translate) => {
  const { rounds, applications } = search;
  const parts: string[] = [];
  if (rounds.total > 0) {
    parts.push(
      rounds.total > rounds.results.length
        ? t("search.announce.roundsOf", { shown: rounds.results.length, total: rounds.total })
        : t("search.announce.rounds", { count: rounds.total }),
    );
  }
  if (applications.total > 0) {
    parts.push(
      applications.total > applications.results.length
        ? t("search.announce.applicationsOf", {
            shown: applications.results.length,
            total: applications.total,
          })
        : t("search.announce.applications", { count: applications.total }),
    );
  }

  if (parts.length === 0) {
    return t("search.announce.none");
  }
  return parts.length === 1
    ? parts[0]!
    : t("search.announce.both", { rounds: parts[0]!, applications: parts[1]! });
};
