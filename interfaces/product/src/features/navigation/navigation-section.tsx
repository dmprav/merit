import { Link, useLocation, useRouter, type LinkOptions } from "@tanstack/react-router";
import { useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import type { NavigationPin, NavigationPinChange, NavigationTarget } from "@merit/grantmaking/api";
import { ActionMenu } from "@merit/ui/action-menu";
import {
  ApplicationNavigationList,
  ApplicationNavigationRow,
} from "@merit/ui/application-navigation";
import { Button } from "@merit/ui/button";
import { Disclosure } from "@merit/ui/disclosure";
import { Icon } from "@merit/ui/icon";
import { Notice } from "@merit/ui/notice";
import { Tooltip } from "@merit/ui/tooltip";

import { resourceRef } from "../grantmaking/contracts/resource-url";
import { NavigationPinsContext, type NavigationPinsState } from "./context";
import styles from "./navigation.module.css";

const PIN_SEGMENTS = { review: "work", round: "rounds", application: "applications" };
/** Each pin repeats its collection's sidebar icon, so a mixed list stays scannable. */
const PIN_ICONS = { round: "layers", application: "document", review: "edit" } as const;

const pinLocation = (pin: NavigationPin): LinkOptions => {
  const workspaceSlug = pin.workspaceSlug ?? "";
  if (pin.target.kind === "review") {
    return {
      to: "/app/$workspaceSlug/work/$assignmentId",
      params: { workspaceSlug, assignmentId: pin.target.id },
    };
  }
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

/** The pin for the current page, when that page is pinned. */
const useCurrentPin = (pins: NavigationPin[]) => {
  const pathname = useLocation({ select: (location) => location.pathname });
  return pins.find(
    (pin) =>
      pathname.includes(`/${PIN_SEGMENTS[pin.target.kind]}/`) &&
      pathname.replace(/\/$/, "").endsWith(pin.target.id),
  );
};

type PinChange = (input: NavigationPinChange) => Promise<void>;

const PinMenu = ({
  pin,
  previousTarget,
  nextTarget,
  canMoveDown,
  change,
  trigger,
  tooltip,
}: {
  pin: NavigationPin;
  previousTarget: NavigationTarget | null;
  nextTarget: NavigationTarget | null;
  canMoveDown: boolean;
  change: PinChange;
  trigger: ComponentProps<typeof ActionMenu>["trigger"];
  tooltip?: string;
}) => {
  const { t } = useTranslation("web");
  return (
    <ActionMenu
      label={t("pins.reorder", { title: pin.title })}
      trigger={trigger}
      activation="contextMenu"
      tooltip={tooltip}
      items={[
        ...(previousTarget ? [{ id: "up", label: t("pins.up"), icon: "ascending" as const }] : []),
        ...(canMoveDown
          ? [{ id: "down", label: t("pins.down"), icon: "descending" as const }]
          : []),
        { id: "unpin", label: t("pins.unpin"), icon: "pin" as const },
      ]}
      onAction={(action) =>
        void change(
          action === "unpin"
            ? { action: "unpin", target: pin.target }
            : {
                action: "move",
                target: pin.target,
                before: action === "up" ? previousTarget : nextTarget,
              },
        )
      }
    />
  );
};

const PinRow = ({
  pin,
  previousTarget,
  nextTarget,
  canMoveDown,
  canReorder,
  busy,
  change,
  current,
}: {
  pin: NavigationPin;
  previousTarget: NavigationTarget | null;
  nextTarget: NavigationTarget | null;
  canMoveDown: boolean;
  canReorder: boolean;
  busy: boolean;
  change: PinChange;
  current: boolean;
}) => {
  const { t } = useTranslation("web");
  const hint = pin.context ? `${pin.title}, ${pin.context}` : pin.title;
  const link = (
    <Link
      {...pinLocation(pin)}
      data-pin-id={pin.target.id}
      aria-current={current ? "page" : undefined}
      activeOptions={{ includeSearch: false }}
      aria-label={pin.context ? `${pin.title} ${pin.context}` : pin.title}
    >
      <Icon name={PIN_ICONS[pin.target.kind]} />
      <span className={styles.pinLabel}>{pin.title}</span>
    </Link>
  );
  return (
    <ApplicationNavigationRow
      reorderKey={pin.target.id}
      action={
        <Tooltip content={t("pins.unpin")}>
          <Button
            variant="quiet"
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
      {canReorder ? (
        <PinMenu
          pin={pin}
          previousTarget={previousTarget}
          nextTarget={nextTarget}
          canMoveDown={canMoveDown}
          change={change}
          trigger={link}
          tooltip={hint}
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

/**
 * A collection destination. When the current page is pinned, the Pinned section marks it
 * instead, so only one sidebar entry is current.
 */
export const NavigationSection = ({
  title,
  kind,
  workspaceSlug,
  location,
  icon,
}: NavigationSectionProps) => {
  const state = useContext(NavigationPinsContext);
  const currentPin = useCurrentPin(
    state?.pins.filter((pin) => pin.target.kind === kind && pin.workspaceSlug === workspaceSlug) ??
      [],
  );
  return (
    <section aria-label={title} className={styles.section}>
      <Link
        {...location}
        data-pin-collection={kind}
        activeOptions={{ exact: Boolean(currentPin), includeSearch: false }}
      >
        <Icon name={icon} />
        {title}
      </Link>
    </section>
  );
};

/** After a pin is removed, move focus to a neighbouring pin or, failing that, its collection. */
const restorePinFocus = (
  input: NavigationPinChange,
  pins: NavigationPin[],
  active: Element | null,
  row: HTMLElement | null | undefined,
  isCurrent: () => boolean,
) => {
  if (input.action !== "unpin") {
    return;
  }
  const index = pins.findIndex((pin) => pin.target.id === input.target.id);
  const neighbour = pins[index + 1] ?? pins[index - 1];
  requestAnimationFrame(() => {
    if (!isCurrent()) {
      return;
    }
    const current = document.activeElement;
    const control = neighbour
      ? document.querySelector<HTMLElement>(`a[data-pin-id="${neighbour.target.id}"]`)
      : document.querySelector<HTMLElement>(`a[data-pin-collection="${input.target.kind}"]`);
    // Removing the focused row leaves focus on the body or the containing navigation drawer.
    const fallback = control?.closest('[role="dialog"]') ?? document.body;
    if (
      current === active ||
      row?.contains(current) ||
      current === document.body ||
      current === fallback
    ) {
      control?.focus();
    }
  });
};

/** Saves a pin change for the current page; navigation invalidates its feedback and focus. */
const usePinChange = (state: NavigationPinsState | null) => {
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const interaction = useRef(0);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = router.subscribe("onBeforeNavigate", ({ hrefChanged }) => {
      if (hrefChanged) {
        interaction.current += 1;
        setFailed(false);
      }
    });

    return () => {
      unsubscribe();
      interaction.current += 1;
    };
  }, [router]);

  const change = async (input: NavigationPinChange, group: NavigationPin[]) => {
    if (!state || state.busy || submitting.current) {
      return;
    }

    submitting.current = true;
    setFailed(false);

    const version = ++interaction.current;

    const isCurrent = () => version === interaction.current;

    const active = document.activeElement;
    const row = document.querySelector(`a[data-pin-id="${input.target.id}"]`)?.closest("li");
    const saved = await state.change(input);
    submitting.current = false;
    if (!isCurrent()) {
      return;
    }

    if (!saved) {
      setFailed(true);
      return;
    }

    restorePinFocus(input, group, active, row, isCurrent);
  };

  return { failed, change };
};

/** One kind's pins in their own saved order; moves stay within the list. */
const PinGroup = ({
  kind,
  pins,
  currentPin,
  busy,
  change,
}: {
  kind: NavigationTarget["kind"];
  pins: NavigationPin[];
  currentPin?: NavigationPin;
  busy: boolean;
  change: (input: NavigationPinChange, group: NavigationPin[]) => Promise<void>;
}) => {
  const { t } = useTranslation("web");

  return (
    <ApplicationNavigationList
      aria-label={t(`pins.pinned_${kind}`)}
      isDisabled={busy || pins.length < 2}
      onMove={(id, target, position) => {
        const pin = pins.find((item) => item.target.id === id);
        const targetIndex = pins.findIndex((item) => item.target.id === target);
        if (!pin || targetIndex < 0) {
          return;
        }
        const before = position === "before" ? pins[targetIndex] : pins[targetIndex + 1];
        void change({ action: "move", target: pin.target, before: before?.target ?? null }, pins);
      }}
    >
      {pins.map((pin, index) => (
        <PinRow
          key={pin.target.id}
          pin={pin}
          previousTarget={pins[index - 1]?.target ?? null}
          nextTarget={pins[index + 2]?.target ?? null}
          canMoveDown={index < pins.length - 1}
          canReorder={pins.length > 1}
          current={pin === currentPin}
          busy={busy}
          change={(input) => change(input, pins)}
        />
      ))}
    </ApplicationNavigationList>
  );
};

/**
 * The workspace's pins in one collapsible section near the top of the sidebar. Pins keep the
 * domain's ordering: each kind (funding rounds, applications, review assignments) is its own
 * saved order, so each is its own list and moves stay within it. The sidebar scrolls when the
 * section is long.
 */
export const PinnedSection = ({
  workspaceSlug,
  kinds,
}: {
  workspaceSlug: string;
  /** Kinds this person can open in the workspace. */
  kinds: readonly NavigationTarget["kind"][];
}) => {
  const state = useContext(NavigationPinsContext);
  const { t } = useTranslation("web");
  const { failed, change } = usePinChange(state);
  const pins =
    state?.pins.filter(
      (pin) => pin.workspaceSlug === workspaceSlug && kinds.includes(pin.target.kind),
    ) ?? [];
  const currentPin = useCurrentPin(pins);

  if (!state || pins.length === 0) {
    return null;
  }

  return (
    <div className={styles.pinned}>
      <Disclosure
        title={t("pins.section")}
        count={pins.length}
        headingLevel={2}
        indent={false}
        defaultExpanded
      >
        <div className={styles.pinList}>
          {kinds.map((kind) => {
            const group = pins.filter((pin) => pin.target.kind === kind);
            return (
              group.length > 0 && (
                <PinGroup
                  key={kind}
                  kind={kind}
                  pins={group}
                  currentPin={currentPin}
                  busy={state.busy}
                  change={change}
                />
              )
            );
          })}
        </div>
        {failed && (
          <div className={styles.error}>
            <Notice tone="danger" appearance="inline" role="alert">
              {t("pins.saveError")}
            </Notice>
          </div>
        )}
      </Disclosure>
    </div>
  );
};

export const NavigationPinsStatus = () => {
  const state = useContext(NavigationPinsContext);
  const { t } = useTranslation("web");
  if (!state?.unavailable) {
    return null;
  }
  return (
    <div className={styles.error}>
      <Notice
        tone="danger"
        appearance="inline"
        role="status"
        actions={
          <Button variant="quiet" onPress={state.retry}>
            {t("pins.retry")}
          </Button>
        }
      >
        {t("pins.loadError")}
      </Notice>
    </div>
  );
};
