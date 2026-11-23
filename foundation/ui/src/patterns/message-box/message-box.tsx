import { useEffect, useId, useLayoutEffect, useRef, type RefObject } from "react";
import {
  TextField as AriaTextField,
  TextArea,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components/TextField";

import { ButtonBase } from "../../components/button/button-base";
import { ChipBase } from "../../components/chip/chip-base";
import { FieldFeedback, FieldLabel } from "../../components/fields/field-parts";
import fieldStyles from "../../components/fields/field.module.css";
import inputStyles from "../../components/fields/input.module.css";
import { IconBase } from "../../components/icon/icon-base";
import styles from "./message-box.module.css";

type KeyboardHandler = NonNullable<AriaTextFieldProps["onKeyDown"]>;

type MessageBoxProps = {
  /** Names the input. */
  label: string;
  /** Another visible element already names the box. The label stays its accessible name. */
  isLabelHidden?: boolean;
  placeholder?: string;
  /** One line of help below the box, connected to the input for assistive technology. */
  description?: string;
  /** The caller owns the text and clears it after sending. */
  value: string;
  onChange: (value: string) => void;
  sendLabel: string;
  /** Receives the text as typed. Called only for a message with visible characters. */
  onSend: (text: string) => void;
  /** Replaces Send with Stop while the caller is working on the last message. */
  isBusy?: boolean;
  /** Keeps Send inactive without offering Stop, for work the person cannot stop. */
  isSendDisabled?: boolean;
  stopLabel: string;
  onStop: () => void;
  /** Removable items attached to the message, shown above the input. */
  chips?: readonly { id: string; label: string; removeLabel: string; onRemove: () => void }[];
  autoFocus?: boolean;
};

const MessageBoxChips = ({
  chips,
  input,
}: Pick<MessageBoxProps, "chips"> & { input: RefObject<HTMLTextAreaElement | null> }) => {
  const row = useRef<HTMLDivElement>(null);
  const focusAfterRemoval = useRef<number | null>(null);

  // A removed chip leaves focus where the next one now is, or in the input once none remain.
  useEffect(() => {
    const index = focusAfterRemoval.current;
    if (index == null) {
      return;
    }
    focusAfterRemoval.current = null;
    const remaining = row.current?.querySelectorAll<HTMLElement>("[data-chip]") ?? [];
    (remaining[index] ?? remaining[remaining.length - 1] ?? input.current)?.focus();
  });

  return chips?.length ? (
    <div className={styles.chips} ref={row}>
      {chips.map((chip, index) => (
        <ChipBase
          key={chip.id}
          truncate
          label={chip.label}
          removeLabel={chip.removeLabel}
          onRemove={() => {
            focusAfterRemoval.current = index;
            chip.onRemove();
          }}
        />
      ))}
    </div>
  ) : null;
};

/** Stop hands its focus to the input when it leaves because the work ended without it. */
const StopButton = ({
  label,
  input,
  onPress,
}: {
  label: string;
  input: RefObject<HTMLTextAreaElement | null>;
  onPress: () => void;
}) => {
  const button = useRef<HTMLButtonElement>(null);

  // A cleanup runs before the button leaves the page, while focus can still be read.
  useLayoutEffect(() => {
    const element = button.current;
    const field = input.current;
    return () => {
      if (element && document.activeElement === element) {
        field?.focus();
      }
    };
  }, [input]);

  return (
    <ButtonBase ref={button} variant="secondary" size="small" onPress={onPress}>
      {label}
    </ButtonBase>
  );
};

/**
 * Compose a message to send, with a growing input, Enter to send, optional attachments, and a
 * Stop control while the caller is busy. The caller supplies all copy, sends the text, and clears
 * the box.
 */
export const MessageBox = ({
  label,
  isLabelHidden,
  placeholder,
  description,
  value,
  onChange,
  sendLabel,
  onSend,
  isBusy = false,
  isSendDisabled = false,
  stopLabel,
  onStop,
  chips,
  autoFocus,
}: MessageBoxProps) => {
  const descriptionId = useId();
  const input = useGrowingHeight(value);
  const canSend = value.trim() !== "" && !isSendDisabled;

  const send = () => {
    if (canSend && !isBusy) {
      onSend(value);
    }
  };

  const handleKeyDown: KeyboardHandler = (event) => {
    const { isComposing, keyCode } = event.nativeEvent;
    // Safari ends composition before the Enter that confirms it; it reports keyCode 229.
    if (event.key !== "Enter" || event.shiftKey || isComposing || keyCode === 229) {
      // React Aria stops keys it is given a handler for; the surrounding panel still hears them.
      event.continuePropagation();
      return;
    }
    event.preventDefault();
    send();
  };

  return (
    <AriaTextField
      className={fieldStyles.field}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      autoFocus={autoFocus}
      aria-describedby={description ? descriptionId : undefined}
    >
      <FieldLabel isHidden={isLabelHidden}>{label}</FieldLabel>
      <div className={`${inputStyles.inputGroup} ${styles.box}`}>
        <MessageBoxChips chips={chips} input={input} />
        <div className={styles.compose}>
          <TextArea
            ref={input}
            rows={1}
            placeholder={placeholder}
            className={`${inputStyles.input} ${styles.input}`}
          />
          {isBusy ? (
            <StopButton
              label={stopLabel}
              input={input}
              onPress={() => {
                onStop();
                input.current?.focus();
              }}
            />
          ) : (
            <ButtonBase
              variant="primary"
              size="small"
              iconOnly
              aria-label={sendLabel}
              isDisabled={!canSend}
              onPress={() => {
                send();
                input.current?.focus();
              }}
            >
              <IconBase name="send" />
            </ButtonBase>
          )}
        </div>
      </div>
      <FieldFeedback description={description} descriptionId={descriptionId} />
    </AriaTextField>
  );
};

/** Fits the input to its text; the stylesheet caps the height, after which it scrolls. */
const useGrowingHeight = (value: string) => {
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = input.current;
    if (!element) {
      return;
    }

    const fit = () => {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    };

    fit();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    // A change of width rewraps the text.
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        fit();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);

  return input;
};
