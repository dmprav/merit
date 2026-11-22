import {
  useEffectEvent,
  useEffect,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type Ref,
  type KeyboardEvent,
} from "react";
import { Autocomplete } from "react-aria-components/Autocomplete";
import {
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  type ListBoxRenderProps,
} from "react-aria-components/ListBox";
import { Input, SearchField } from "react-aria-components/SearchField";
import { useTranslation } from "react-i18next";

import { ButtonBase } from "../../components/button/button-base";
import { ModalFrame, type ModalFrameProps } from "../../components/dialog/modal-frame";
import { IconBase } from "../../components/icon/icon-base";
import scrollStyles from "../../foundations/scroll-area.module.css";
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
  icon?: ComponentProps<typeof IconBase>["name"];
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
  items: readonly SearchPaletteItem[];
} & (
  | {
      heading: string;
      /** A non-interactive line below the named group, such as how many matches are not shown. */
      note?: string;
    }
  | { heading?: never; note?: never }
);

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
  /** Guidance, an empty result, or a failure shown instead of the results, such as a compact `StateMessage`. */
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
}) => {
  const renderLink = !(busy && !item.availableWhileBusy) ? item.renderLink : undefined;
  return (
    <ListBoxItem
      id={item.id}
      textValue={item.textValue}
      href={busy && !item.availableWhileBusy ? undefined : item.href}
      isDisabled={busy && !item.availableWhileBusy}
      render={
        renderLink
          ? (props) =>
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ListBoxItem sets href when item.href is provided, while its render type widens props to div/a.
              renderLink(props as SearchPaletteLinkProps)
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
      {item.icon && <IconBase name={item.icon} className={styles.rowIcon} />}
      <span className={styles.content}>
        <span className={styles.primary}>
          <span className={styles.title}>{item.title}</span>
          {item.label && <span className={styles.label}>{item.label}</span>}
        </span>
        {item.detail && <span className={styles.detail}>{item.detail}</span>}
      </span>
    </ListBoxItem>
  );
};

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

/** Reset virtual focus without replacing the DOM nodes that own an in-progress press. */
const ResultsList = ({
  state,
  firstId,
  resultsId,
  ...props
}: ComponentProps<"div"> &
  Pick<ListBoxRenderProps, "state"> &
  Pick<SearchPaletteProps, "resultsId"> & { firstId?: string }) => {
  // React Aria builds its collection after the initial render.
  const firstAvailable =
    firstId !== undefined && state.collection.getItem(firstId) ? firstId : null;
  const highlight = useEffectEvent((key: string | null) => {
    state.selectionManager.setFocused(key !== null);
    state.selectionManager.setFocusedKey(key);
  });
  useEffect(() => {
    if (resultsId !== undefined) {
      highlight(firstAvailable);
    }
  }, [resultsId, firstAvailable]);
  return <div {...props} />;
};

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
      render={(props, { state }) => (
        <ResultsList
          {...props}
          state={state}
          firstId={
            groups.flatMap((group) => group.items).find((item) => !busy || item.availableWhileBusy)
              ?.id
          }
          resultsId={resultsId}
        />
      )}
      aria-label={label}
      selectionMode="none"
      className={`${styles.list} ${scrollStyles.scrollArea}`}
    >
      {groups.flatMap((group) =>
        group.heading !== undefined
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
          <IconBase name="search" className={styles.icon} />
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
}: Pick<SearchPaletteProps, "feedback" | "keyboardHelp">) =>
  (feedback || keyboardHelp) && (
    <div className={`${styles.footer} ${scrollStyles.dividerUntilEnd}`}>
      {feedback && <div className={styles.feedback}>{feedback}</div>}
      {keyboardHelp && (
        <div className={styles.hints}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {keyboardHelp.navigate}
          </span>
          <span>
            <kbd>Enter</kbd> {keyboardHelp.open}
          </span>
          <span>
            <kbd>Esc</kbd> {keyboardHelp.close}
          </span>
        </div>
      )}
    </div>
  );

/**
 * A search box near the top of the page with no visible title bar. `title` names the
 * dialog for assistive technology, and a small close control floats over the end of the
 * first row. Outside presses dismiss it unless `isDismissable` is false. On viewports up
 * to 600px wide the box fills the screen.
 */
export const SearchPaletteDialog = ({
  title,
  closeLabel,
  isDismissable = true,
  isDismissDisabled,
  children,
  ...props
}: Pick<
  ModalFrameProps,
  "isOpen" | "defaultOpen" | "onOpenChange" | "isDismissable" | "isDismissDisabled" | "trigger"
> & {
  title: string;
  /** Defaults to the shared “Close dialog” message. */
  closeLabel?: string;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
}) => {
  const { t } = useTranslation("common");

  return (
    <ModalFrame
      {...props}
      isDismissable={isDismissable}
      isDismissDisabled={isDismissDisabled}
      aria-label={title}
      classNames={{ overlay: styles.overlay, modal: styles.modal, dialog: styles.dialog }}
    >
      {(close) => (
        <>
          <ButtonBase
            variant="quiet"
            size="small"
            iconOnly
            aria-label={closeLabel ?? t("closeDialog")}
            isDisabled={isDismissDisabled}
            onPress={close}
            className={styles.close}
          >
            <IconBase name="close" />
          </ButtonBase>
          {typeof children === "function" ? children({ close }) : children}
        </>
      )}
    </ModalFrame>
  );
};
