import { useRef, useState } from "react";

import type { ReviewProblem, ReviewRequest } from "../../contracts/reviews";

export const useReviewRequest = ({
  onBegin,
  initiallyOpen = false,
  onClose,
}: {
  onBegin: () => ReviewRequest;
  initiallyOpen?: boolean;
  onClose?: () => void;
}) => {
  const [open, setOpen] = useState(initiallyOpen);
  const [request, setRequest] = useState<ReviewRequest | null>(() =>
    initiallyOpen ? onBegin() : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReviewProblem | null>(null);
  const busy = useRef(false);
  const [attempt, setAttempt] = useState<{ contactId: string; id: string } | null>(null);

  const choose = async (contactId: string | null) => {
    if (!contactId || !request || busy.current) {
      return;
    }

    busy.current = true;
    setPending(true);
    setError(null);
    // Reuse the command ID when retrying an uncertain response for the same person.
    const command =
      attempt?.contactId === contactId ? attempt : { contactId, id: crypto.randomUUID() };
    setAttempt(command);

    try {
      const failure = await request(contactId, command.id);
      if (failure) {
        setError(failure);
      } else {
        setOpen(false);
        onClose?.();
      }
    } catch {
      setError({ status: "unavailable" });
    }

    busy.current = false;
    setPending(false);
  };

  return {
    open,
    pending,
    error,
    attempt,
    choose,
    changeOpen: (next: boolean) => {
      setOpen(next);
      if (next) {
        setRequest(() => onBegin());
        setError(null);
        setAttempt(null);
      } else {
        onClose?.();
      }
    },
  };
};
