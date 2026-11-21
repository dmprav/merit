import type { ApplicationView } from "@merit/grantmaking/api";
import { Reading } from "@merit/ui/layout";
import { SectionHeader } from "@merit/ui/section-header";

import styles from "./intake-content.module.css";

/** Shared reading of authorized applicant material; callers own the source and heading. */
export const SubmissionAnswers = ({
  answers,
  headingLevel = 3,
}: {
  answers: NonNullable<ApplicationView["submission"]>["answers"];
  headingLevel?: 3 | 4 | 5;
}) => {
  return (
    <>
      {answers.map((answer) => (
        <section key={answer.questionId} className={styles.evidenceSection}>
          {answer.question && <SectionHeader level={headingLevel} title={answer.question} />}
          <Reading as="p">{answer.response}</Reading>
        </section>
      ))}
    </>
  );
};
