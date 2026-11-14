import type { ComponentProps, ReactElement, ReactNode, Ref } from "react";
import { Autocomplete } from "react-aria-components/Autocomplete";
import { Header, ListBox, ListBoxItem, ListBoxSection } from "react-aria-components/ListBox";
import { Input, SearchField } from "react-aria-components/SearchField";

import { Icon } from "../../components/icon/icon";
import { StatusMessage } from "../status-message/status-message";
import styles from "./search-palette.module.css";

/** The row's DOM props, for the router's link component to render as the real link. */
export type SearchPaletteLinkProps = ComponentProps<"a"> & { href: string };

export type SearchPaletteItem = {
  id: string;
  /** The row as plain text, for assistive technology. */
  textValue: string;
  href: string;
  /** Renders the link element with the row's props; pass them to the router's link. */
  renderLink: (props: SearchPaletteLinkProps) => ReactElement;
  title: ReactNode;
  /** A quieter second line. */
  detail?: ReactNode;
  /** A short state beside the title. */
  label?: ReactNode;
};

export type SearchPaletteGroup = {
  id: string;
  heading: string;
  items: readonly SearchPaletteItem[];
  /** A non-interactive line below the group, such as how many matches are not shown. */
  note?: string;
};

type SearchPaletteProps = {
  /** Names the search field. */
  label: string;
  /** Names the list of results. */
  resultsLabel: string;
  /** The longest text the field accepts. */
  maxLength?: number;
  value: string;
  onValueChange: (value: string) => void;
  groups: readonly SearchPaletteGroup[];
  /** Results are being replaced; the previous ones stay visible. */
  busy?: boolean;
  /** Guidance, an empty result, or a failure; shown instead of the results. */
  message?: ReactNode;
  /** Spoken politely when it changes; `announcementId` makes repeated text count as new. */
  announcement: string;
  announcementId: string | number;
  /** Identifies the settled results shown; the top match is highlighted again whenever it changes. */
  resultsId?: string | number;
  /** Receives the search field so a caller can focus it. */
  inputRef?: Ref<HTMLInputElement>;
  /** A row was opened in this tab: not by a modifier-click, which opens a new tab. */
  onOpen?: (item: SearchPaletteItem) => void;
  /** Escape was pressed; when given, it dismisses even with text in the field instead of clearing it. */
  onEscape?: () => void;
};

const SearchGroup = ({
  group,
  onOpen,
}: {
  group: SearchPaletteGroup;
  onOpen?: (item: SearchPaletteItem) => void;
}) => (
  <ListBoxSection id={group.id} className={styles.group}>
    <Header className={styles.header}>
      <span className={styles.heading}>{group.heading}</span>
      {group.note && <span className={styles.note}>{group.note}</span>}
    </Header>
    {group.items.map((item) => (
      <ListBoxItem
        key={item.id}
        id={item.id}
        textValue={item.textValue}
        href={item.href}
        render={(props) => item.renderLink(props as SearchPaletteLinkProps)}
        onPress={(event) => {
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            onOpen?.(item);
          }
        }}
        className={styles.option}
      >
        <span className={styles.primary}>
          <span className={styles.title}>{item.title}</span>
          {item.label && <span className={styles.label}>{item.label}</span>}
        </span>
        {item.detail && <span className={styles.detail}>{item.detail}</span>}
      </ListBoxItem>
    ))}
  </ListBoxSection>
);

const SearchResults = ({
  label,
  groups,
  resultsId,
  busy,
  onOpen,
}: Pick<SearchPaletteProps, "groups" | "resultsId" | "onOpen"> & {
  label: string;
  busy: boolean;
}) =>
  groups.some((group) => group.items.length > 0) && (
    <ListBox
      // Each settled result set mounts afresh, so React Aria highlights its top row; while
      // newer results load the same rows stay, with their highlight hidden.
      key={resultsId}
      autoFocus={resultsId !== undefined && !busy ? "first" : false}
      aria-label={label}
      selectionMode="none"
      className={styles.list}
    >
      {groups.map((group) => (
        <SearchGroup key={group.id} group={group} onOpen={onOpen} />
      ))}
    </ListBox>
  );

/**
 * A search field above grouped results that arrive from elsewhere. The field keeps focus. The top
 * match is highlighted when settled results arrive, Up and Down move the highlight through every
 * row across groups, and Enter opens the highlighted row. Rows are real links, so the browser
 * handles modifier and middle clicks.
 */
export const SearchPalette = ({
  label,
  resultsLabel,
  maxLength,
  value,
  onValueChange,
  groups,
  busy = false,
  message,
  announcement,
  announcementId,
  resultsId,
  inputRef,
  onOpen,
  onEscape,
}: SearchPaletteProps) => {
  return (
    <div
      className={styles.palette}
      data-busy={busy || undefined}
      aria-busy={busy || undefined}
      // Enter must not open a row of an earlier query while newer results load.
      onKeyDownCapture={(event) => {
        if (busy && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
        } else if (onEscape && event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.stopPropagation();
          onEscape();
        }
      }}
    >
      <Autocomplete inputValue={value} onInputChange={onValueChange} disableAutoFocusFirst>
        <SearchField aria-label={label} className={styles.field} autoFocus>
          <Icon name="search" className={styles.icon} />
          <Input ref={inputRef} className={styles.input} maxLength={maxLength} />
        </SearchField>
        <div className={styles.progress} aria-hidden="true" />
        {message ? (
          <div className={styles.message}>{message}</div>
        ) : (
          <SearchResults
            label={resultsLabel}
            groups={groups}
            resultsId={resultsId}
            busy={busy}
            onOpen={onOpen}
          />
        )}
      </Autocomplete>
      <StatusMessage message={announcement} eventId={announcementId} />
    </div>
  );
};
