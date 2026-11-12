import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

import { ActionMenu } from "../../components/action-menu/action-menu";
import { Button } from "../../components/button/button";
import { Icon } from "../../components/icon/icon";
import styles from "./reference-workspace.module.css";

/** Matches the stylesheet breakpoint where the panes stack and the document scrolls. */
export const stackedPanesQuery = "(max-width: 900px), (max-height: 599px)";

const WorkspaceContext = createContext<{ id: string; toReferenceLabel?: string } | null>(null);

const useWorkspace = () => {
  const workspace = use(WorkspaceContext);
  if (!workspace) {
    throw new Error("Reference and work panes must be placed inside ReferenceWorkspace.");
  }
  return workspace;
};

/**
 * Frames sustained work beside reference material. Place it in a contained
 * `ApplicationPage`: on desktop the header stays put and each pane scrolls on its own;
 * narrow screens stack the panes with links between them. Supply a `ReferencePane`
 * and a `WorkPane`, or a `WorkPane` alone when no reference material is available.
 */
export const ReferenceWorkspace = ({
  header,
  toWorkLabel,
  toReferenceLabel,
  after,
  children,
}: {
  /** Usually a compact `PageHeader`; it is inset to align with the panes. */
  header?: ReactNode;
  /** Names the link from the top of stacked panes to the work pane. */
  toWorkLabel?: string;
  /** Names the link from the work pane back to stacked reference material. */
  toReferenceLabel?: string;
  /** Content outside both panes, such as feedback announced for the whole page. */
  after?: ReactNode;
  children: ReactNode;
}) => {
  const id = useId();
  return (
    <WorkspaceContext value={{ id, toReferenceLabel }}>
      <div className={styles.view}>
        {header && <div className={styles.header}>{header}</div>}
        {toWorkLabel && (
          <a className={styles.jump} href={`${"#"}${id}-work`}>
            {toWorkLabel}
            <Icon name="down" />
          </a>
        )}
        <div className={styles.workspace}>{children}</div>
        {after}
      </div>
    </WorkspaceContext>
  );
};

/** The reading side. The scroll viewport is keyboard-focusable and named by `label`. */
export const ReferencePane = ({
  label,
  toolbar,
  viewportRef,
  children,
}: {
  label: string;
  /** Persistent controls above the scrolling content, such as a `ReferenceSwitcher`. */
  toolbar?: ReactNode;
  viewportRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) => {
  const { id } = useWorkspace();
  return (
    <div className={styles.reference} id={`${id}-reference`}>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
      <div
        className={styles.content}
        ref={viewportRef}
        tabIndex={0}
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * The working side. A `title` adds a pane header with optional `titleActions`.
 * Use `fill` when the child owns its scrolling and actions, such as a `Form`;
 * otherwise the pane scrolls and an optional `footer` keeps actions in reach.
 */
export const WorkPane = ({
  label,
  as: Element = "aside",
  title,
  titleRef,
  titleActions,
  footer,
  fill = false,
  children,
}: {
  label: string;
  /** Use `section` when the work is the page's main task rather than supporting it. */
  as?: "aside" | "section";
  title?: ReactNode;
  titleRef?: Ref<HTMLHeadingElement>;
  titleActions?: ReactNode;
  footer?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) => {
  const { id, toReferenceLabel } = useWorkspace();
  return (
    <Element id={`${id}-work`} className={styles.work} aria-label={label}>
      {toReferenceLabel && (
        <a className={styles.jump} href={`${"#"}${id}-reference`}>
          {toReferenceLabel}
          <Icon name="ascending" />
        </a>
      )}
      {title && (
        <div className={styles.toolbar} data-title>
          <h2 ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          {titleActions}
        </div>
      )}
      <div
        className={styles.content}
        data-fill={fill || undefined}
        tabIndex={fill ? undefined : 0}
        role="group"
        aria-label={label}
      >
        {children}
      </div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </Element>
  );
};

/** Chooses which reference material the reference pane shows. */
export const ReferenceSwitcher = <Key extends string>({
  label,
  triggerLabel,
  options,
  selected,
  onChange,
  triggerRef,
}: {
  label: string;
  /** Names the trigger together with the current choice, such as "Reference material: Guidelines". */
  triggerLabel: string;
  options: Record<Key, string>;
  selected: Key;
  onChange: (next: Key) => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) => (
  <>
    <span className={styles.meta}>{label}</span>
    <ActionMenu
      label={label}
      trigger={
        <Button ref={triggerRef} variant="quiet" size="small" aria-label={triggerLabel}>
          {options[selected]}
          <Icon name="down" />
        </Button>
      }
      items={(Object.entries(options) as [Key, string][]).map(([id, name]) => ({
        id,
        label: name,
      }))}
      onAction={(next) => onChange(next as Key)}
    />
  </>
);

/**
 * Tracks the chosen reference and restores each one's scroll position when
 * people return to it. `moveReference` focuses the viewport unless called with
 * `focusViewport: false`, such as while an editor beside it keeps focus.
 */
export const useReferenceViewport = <Key extends string>(initial: Key) => {
  const [reference, setReference] = useState<Key>(initial);
  const referenceViewport = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Partial<Record<Key, number>>>({});
  const referenceFrame = useRef<number | null>(null);

  const moveReference = (next: Key, { focusViewport = true } = {}) => {
    scrollPositions.current[reference] = referenceViewport.current?.scrollTop ?? 0;
    setReference(next);
    if (referenceFrame.current !== null) {
      cancelAnimationFrame(referenceFrame.current);
    }
    referenceFrame.current = requestAnimationFrame(() => {
      referenceFrame.current = null;
      if (referenceViewport.current) {
        referenceViewport.current.scrollTop = scrollPositions.current[next] ?? 0;
      }
      if (focusViewport) {
        referenceViewport.current?.focus({ preventScroll: true });
      }
      if (window.matchMedia(stackedPanesQuery).matches) {
        referenceViewport.current?.scrollIntoView({ block: "start" });
      }
    });
  };

  useEffect(
    () => () => {
      if (referenceFrame.current !== null) {
        cancelAnimationFrame(referenceFrame.current);
      }
    },
    [],
  );

  return {
    reference,
    referenceViewport,
    moveReference,
    resetScroll: (target: Key) => {
      scrollPositions.current[target] = 0;
    },
  };
};
