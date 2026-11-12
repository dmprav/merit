import { useRef, useState, type KeyboardEvent } from "react";

import { Button } from "../../components/button/button";
import { Icon } from "../../components/icon/icon";
import { Tooltip } from "../../components/tooltip/tooltip";
import styles from "./inline-name.module.css";

type InlineNameProps = {
  value: string;
  label: string;
  saveLabel: string;
  cancelLabel: string;
  errorMessage: string;
  onSave: (value: string) => Promise<string | null>;
  isDisabled?: boolean;
};

/** A heading-sized editor. Leaving the field keeps the draft; Escape cancels it. */
export const InlineName = ({
  value,
  label,
  saveLabel,
  cancelLabel,
  errorMessage,
  onSave,
  isDisabled = false,
}: InlineNameProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveAtOpen = useRef(onSave);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = () => {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  const save = async () => {
    if (pending || !draft.trim()) {
      return;
    }
    if (draft.trim() === value) {
      close();
      return;
    }

    setPending(true);

    try {
      const failure = await saveAtOpen.current(draft.trim());
      setError(failure);
      if (!failure) {
        close();
      }
    } catch {
      setError(errorMessage);
    } finally {
      setPending(false);
    }
  };

  return editing ? (
    <span
      className={styles.editor}
      style={{ width: `calc(${Math.max(20, Math.min(40, draft.length + 2))}ch + 4.5rem)` }}
      data-inline-name-editor
      aria-busy={pending}
    >
      <input
        autoFocus
        aria-label={label}
        value={draft}
        maxLength={200}
        disabled={pending}
        className={styles.input}
        aria-invalid={Boolean(error)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => handleNameKey(event, pending, close, save)}
      />
      <InlineNameActions
        saveLabel={saveLabel}
        cancelLabel={cancelLabel}
        pending={pending}
        saveDisabled={pending || !draft.trim()}
        save={save}
        close={close}
      />
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </span>
  ) : (
    <Button
      ref={trigger}
      variant="quiet"
      className={styles.trigger}
      aria-label={value}
      aria-description={label}
      isDisabled={isDisabled}
      onPress={() => {
        saveAtOpen.current = onSave;
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
      <Icon name="edit" />
    </Button>
  );
};

const InlineNameActions = ({
  saveLabel,
  cancelLabel,
  pending,
  saveDisabled,
  save,
  close,
}: Pick<InlineNameProps, "saveLabel" | "cancelLabel"> & {
  pending: boolean;
  saveDisabled: boolean;
  save: () => Promise<void>;
  close: () => void;
}) => (
  <span className={styles.actions}>
    <Tooltip content={saveLabel}>
      <Button
        size="small"
        variant="quiet"
        iconOnly
        aria-label={saveLabel}
        isDisabled={saveDisabled}
        onPress={() => void save()}
      >
        <Icon name="check" />
      </Button>
    </Tooltip>
    <Tooltip content={cancelLabel}>
      <Button
        size="small"
        variant="quiet"
        iconOnly
        aria-label={cancelLabel}
        isDisabled={pending}
        onPress={close}
      >
        <Icon name="close" />
      </Button>
    </Tooltip>
  </span>
);

const handleNameKey = (
  event: KeyboardEvent<HTMLInputElement>,
  pending: boolean,
  close: () => void,
  save: () => Promise<void>,
) => {
  if (event.nativeEvent.isComposing) {
    return;
  }

  if (event.key === "Escape" && !pending) {
    event.preventDefault();
    close();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    void save();
  }
};
