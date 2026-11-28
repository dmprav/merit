import { useTranslation } from "react-i18next";

import { reviewFreshness, type ReviewBasisComparison } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { Inline } from "@merit/ui/layout";
import { Text } from "@merit/ui/text";

/** Says what in the basis a person cannot tell, with the one sentence that fits what was compared. */
export const UnknownBasis = ({ basis }: { basis: ReviewBasisComparison }) => {
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

/**
 * Says when a recorded judgment no longer matches the application or the criteria, and offers the
 * comparison. Assessments and AI reviews share it; each names what it is in `criteriaChanged`.
 */
export const ReviewBasisNotice = ({
  basis,
  criteriaChanged,
  onCompare,
}: {
  basis: ReviewBasisComparison;
  criteriaChanged: string;
  onCompare?: () => void;
}) => {
  const { t } = useTranslation("reviews");
  if (reviewFreshness(basis) === "current") {
    return null;
  }
  return (
    <Text as="div" variant="caption">
      <Inline>
        {basis.applicationVersion === "different" && (
          <>
            <span>{t("earlierSubmission")}</span>
            {onCompare && (
              <Button variant="quiet" onPress={onCompare}>
                {t("compareChanges")}
              </Button>
            )}
          </>
        )}
        {basis.criteriaContent === "different" && <span>{criteriaChanged}</span>}
        <UnknownBasis basis={basis} />
      </Inline>
    </Text>
  );
};
