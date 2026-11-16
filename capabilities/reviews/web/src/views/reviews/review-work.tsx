import type { ReactNode } from "react";

import type { ReviewProps, ReviewApplication } from "../../contracts/reviews";
import { EditableReviewWork } from "./editable-review-work";
import { ReviewContent } from "./review-content";
import { useReviewReading, type ReviewReading } from "./use-review-reading";

export { ReviewOverview } from "./review-overview";

export type ReviewWorkspace = {
  content: (onInspectVersion?: (version: ReviewApplication["version"]) => void) => ReactNode;
  reading: Pick<ReviewReading, "openReview" | "showAll" | "registerTrigger">;
  editor: ReactNode;
  feedback?: ReactNode;
  active: boolean;
  fill?: boolean;
  editorTitle?: string;
  editorCloseAction?: ReactNode;
  actions?: ReactNode;
};

export type ReviewWorkProps = ReviewProps & {
  children?: (workspace: ReviewWorkspace) => ReactNode;
  disabled?: boolean;
};

export const ReviewWork = (props: ReviewWorkProps) => {
  const reading = useReviewReading(props.selectedId);
  return props.data ? (
    <EditableReviewWork {...props} data={props.data} reading={reading} />
  ) : props.children ? (
    props.children({
      editor: null,
      active: false,
      reading,
      content: (onInspectVersion) => (
        <ReviewContent
          {...props}
          reading={reading}
          onInspectVersion={onInspectVersion ?? props.onInspectVersion}
        />
      ),
    })
  ) : (
    <ReviewContent
      application={props.application}
      round={props.round}
      reading={reading}
      onInspectVersion={props.onInspectVersion}
    />
  );
};
