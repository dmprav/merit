import { useTranslation } from "react-i18next";

import type { AiReviewEntry } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { Inline } from "@merit/ui/layout";
import { Text } from "@merit/ui/text";

type Comparison = AiReviewEntry["basisComparison"];

/** The short qualifications of what the AI review was based on, as separate spans. */
export const AiReviewBasis = ({ review }: { review: AiReviewEntry }) => {
  const { t } = useTranslation(["aiReview", "reviewGrant", "reviews"]);
  const { basisComparison: basis } = review;
  if (review.freshness === "current") {
    return (
      <span>
        {t("reviewGrant:workspace.reviewedBasis", { version: review.applicationVersion })}
      </span>
    );
  }
  return (
    <>
      {basis.applicationVersion === "different" && (
        <span>{t("reviewGrant:workspace.earlierBasis")}</span>
      )}
      {basis.criteriaContent === "different" && <span>{t("aiReview:criteriaChanged")}</span>}
      <UnknownBasis basis={basis} />
    </>
  );
};

const UnknownBasis = ({ basis }: { basis: Comparison }) => {
  const { t } = useTranslation("reviews");
  if (basis.applicationVersion !== "unknown" && basis.criteriaContent !== "unknown") {
    return null;
  }
  return (
    <span>
      {t(
        basis.applicationVersion === "unknown" && basis.criteriaContent === "unknown"
          ? "basisUnknown"
          : basis.applicationVersion === "unknown"
            ? "applicationBasisUnknown"
            : "criteriaBasisUnknown",
      )}
    </span>
  );
};

/** Says when an AI review no longer matches the application or criteria, and offers the comparison. */
export const AiReviewBasisNotice = ({
  review,
  onInspectVersion,
}: {
  review: AiReviewEntry;
  onInspectVersion?: (version: number) => void;
}) => {
  const { t } = useTranslation(["aiReview", "reviews"]);
  const { basisComparison: basis } = review;
  if (review.freshness === "current") {
    return null;
  }
  return (
    <Text as="div" variant="caption">
      <Inline>
        {basis.applicationVersion === "different" && (
          <>
            <span>{t("reviews:earlierSubmission")}</span>
            {onInspectVersion && (
              <Button variant="quiet" onPress={() => onInspectVersion(review.applicationVersion)}>
                {t("reviews:compareChanges")}
              </Button>
            )}
          </>
        )}
        {basis.criteriaContent === "different" && <span>{t("aiReview:criteriaChanged")}</span>}
        <UnknownBasis basis={basis} />
      </Inline>
    </Text>
  );
};
