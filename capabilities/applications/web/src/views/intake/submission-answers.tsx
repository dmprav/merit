import type { ApplicationView } from "@merit/grantmaking/api";
import { Reading } from "@merit/ui/layout";

import styles from "./intake-content.module.css";

/** Shared reading of authorized applicant material; callers own the source and heading. */
export const SubmissionAnswers = ({
  answers,
  headingLevel = 3,
}: {
  answers: NonNullable<ApplicationView["submission"]>["answers"];
  headingLevel?: 3 | 4 | 5;
}) => {
  const Heading = `h${headingLevel}` as const;
  return (
    <>
      {answers.map((answer) => (
        <section key={answer.questionId} className={styles.evidenceSection}>
          {answer.question && <Heading>{answer.question}</Heading>}
          <Reading as="p" className={styles.prose}>
            {answer.response}
          </Reading>
        </section>
      ))}
    </>
  );
};
