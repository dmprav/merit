import { Link, useLocation, type LinkOptions } from "@tanstack/react-router";
import { useContext, useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import type { NavigationPin, NavigationPinChange, NavigationTarget } from "@merit/grantmaking/api";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";

import { resourceRef } from "../grantmaking/contracts/resource-url";
import { NavigationPinsContext } from "./context";
import styles from "./navigation.module.css";

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

type NavigationSectionProps = {
  title: string;
  kind: NavigationTarget["kind"];
  workspaceSlug?: string;
  location: LinkOptions;
  icon: ComponentProps<typeof Icon>["name"];
};

export const NavigationSection = ({
  title,
  kind,
  workspaceSlug,
  location,
  icon,
}: NavigationSectionProps) => {
  const { t } = useTranslation("web");
  const state = useContext(NavigationPinsContext);
  const pathname = useLocation({ select: (location) => location.pathname });
  const collection = useRef<HTMLAnchorElement>(null);
  const [error, setError] = useState(false);
  const pins =
    state?.pins.filter((pin) => pin.target.kind === kind && pin.workspaceSlug === workspaceSlug) ??
    [];
  const segment = kind === "review" ? "work" : kind === "round" ? "rounds" : "applications";
  const currentPin = pathname.includes(`/${segment}/`)
    ? pins.find((pin) => pathname.replace(/\/$/, "").endsWith(pin.target.id))
    : undefined;

  const change = async (input: NavigationPinChange) => {
    setError(false);
    const saved = await state?.change(input);
    setError(!saved);
    if (saved && input.action === "unpin") {
      collection.current?.focus();
    }
  };

  return (
    <section aria-label={title} className={styles.section}>
      <Link
        {...location}
        ref={collection}
        activeOptions={{ exact: Boolean(currentPin), includeSearch: false }}
      >
        <Icon name={icon} />
        {title}
      </Link>
      {pins.length > 0 && (
        <ul className={styles.pins}>
          {pins.map((pin, index) => (
            <li key={pin.target.id} className={styles.pin}>
              <Link
                {...pinLocation(pin)}
                aria-current={pin === currentPin ? "page" : undefined}
                activeOptions={{ includeSearch: false }}
                aria-label={pin.context ? `${pin.title} · ${pin.context}` : pin.title}
                title={pin.context ? `${pin.title} · ${pin.context}` : pin.title}
              >
                <span className={styles.pinLabel}>
                  <span>{pin.title}</span>
                  {pin.context && <small>{pin.context}</small>}
                </span>
              </Link>
              <ActionMenu
                label={t("pins.actions", { title: pin.title })}
                trigger={
                  <Button
                    variant="quiet"
                    size="small"
                    iconOnly
                    aria-label={t("pins.actions", { title: pin.title })}
                    isDisabled={state?.busy}
                  >
                    <Icon name="more" />
                  </Button>
                }
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
                            action === "up"
                              ? pins[index - 1]!.target
                              : (pins[index + 2]?.target ?? null),
                        },
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      {error && (
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
