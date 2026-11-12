import type { ComponentProps } from "react";

import type { ReviewProps } from "../../contracts/reviews";
import { EditableReviewWork } from "./editable-review-work";
import { ReviewContent } from "./review-content";
import { ReviewOverview as ReviewOverviewContent } from "./review-overview";

export const ReviewWork = (props: ReviewProps) =>
  props.data ? (
    <EditableReviewWork {...props} data={props.data} />
  ) : (
    <ReviewContent
      application={props.application}
      round={props.round}
      selectedId={props.selectedId}
      onInspectVersion={props.onInspectVersion}
    />
  );

export const ReviewOverview = (props: ComponentProps<typeof ReviewOverviewContent>) => (
  <ReviewOverviewContent {...props} />
);
