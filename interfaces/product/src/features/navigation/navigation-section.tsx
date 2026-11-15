import { Link, useLocation, useRouter, type LinkOptions } from "@tanstack/react-router";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";

import type { NavigationPin, NavigationPinChange, NavigationTarget } from "@merit/grantmaking/api";
import { ActionMenu } from "@merit/ui/action-menu";
import {
  ApplicationNavigationList,
  ApplicationNavigationRow,
} from "@merit/ui/application-navigation";
import { useCloseNavigation } from "@merit/ui/application-shell";
import { Button } from "@merit/ui/button";
import { PopoverDialog } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { Tooltip } from "@merit/ui/tooltip";

import { resourceRef } from "../grantmaking/contracts/resource-url";
import { NavigationPinsContext } from "./context";
import styles from "./navigation.module.css";

const PIN_PREVIEW_LIMIT = 5;
const PIN_SEGMENTS = { review: "work", round: "rounds", application: "applications" };

const pinLocation = (pin: NavigationPin): LinkOptions => {
  if (pin.target.kind === "review") {
    return {
      to: "/app/$workspaceSlug/work/$assignmentId",
      params: { workspaceSlug: pin.workspaceSlug!, assignmentId: pin.target.id },
    };
  }
  const workspaceSlug = pin.workspaceSlug!;
  return pin.target.kind === "round"
    ? {
        to: "/app/$workspaceSlug/rounds/$roundRef",
        params: { workspaceSlug, roundRef: resourceRef(pin.title, pin.target.id) },
      }
    : {
        to: "/app/$workspaceSlug/applications/$applicationRef",
        params: { workspaceSlug, applicationRef: resourceRef(pin.title, pin.target.id) },
        search: { from: "applications" },
      };
};

type PinChange = (input: NavigationPinChange) => Promise<void>;

const PinMenu = ({
  pins,
  index,
  change,
  trigger,
  tooltip,
}: {
  pins: NavigationPin[];
  index: number;
  change: PinChange;
  trigger: ComponentProps<typeof ActionMenu>["trigger"];
  tooltip?: string;
}) => {
  const { t } = useTranslation("web");
  const pin = pins[index]!;
  return (
    <ActionMenu
      label={t("pins.reorder", { title: pin.title })}
      trigger={trigger}
      activation="contextMenu"
      tooltip={tooltip}
      items={[
        ...(index > 0 ? [{ id: "up", label: t("pins.up") }] : []),
        ...(index < pins.length - 1 ? [{ id: "down", label: t("pins.down") }] : []),
        { id: "unpin", label: t("pins.unpin") },
      ]}
      onAction={(action) =>
        void change(
          action === "unpin"
            ? { action: "unpin", target: pin.target }
            : {
                action: "move",
                target: pin.target,
                before:
                  action === "up" ? pins[index - 1]!.target : (pins[index + 2]?.target ?? null),
              },
        )
      }
    />
  );
};

const PinRow = ({
  pins,
  index,
  busy,
  change,
  current,
  popup = false,
  onNavigate,
}: {
  pins: NavigationPin[];
  index: number;
  busy: boolean;
  change: PinChange;
  current: boolean;
  popup?: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) => {
  const { t } = useTranslation("web");
  const pin = pins[index]!;
  const hint = pin.context ? `${pin.title} · ${pin.context}` : pin.title;
  const link = (
    <Link
      {...pinLocation(pin)}
      data-pin-id={pin.target.id}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      activeOptions={{ includeSearch: false }}
      aria-label={pin.context ? `${pin.title} ${pin.context}` : pin.title}
    >
      <span className={popup ? styles.popupLabel : styles.pinLabel}>
        <span>{pin.title}</span>
        {popup && pin.context && <small> {pin.context}</small>}
      </span>
    </Link>
  );
  return (
    <ApplicationNavigationRow
      reorderKey={pin.target.id}
      action={
        <Tooltip content={t("pins.unpin")}>
          <Button
            variant="quiet"
            size="small"
            iconOnly
            aria-label={t("pins.unpinName", { title: pin.title })}
            aria-disabled={busy || undefined}
            onPress={() => void change({ action: "unpin", target: pin.target })}
          >
            <Icon name="close" />
          </Button>
        </Tooltip>
      }
    >
      {pins.length > 1 ? (
        <PinMenu
          pins={pins}
          index={index}
          change={change}
          trigger={link}
          tooltip={popup ? undefined : hint}
        />
      ) : (
        <Tooltip customTrigger content={hint}>
          {link}
        </Tooltip>
      )}
    </ApplicationNavigationRow>
  );
};

type NavigationSectionProps = {
  title: string;
  kind: NavigationTarget["kind"];
  workspaceSlug?: string;
  location: LinkOptions;
  icon: ComponentProps<typeof Icon>["name"];
};

type PinSurface = "sidebar" | "popup";

/** Choose a surviving control only when a successful change removes the source row. */
const recoveryTarget = (input: NavigationPinChange, pins: NavigationPin[], surface: PinSurface) => {
  if (input.action === "unpin") {
    if (surface === "sidebar" || pins.length <= PIN_PREVIEW_LIMIT + 1) {
      return "collection";
    }
    const index = pins.findIndex((pin) => pin.target.id === input.target.id);
    return (pins[index + 1] ?? pins[index - 1])?.target;
  }
  if (input.action !== "move" || surface !== "sidebar") {
    return null;
  }
  const destination = input.before
    ? pins.findIndex((pin) => pin.target.id === input.before!.id)
    : pins.length;
  return destination > PIN_PREVIEW_LIMIT ? "overflow" : null;
};

const pinLink = (container: HTMLElement | null, id: string) =>
  Array.from(container?.querySelectorAll<HTMLAnchorElement>("a[data-pin-id]") ?? []).find(
    (link) => link.dataset.pinId === id,
  );

/** Menus restore to their row; removed controls fall back to their dialog or the body. */
const ownsPinFocus = (
  active: Element | null,
  row: HTMLElement | null | undefined,
  dialog: Element | null | undefined,
) => {
  const current = document.activeElement;
  return (
    current === active ||
    row?.contains(current) ||
    (!active?.isConnected && (current === document.body || current === dialog))
  );
};

const useNavigationSection = ({ kind, workspaceSlug }: NavigationSectionProps) => {
  const state = useContext(NavigationPinsContext);
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const collection = useRef<HTMLAnchorElement>(null);
  const overflow = useRef<HTMLButtonElement>(null);
  const popupList = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<"sidebar" | "popup" | null>(null);
  const submitting = useRef(false);
  const interaction = useRef(0);
  const pins =
    state?.pins.filter((pin) => pin.target.kind === kind && pin.workspaceSlug === workspaceSlug) ??
    [];
  const segment = PIN_SEGMENTS[kind];
  const currentPin = pathname.includes(`/${segment}/`)
    ? pins.find((pin) => pathname.replace(/\/$/, "").endsWith(pin.target.id))
    : undefined;

  useEffect(() => {
    const reset = () => {
      interaction.current += 1;
      setOpen(false);
      setError(null);
    };

    reset();
    // Like search, overflow belongs to the page where it was opened. Invalidate before
    // the new page takes focus, including Back/Forward and already scheduled recovery.
    const unsubscribe = router.subscribe("onBeforeNavigate", ({ hrefChanged }) => {
      if (hrefChanged) {
        reset();
      }
    });
    return () => {
      unsubscribe();
      interaction.current += 1;
    };
  }, [router, kind, workspaceSlug]);

  useEffect(() => {
    if (pins.length <= PIN_PREVIEW_LIMIT) {
      setOpen(false);
    }
  }, [pins.length]);

  const onOpenChange = (next: boolean) => {
    interaction.current += 1;
    setError(null);
    setOpen(next);
  };

  const change = async (input: NavigationPinChange, surface: PinSurface) => {
    if (!state || state.busy || submitting.current) {
      return;
    }
    submitting.current = true;
    setError(null);
    const version = ++interaction.current;
    const active = document.activeElement;
    const container = surface === "popup" ? popupList.current : collection.current?.parentElement;
    const row = pinLink(container ?? null, input.target.id)?.closest("li");
    const dialog = row?.closest("[role=dialog]");
    const saved = await state.change(input);
    submitting.current = false;
    if (version !== interaction.current) {
      return;
    }
    if (!saved) {
      setError(surface);
      return;
    }
    if (input.action === "unpin" && pins.length <= PIN_PREVIEW_LIMIT + 1) {
      setOpen(false);
    }
    const target = recoveryTarget(input, pins, surface);
    requestAnimationFrame(() => {
      if (version !== interaction.current || !ownsPinFocus(active, row, dialog)) {
        return;
      }
      const controls = { collection: collection.current, overflow: overflow.current };
      const control =
        typeof target === "string"
          ? controls[target]
          : target && pinLink(popupList.current, target.id);
      control?.focus();
    });
  };

  return {
    state,
    pins,
    currentPin,
    collection,
    overflow,
    popupList,
    open,
    setOpen: onOpenChange,
    error,
    change,
  };
};

const PinList = ({
  pins,
  currentPin,
  busy,
  change,
  popup = false,
  listRef,
  onNavigate,
}: {
  pins: NavigationPin[];
  currentPin?: NavigationPin;
  busy: boolean;
  change: PinChange;
  popup?: boolean;
  listRef?: Ref<HTMLUListElement>;
  onNavigate?: ComponentProps<typeof PinRow>["onNavigate"];
}) => (
  <ApplicationNavigationList
    ref={listRef}
    appearance={popup ? "popup" : "sidebar"}
    className={popup ? undefined : styles.pins}
    isDisabled={busy || pins.length < 2}
    onMove={(id, target, position) => {
      const pin = pins.find((item) => item.target.id === id);
      const targetIndex = pins.findIndex((item) => item.target.id === target);
      if (!pin || targetIndex < 0) {
        return;
      }
      const before = position === "before" ? pins[targetIndex] : pins[targetIndex + 1];
      void change({ action: "move", target: pin.target, before: before?.target ?? null });
    }}
  >
    {(popup ? pins : pins.slice(0, PIN_PREVIEW_LIMIT)).map((pin, index) => (
      <PinRow
        key={pin.target.id}
        pins={pins}
        index={index}
        current={pin === currentPin}
        busy={busy}
        change={change}
        popup={popup}
        onNavigate={onNavigate}
      />
    ))}
  </ApplicationNavigationList>
);

export const NavigationSection = (props: NavigationSectionProps) => {
  const { title, location, icon, kind } = props;
  const { t } = useTranslation("web");
  const closeNavigation = useCloseNavigation();
  const { state, pins, currentPin, collection, overflow, popupList, open, setOpen, error, change } =
    useNavigationSection(props);
  const previewCurrent = pins.slice(0, PIN_PREVIEW_LIMIT).includes(currentPin!);
  return (
    <section aria-label={title} className={styles.section}>
      <Link
        {...location}
        ref={collection}
        activeOptions={{ exact: previewCurrent, includeSearch: false }}
      >
        <Icon name={icon} />
        {title}
      </Link>
      {pins.length > 0 && (
        <PinList
          pins={pins}
          currentPin={currentPin}
          busy={state?.busy ?? false}
          change={(input) => change(input, "sidebar")}
        />
      )}
      {pins.length > PIN_PREVIEW_LIMIT && (
        <PopoverDialog
          title={t(`pins.pinned_${kind}`)}
          closeLabel={t("pins.close")}
          placement="right top"
          isOpen={open}
          onOpenChange={setOpen}
          trigger={
            <Button ref={overflow} className={styles.overflow} variant="quiet" size="small">
              {t("pins.more", { count: pins.length - PIN_PREVIEW_LIMIT })}
            </Button>
          }
        >
          <PinList
            listRef={popupList}
            pins={pins}
            currentPin={currentPin}
            busy={state?.busy ?? false}
            popup
            change={(input) => change(input, "popup")}
            onNavigate={(event) => {
              if (
                event.button === 0 &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                setOpen(false);
                closeNavigation();
              }
            }}
          />
          {error === "popup" && (
            <p role="alert" className={styles.error}>
              {t("pins.saveError")}
            </p>
          )}
        </PopoverDialog>
      )}
      {error === "sidebar" && (
        <p role="alert" className={styles.error}>
          {t("pins.saveError")}
        </p>
      )}
    </section>
  );
};

export const NavigationPinsStatus = () => {
  const state = useContext(NavigationPinsContext);
  const { t } = useTranslation("web");
  if (!state?.unavailable) {
    return null;
  }
  return (
    <div role="status" className={styles.error}>
      {t("pins.loadError")}{" "}
      <Button variant="quiet" size="small" onPress={state.retry}>
        {t("pins.retry")}
      </Button>
    </div>
  );
};
