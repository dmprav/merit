import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";

import { ButtonBase } from "../../components/button/button-base";
import { IconBase } from "../../components/icon/icon-base";
import { LoadingIconBase } from "../../components/icon/loading-icon-base";
import { VisuallyHidden } from "../../components/visually-hidden/visually-hidden";
import styles from "./inline-name.module.css";

type InlineNameProps = {
  value: string;
  label: string;
  errorMessage: string;
  onSave: (value: string) => Promise<string | null>;
  isDisabled?: boolean;
  isPreparing?: boolean;
};

/**
 * A heading-sized editor that takes exactly the box of the name it replaces. Enter or leaving the
 * field saves; Escape reverts. An unchanged or empty name reverts without saving.
 */
export const InlineName = ({
  value,
  label,
  errorMessage,
  onSave,
  isDisabled = false,
  isPreparing = false,
}: InlineNameProps) => {
  const { t } = useTranslation("common");
  const errorId = useId();
  const { editing, draft, setDraft, pending, error, trigger, field, onKeyDown, onBlur, open } =
    useNameEditing({ value, onSave, errorMessage, isPreparing, isDisabled });

  if (!editing) {
    return (
      <ButtonBase
        ref={trigger}
        variant="quiet"
        className={styles.trigger}
        aria-label={value}
        aria-description={label}
        isDisabled={isDisabled}
        onPress={open}
      >
        <span className={styles.text}>{value}</span>
        <span className={styles.slot}>
          <IconBase name="edit" />
        </span>
      </ButtonBase>
    );
  }

  const busy = pending || isPreparing;

  return (
    <span className={styles.editor} data-inline-name-editor>
      {/* Sizes the editor to its text, so the box never changes between reading and editing. */}
      <span className={styles.mirror} aria-hidden="true">
        {draft || value}
      </span>
      <textarea
        ref={field}
        rows={1}
        autoFocus
        aria-label={label}
        value={draft}
        maxLength={200}
        readOnly={busy}
        className={styles.input}
        aria-busy={busy}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        // A name is one line of text that wraps; pasted line breaks become spaces.
        onChange={(event) => setDraft(event.target.value.replace(/\s*[\r\n]+\s*/g, " "))}
        onKeyDown={(event) => onKeyDown(event)}
        onBlur={() => onBlur()}
      />
      <NameSlot busy={busy} failed={Boolean(error)} />
      {isPreparing && (
        <span role="status">
          <VisuallyHidden>{t("editorPreparing")}</VisuallyHidden>
        </span>
      )}
      {error && (
        <span role="alert" id={errorId} className={styles.error}>
          {error}
        </span>
      )}
    </span>
  );
};

const useNameEditing = ({
  value,
  onSave,
  errorMessage,
  isPreparing,
  isDisabled,
}: Pick<InlineNameProps, "value" | "onSave" | "errorMessage" | "isPreparing" | "isDisabled">) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveAtOpen = useRef(onSave);
  const awaitingPreparation = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const requestTriggerFocus = useTriggerFocus(trigger);
  const saving = useRef(false);

  useLayoutEffect(() => {
    if (editing && !isPreparing && awaitingPreparation.current) {
      setDraft(value);
      saveAtOpen.current = onSave;
      awaitingPreparation.current = false;
      if (isDisabled) {
        setEditing(false);
      }
    }
  }, [editing, isPreparing, isDisabled, onSave, value]);

  /** Leaves the editor; focus returns to the name unless the person already moved elsewhere. */
  const close = (restore: boolean) => {
    requestTriggerFocus(restore);
    setEditing(false);
    setError(null);
  };

  const save = async (restore: boolean) => {
    if (saving.current) {
      return;
    }
    // Nothing can be saved while the editor is still preparing; leaving it just closes.
    if (isPreparing) {
      if (!restore) {
        close(false);
      }
      return;
    }
    const next = draft.trim();
    if (!next || next === value) {
      close(restore);
      return;
    }

    saving.current = true;
    setPending(true);

    let failure: string | null;
    try {
      failure = await saveAtOpen.current(next);
    } catch {
      failure = errorMessage;
    }
    saving.current = false;
    setPending(false);
    setError(failure);
    // A failure keeps the editor open with its draft; focus stays wherever the person has it.
    if (!failure) {
      // A save that resolves after the person moved on must not pull focus back.
      const active = document.activeElement;
      close(restore && (!active || active === document.body || active === field.current));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) =>
    handleNameKey(event, {
      revert: () => {
        if (!saving.current) {
          close(true);
        }
      },
      save: () => void save(true),
    });

  const onBlur = () => void save(false);

  return {
    editing,
    draft,
    setDraft,
    pending,
    error,
    trigger,
    field,
    onKeyDown,
    onBlur,
    open: () => {
      awaitingPreparation.current = Boolean(isPreparing);
      saveAtOpen.current = onSave;
      setDraft(value);
      setEditing(true);
    },
  };
};

/** Returns focus to the name after the editor closes, once the name is back in the page. */
const useTriggerFocus = (trigger: RefObject<HTMLButtonElement | null>) => {
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current && trigger.current) {
      trigger.current.focus();
      restoreFocus.current = false;
    }
  });
  return (restore: boolean) => {
    restoreFocus.current = restore;
  };
};

const handleNameKey = (
  event: KeyboardEvent<HTMLTextAreaElement>,
  actions: { revert: () => void; save: () => void },
) => {
  if (event.nativeEvent.isComposing) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    actions.revert();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    actions.save();
  }
};

/** The trailing icon slot: the pencil at rest, a spinner while busy, the failure glyph on error. */
const NameSlot = ({ busy, failed }: { busy: boolean; failed: boolean }) => (
  <span className={styles.slot} data-state={slotState(busy, failed)}>
    {busy && <LoadingIconBase />}
    {!busy && <IconBase name={failed ? "failure" : "edit"} />}
  </span>
);

const slotState = (busy: boolean, failed: boolean) => {
  if (busy) {
    return "busy";
  }
  return failed ? "error" : "idle";
};
