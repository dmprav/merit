import { createContext, useContext, useRef, useState, type ReactNode, type Ref } from "react";

import styles from "./application-shell.module.css";

type NavigationDropTarget = { id: string; position: "before" | "after" };

type NavigationReorder = {
  dragging: string | null;
  setDragging: (id: string | null) => void;
  dropTarget: NavigationDropTarget | null;
  setDropTarget: (target: NavigationDropTarget | null) => void;
};

const NavigationReorderContext = createContext<NavigationReorder | null>(null);

/** Pointer reordering stays inside this list. Supply a menu action for keyboard and touch. */
export const ApplicationNavigationList = ({
  onMove,
  appearance = "sidebar",
  isDisabled = false,
  children,
  ...props
}: {
  children: ReactNode;
  ref?: Ref<HTMLUListElement>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onMove: (id: string, target: string, position: "before" | "after") => void;
  isDisabled?: boolean;
  appearance?: "sidebar" | "popup";
}) => {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<NavigationDropTarget | null>(null);
  const lastTarget = useRef<NavigationDropTarget | null>(null);

  const chooseTarget = (target: NavigationDropTarget | null) => {
    lastTarget.current = target;
    setDropTarget(target);
  };

  return (
    <NavigationReorderContext
      value={isDisabled ? null : { dragging, setDragging, dropTarget, setDropTarget: chooseTarget }}
    >
      <ul
        {...props}
        className={styles.navigationList}
        data-appearance={appearance}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            chooseTarget(null);
          }
        }}
        onDrop={(event) => {
          // Firefox can target the list itself after a row moves; retain the accepted insertion point.
          const target = lastTarget.current;
          if (!isDisabled && dragging && target) {
            event.preventDefault();
            onMove(dragging, target.id, target.position);
          }
          setDragging(null);
          chooseTarget(null);
        }}
      >
        {children}
      </ul>
    </NavigationReorderContext>
  );
};

/** A navigation link with secondary actions; reorderable rows are direct list items. */
export const ApplicationNavigationRow = ({
  children,
  action,
  reorderKey,
}: {
  children: ReactNode;
  action: ReactNode;
  /** Stable identity within ApplicationNavigationList; links retain their ordinary click behavior. */
  reorderKey: string;
}) => {
  const reorder = useContext(NavigationReorderContext);
  const canDrop = reorder?.dragging && reorder.dragging !== reorderKey;
  return (
    <li
      className={styles.navigationRow}
      draggable={Boolean(reorder)}
      data-drop-position={
        canDrop && reorder?.dropTarget?.id === reorderKey ? reorder.dropTarget?.position : undefined
      }
      onDragStart={(event) => {
        if (!reorder || (event.target as Element).closest("button")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.clearData();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-merit-navigation", reorderKey);
        reorder.setDragging(reorderKey);
      }}
      onDragEnd={() => {
        reorder?.setDragging(null);
        reorder?.setDropTarget(null);
      }}
      onDragOver={(event) => {
        if (canDrop) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const bounds = event.currentTarget.getBoundingClientRect();
          reorder.setDropTarget({
            id: reorderKey,
            position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
          });
        } else {
          reorder?.setDropTarget(null);
        }
      }}
    >
      {children}
      <span className={styles.navigationAction}>{action}</span>
    </li>
  );
};
