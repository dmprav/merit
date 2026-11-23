import { useEffect, useRef, type ReactNode, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import {
  orderedSearchRecords,
  searchMatchRank,
  type SearchRecord,
  workspaceSearchQueryLimit,
  type WorkspaceSearch,
} from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Notice } from "@merit/ui/notice";
import {
  SearchPalette,
  SearchPaletteDialog,
  type SearchPaletteItem,
  type SearchPaletteLinkProps,
} from "@merit/ui/search-palette";
import { StateMessage } from "@merit/ui/state-message";

import type { WorkspaceSearchData } from "../../contracts/search";
import { useWorkspaceSearch } from "../../controllers/search/use-workspace-search";

/** A record a search result opens. */
export type SearchDestination = SearchRecord;

/** Authorized destinations and actions supplied by the interface, in a stable order. */
export type SearchCommand = SearchPaletteItem & {
  /** Natural names as well as the displayed verb, so “Contacts” is an exact match. */
  names: readonly string[];
};

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
  commands?: readonly SearchCommand[];
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
  commands = [],
}: WorkspaceSearchDialogProps) => {
  const { t } = useTranslation("fundingRounds");

  return (
    <SearchPaletteDialog
      title={t("search.title")}
      trigger={null}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      {({ close }) => (
        <SearchSession
          data={data}
          links={links}
          commands={commands}
          close={close}
          focusRequest={focusRequest}
        />
      )}
    </SearchPaletteDialog>
  );
};

type Translate = ReturnType<typeof useTranslation<"fundingRounds">>["t"];

const SearchSession = ({
  data,
  links,
  close,
  commands = [],
  focusRequest,
}: Pick<WorkspaceSearchDialogProps, "data" | "links" | "commands" | "focusRequest"> & {
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
  const busy = shown ? shown.busy : search.status === "waiting";
  const local = matchingCommands(commands, search.typed);
  const records = shown ? searchItems(shown.search, links, t, calendarDate) : [];
  const items = [...records, ...local].sort((a, b) => a.rank - b.rank).map(({ item }) => item);
  const retry =
    search.status === "failed" ? (
      <Button
        variant="quiet"
        onPress={() => {
          input.current?.focus();
          search.retry();
        }}
      >
        <Icon name="reset" />
        {t("search.retry")}
      </Button>
    ) : undefined;
  const outcome = items.length ? undefined : emptyOutcome(search);
  const feedback = outcome?.status === "failed" ? undefined : searchFeedback(search, t, retry);
  const message = outcome && <SearchMessage search={outcome} retry={retry} />;
  const announcement = searchAnnouncement(search, local.length, t);

  return (
    <SearchPalette
      label={t("search.field")}
      resultsLabel={t("search.results")}
      placeholder={t("search.placeholder")}
      keyboardHelp={{
        navigate: t("search.navigate"),
        open: t("search.open"),
        close: t("search.dismiss"),
      }}
      maxLength={workspaceSearchQueryLimit}
      value={search.typed}
      onValueChange={search.onChange}
      groups={[{ id: "results", items }]}
      busy={busy}
      resultsId={`${search.typed}:${shown?.updatedAt ?? search.status}`}
      message={message}
      feedback={feedback}
      announcement={announcement}
      announcementId={`${search.typed}:${shown?.updatedAt ?? search.status}`}
      inputRef={input}
      onOpen={close}
      // Escape closes even with text in the field, which would otherwise only clear it.
      onEscape={close}
    />
  );
};

type SearchOutcome = Extract<
  ReturnType<typeof useWorkspaceSearch>,
  { status: "failed" | "results" }
>;

/** A finished search that left the result list empty needs a message in its place. */
const emptyOutcome = (search: ReturnType<typeof useWorkspaceSearch>): SearchOutcome | undefined =>
  search.status === "failed" || search.status === "results" ? search : undefined;

/** The message that replaces an empty result list after a search fails or finds nothing. */
const SearchMessage = ({ search, retry }: { search: SearchOutcome; retry: ReactNode }) => {
  const { t } = useTranslation("fundingRounds");

  return search.status === "failed" ? (
    <StateMessage
      size="compact"
      tone="danger"
      illustration={<Icon name="warning" />}
      title={t("search.unavailable")}
      description={t("search.unavailableHint")}
      actions={retry}
    />
  ) : (
    <StateMessage
      size="compact"
      illustration={<Icon name="search" />}
      title={t("search.noMatches", { query: search.query })}
      description={t("search.noMatchesHint")}
    />
  );
};

const searchFeedback = (
  search: ReturnType<typeof useWorkspaceSearch>,
  t: Translate,
  retry: ReactNode,
) => {
  if (search.status === "failed") {
    return (
      <Notice appearance="inline" tone="danger" actions={retry}>
        {t("search.unavailable")}
      </Notice>
    );
  }
  if (search.status !== "results") {
    return undefined;
  }
  const notes = truncationNotes(search.search, t);
  return notes.length ? notes.map((note) => <div key={note}>{note}</div>) : undefined;
};

const searchAnnouncement = (
  search: ReturnType<typeof useWorkspaceSearch>,
  localCount: number,
  t: Translate,
) => {
  const parts: string[] = [];
  if (search.status === "failed") {
    parts.push(t("search.unavailable"));
  } else if (search.status === "results" && !search.busy) {
    parts.push(announcementFor(search.search, t));
  }
  if (localCount) {
    parts.push(t("search.announce.commands", { count: localCount }));
  }
  const announcement = parts.filter(Boolean).join(", ");
  return (
    announcement || (search.status === "results" && !search.busy ? t("search.announce.none") : "")
  );
};

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim().replace(/\s+/g, " ");

const matchingCommands = (commands: readonly SearchCommand[], query: string) => {
  const text = fold(query);
  const words = text.split(" ");
  return commands.flatMap((item) => {
    const names = item.names.map(fold);
    if (!names.some((name) => words.every((word) => name.includes(word)))) {
      return [];
    }
    const rank =
      !text || names.includes(text) ? 0 : names.some((name) => name.startsWith(text)) ? 1 : 2;
    return [{ item: { ...item, availableWhileBusy: true }, rank }];
  });
};

const searchItems = (
  search: WorkspaceSearch,
  links: SearchLinks,
  t: Translate,
  calendarDate: (date: string) => string,
) => {
  const roundItems = search.rounds.results.map((round): SearchPaletteItem => {
    const destination = { kind: "round", round } as const;
    const detail =
      round.meetingDate === null ? t("search.notScheduled") : calendarDate(round.meetingDate);
    return {
      id: `round:${round.id}`,
      icon: "layers",
      label: t("search.round"),
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
      icon: "application",
      textValue: `${application.title}, ${detail}${labelText ? `, ${labelText}` : ""}`,
      href: links.href(destination),
      renderLink: (props) => links.render(destination, props),
      title: application.title,
      detail,
      label: (
        <>
          {t("search.application")}
          {label && <>, {label}</>}
        </>
      ),
    };
  });
  const byId = new Map([...roundItems, ...applicationItems].map((item) => [item.id, item]));
  return orderedSearchRecords(search).flatMap((record) => {
    const value = record.kind === "round" ? record.round : record.application;
    const item = byId.get(`${record.kind}:${value.id}`);
    return item ? [{ item, rank: searchMatchRank(value.matchQuality) }] : [];
  });
};

const truncationNotes = (search: WorkspaceSearch, t: Translate) => {
  const notes: string[] = [];
  if (search.rounds.total > search.rounds.results.length) {
    notes.push(
      t("search.moreRounds", { shown: search.rounds.results.length, total: search.rounds.total }),
    );
  }
  if (search.applications.total > search.applications.results.length) {
    notes.push(
      t("search.moreApplications", {
        shown: search.applications.results.length,
        total: search.applications.total,
      }),
    );
  }
  return notes;
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

  const [first, second] = parts;
  if (!first) {
    return "";
  }
  return second ? t("search.announce.both", { rounds: first, applications: second }) : first;
};
