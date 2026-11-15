import type { ComponentProps, ReactElement, ReactNode, Ref, KeyboardEvent } from "react";
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
  /** This item answers the current input even while other results are loading. */
  availableWhileBusy?: boolean;
  icon?: ComponentProps<typeof Icon>["name"];
  title: ReactNode;
  /** A quieter second line. */
  detail?: ReactNode;
  /** A short state beside the title. */
  label?: ReactNode;
} & (
  | { href: string; renderLink: (props: SearchPaletteLinkProps) => ReactElement; onAction?: never }
  | { href?: never; renderLink?: never; onAction: () => void }
);

export type SearchPaletteGroup = {
  id: string;
  heading?: string;
  items: readonly SearchPaletteItem[];
  /** A non-interactive line below the group, such as how many matches are not shown. */
  note?: string;
};

type SearchPaletteProps = {
  /** Names the search field. */
  label: string;
  placeholder?: string;
  /** Names the list of results. */
  resultsLabel: string;
  /** The longest text the field accepts. */
  maxLength?: number;
  value: string;
  onValueChange: (value: string) => void;
  groups: readonly SearchPaletteGroup[];
  /** Results are being replaced; previous rows stay visible but disabled unless current. */
  busy?: boolean;
  /** Guidance, an empty result, or a failure; shown instead of the results. */
  message?: ReactNode;
  /** Recovery or truncation feedback alongside usable results. */
  feedback?: ReactNode;
  keyboardHelp?: { navigate: string; open: string; close: string };
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

const SearchItem = ({
  item,
  onOpen,
  busy,
}: {
  item: SearchPaletteItem;
  onOpen?: (item: SearchPaletteItem) => void;
  busy: boolean;
}) => (
  <ListBoxItem
    id={item.id}
    textValue={item.textValue}
    href={busy && !item.availableWhileBusy ? undefined : item.href}
    isDisabled={busy && !item.availableWhileBusy}
    render={
      !(busy && !item.availableWhileBusy) && item.renderLink
        ? (props) => item.renderLink!(props as SearchPaletteLinkProps)
        : undefined
    }
    onPress={(event) => {
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        onOpen?.(item);
        item.onAction?.();
      }
    }}
    className={styles.option}
  >
    {item.icon && <Icon name={item.icon} className={styles.rowIcon} />}
    <span className={styles.content}>
      <span className={styles.primary}>
        <span className={styles.title}>{item.title}</span>
        {item.label && <span className={styles.label}>{item.label}</span>}
      </span>
      {item.detail && <span className={styles.detail}>{item.detail}</span>}
    </span>
  </ListBoxItem>
);

const SearchGroup = ({
  group,
  onOpen,
  busy,
}: {
  group: SearchPaletteGroup;
  onOpen?: (item: SearchPaletteItem) => void;
  busy: boolean;
}) => (
  <ListBoxSection id={group.id} className={styles.group}>
    <Header className={styles.header}>
      <span className={styles.heading}>{group.heading}</span>
      {group.note && <span className={styles.note}>{group.note}</span>}
    </Header>
    {group.items.map((item) => (
      <SearchItem key={item.id} item={item} onOpen={onOpen} busy={busy} />
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
      // newer results load only choices already answering the current input remain available.
      key={resultsId}
      autoFocus={
        resultsId !== undefined &&
        (!busy || groups.some((group) => group.items.some((item) => item.availableWhileBusy)))
          ? "first"
          : false
      }
      aria-label={label}
      selectionMode="none"
      className={styles.list}
    >
      {groups.flatMap((group) =>
        group.heading
          ? [<SearchGroup key={group.id} group={group} onOpen={onOpen} busy={busy} />]
          : group.items.map((item) => (
              <SearchItem key={item.id} item={item} onOpen={onOpen} busy={busy} />
            )),
      )}
    </ListBox>
  );

/**
 * A search field above links and actions, optionally grouped. The field keeps focus. The top
 * match is highlighted when settled results arrive, Up and Down move the highlight through every
 * row across groups, and Enter opens the highlighted row. Navigation rows are real links, so the browser
 * handles modifier and middle clicks.
 */
export const SearchPalette = ({
  label,
  resultsLabel,
  placeholder,
  keyboardHelp,
  feedback,
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
  const pending = busy || undefined;

  const onKeyDown = (event: KeyboardEvent) => {
    if (onEscape && event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.stopPropagation();
      onEscape();
    }
  };

  return (
    <div
      className={styles.palette}
      data-busy={pending}
      aria-busy={pending}
      onKeyDownCapture={onKeyDown}
    >
      <Autocomplete inputValue={value} onInputChange={onValueChange} disableAutoFocusFirst>
        <SearchField aria-label={label} className={styles.field} autoFocus>
          <Icon name="search" className={styles.icon} />
          <Input
            ref={inputRef}
            className={styles.input}
            placeholder={placeholder}
            maxLength={maxLength}
          />
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
      <PaletteFooter feedback={feedback} keyboardHelp={keyboardHelp} />
      <StatusMessage message={announcement} eventId={announcementId} />
    </div>
  );
};

const PaletteFooter = ({
  feedback,
  keyboardHelp,
}: Pick<SearchPaletteProps, "feedback" | "keyboardHelp">) => (
  <>
    {feedback && <div className={styles.feedback}>{feedback}</div>}
    {keyboardHelp && (
      <div className={styles.footer}>
        <span>
          <kbd>↑ ↓</kbd> {keyboardHelp.navigate}
        </span>
        <span>
          <kbd>↵</kbd> {keyboardHelp.open}
        </span>
        <span>
          <kbd>Esc</kbd> {keyboardHelp.close}
        </span>
      </div>
    )}
  </>
);
