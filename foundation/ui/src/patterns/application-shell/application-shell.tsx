import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type MouseEvent,
} from "react";
import { Dialog, DialogTrigger } from "react-aria-components/Dialog";
import { Popover } from "react-aria-components/Popover";

import { ActionMenu } from "../../components/action-menu/action-menu";
import { Breadcrumbs } from "../../components/breadcrumbs/breadcrumbs";
import { Button } from "../../components/button/button";
import { ModalDialog } from "../../components/dialog/dialog";
import { Icon } from "../../components/icon/icon";
import { Notice } from "../../components/notice/notice";
import { PersonIdentity } from "../person-identity/person-identity";
import styles from "./application-shell.module.css";

const compactQuery = "(max-width: 600px)";

const subscribeViewport = (onChange: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const isCompactViewport = () => window.matchMedia(compactQuery).matches;

/** Whether a click inside the drawer is a plain click on a real link, which navigates away. */
const navigatesAway = (event: MouseEvent) => {
  const link = (event.target as Element).closest("a[href]");
  return (
    link &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    link.getAttribute("target") !== "_blank" &&
    link.getAttribute("aria-disabled") !== "true"
  );
};

const CloseNavigationContext = createContext<() => void>(() => {});

/**
 * Closes the mobile navigation drawer; does nothing on desktop. Navigation items that open
 * something over the page, such as Search, call it first, since React Aria buttons stop the
 * click the drawer would otherwise hear.
 */
export const useCloseNavigation = () => useContext(CloseNavigationContext);

/** Apps supply destinations and identity; the shell owns desktop and mobile navigation. */
export const ApplicationShell = ({
  brand,
  identity,
  contextLabel,
  navigation,
  navigationLabel,
  footer,
  utility,
  skipLabel,
  openNavigationLabel,
  closeNavigationLabel,
  children,
}: {
  brand: ReactNode;
  identity?: ReactNode;
  contextLabel: string;
  navigation: ReactNode;
  navigationLabel: string;
  footer?: ReactNode;
  utility?: ReactNode;
  skipLabel: string;
  openNavigationLabel: string;
  closeNavigationLabel: string;
  children: ReactNode;
}) => {
  const compact = useSyncExternalStore(subscribeViewport, isCompactViewport, () => false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!compact) {
      setOpen(false);
    }
  }, [compact]);

  const closeAfterLink = (event: MouseEvent) => {
    if (navigatesAway(event)) {
      setOpen(false);
      // Navigation owns focus after the drawer's focus scope has restored its trigger.
      requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
    }
  };

  const navigationContent = (
    <>
      <div>
        <div className={styles.brand}>{brand}</div>
        {identity}
      </div>
      <nav aria-label={navigationLabel} className={styles.nav}>
        {navigation}
      </nav>
      <div className={styles.sidebarBottom}>
        {footer}
        {!compact && utility}
      </div>
    </>
  );

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        {skipLabel}
      </a>
      <header className={styles.mobileHeader}>
        {compact && (
          <ModalDialog
            title={navigationLabel}
            closeLabel={closeNavigationLabel}
            placement="start"
            isDismissable
            isOpen={open}
            onOpenChange={setOpen}
            trigger={
              <Button variant="quiet" iconOnly aria-label={openNavigationLabel}>
                <Icon name="menu" />
              </Button>
            }
          >
            {/* Clicks bubble from real links, including keyboard activation; this wrapper is not a control. */}
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className={styles.drawerContent} onClick={closeAfterLink}>
              <CloseNavigationContext value={() => setOpen(false)}>
                {navigationContent}
              </CloseNavigationContext>
            </div>
          </ModalDialog>
        )}
        <span className={styles.mobileContext}>{contextLabel}</span>
        {compact && utility}
      </header>
      {!compact && <aside className={styles.sidebar}>{navigationContent}</aside>}
      <div className={styles.stage}>{children}</div>
    </div>
  );
};

const ContextIdentity = ({ name }: { name: string }) => (
  <>
    <span
      className={styles.workspaceAvatar}
      aria-hidden="true"
      data-initials={name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")}
    />
    <span className={styles.workspaceCopy} title={name}>
      {name}
    </span>
  </>
);

/** Content for a real workspace link. Set aria-current on the link to mark the active workspace. */
export const ApplicationContextOption = ({ name }: { name: string }) => (
  <>
    <ContextIdentity name={name} />
    <Icon name="check" className={styles.contextCheck} />
  </>
);

/** Keep the current work context in the same position, with real links for switching. */
export const ApplicationContext = ({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children?: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const compact = useSyncExternalStore(subscribeViewport, isCompactViewport, () => false);

  return children ? (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="quiet" className={styles.contextTrigger} aria-label={`${name}: ${label}`}>
        <ContextIdentity name={name} />
        <Icon name="down" />
      </Button>
      <Popover
        className={styles.contextPopover}
        placement="bottom start"
        offset={4}
        containerPadding={16}
        isNonModal={!compact}
      >
        <Dialog aria-label={label} className={styles.contextDialog}>
          {/* Clicks bubble from real links, including keyboard activation; this wrapper is not a control. */}
          {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className={styles.contextLinks}
            onClick={(event) => {
              const link = (event.target as Element).closest("a[href]");
              if (
                link &&
                event.button === 0 &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey &&
                link.getAttribute("target") !== "_blank"
              ) {
                setOpen(false);
              }
            }}
          >
            {children}
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  ) : (
    <div className={styles.workspace}>
      <ContextIdentity name={name} />
    </div>
  );
};

/** Identity stays stable while loading; only real sessions supply a sign-out action. */
export const ApplicationAccount = ({
  name,
  loadingLabel,
  menuLabel,
  signOut,
}: {
  name: string | null;
  loadingLabel: string;
  menuLabel: string;
  signOut?: {
    label: string;
    pendingLabel: string;
    errorMessage: string;
    run: () => Promise<unknown>;
  };
}) => {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const identity = name ? (
    <PersonIdentity name={name} />
  ) : (
    <span className={styles.accountLoading}>{loadingLabel}</span>
  );

  return (
    <div className={styles.account}>
      {name && signOut ? (
        <ActionMenu
          label={menuLabel}
          trigger={
            <Button
              variant="quiet"
              className={styles.accountTrigger}
              aria-label={`${name}: ${menuLabel}`}
              isPending={pending}
            >
              {pending ? signOut.pendingLabel : identity}
              <Icon name="down" />
            </Button>
          }
          items={[{ id: "sign-out", label: signOut.label }]}
          onAction={async () => {
            if (submitting.current) {
              return;
            }

            submitting.current = true;
            setPending(true);
            setFailed(false);

            try {
              await signOut.run();
            } catch {
              setFailed(true);
            }

            setPending(false);
            submitting.current = false;
          }}
        />
      ) : (
        <div className={styles.accountIdentity}>{identity}</div>
      )}
      {failed && signOut && (
        <Notice tone="danger" role="alert">
          {signOut.errorMessage}
        </Notice>
      )}
    </div>
  );
};

export const ApplicationPage = ({
  locationKey,
  breadcrumb,
  breadcrumbLabel,
  badge,
  contained = false,
  width = "standard",
  centered = false,
  children,
}: {
  locationKey: string;
  breadcrumb: readonly ReactNode[] | null;
  breadcrumbLabel: string;
  badge?: ReactNode;
  contained?: boolean;
  width?: "standard" | "full";
  centered?: boolean;
  children: ReactNode;
}) => {
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, [locationKey]);

  return (
    <>
      {(!!breadcrumb?.length || badge != null) && (
        <div className={styles.topbar}>
          {breadcrumb != null && <Breadcrumbs label={breadcrumbLabel} items={breadcrumb} />}
          {badge}
        </div>
      )}
      <main
        id="main"
        ref={main}
        tabIndex={-1}
        className={[
          styles.content,
          width === "full" && styles.wide,
          centered && styles.centered,
          contained && styles.contained,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </main>
    </>
  );
};

/** Full-page recovery when no usable work context remains. Apps supply a safe return destination. */
export const ApplicationRecovery = ({
  locationKey,
  returnLink,
  account,
  brand,
  children,
}: {
  locationKey: string;
  returnLink: ReactNode;
  account: ReactNode;
  brand: ReactNode;
  children: ReactNode;
}) => {
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, [locationKey]);

  return (
    <div className={styles.recovery}>
      <header className={styles.recoveryHeader}>
        <div className={styles.recoveryReturn}>{returnLink}</div>
        <div className={styles.recoveryAccount}>{account}</div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className={styles.recoveryContent}>
        <div className={styles.recoveryBrand} aria-hidden="true">
          {brand}
        </div>
        {children}
      </main>
    </div>
  );
};
