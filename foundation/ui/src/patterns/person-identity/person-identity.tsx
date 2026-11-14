import type { ReactNode } from "react";

import { Avatar } from "../../components/avatar/avatar";
import styles from "./person-identity.module.css";

/** A visible name with decorative initials. Links and person-specific metadata belong to callers. */
export const PersonIdentity = ({
  name,
  description,
  annotation,
  status,
  nameAs: Name = "span",
  className = "",
}: {
  name: string;
  description?: ReactNode;
  /** Short identity qualifier, such as “You”; workflow status belongs outside the identity. */
  annotation?: string;
  /** A visible account status badge beside the name; the caller owns its meaning and tone. */
  status?: ReactNode;
  nameAs?: "span" | "h2" | "h3";
  className?: string;
}) => {
  const Container = Name === "span" ? "span" : "div";

  return (
    <Container className={`${styles.identity} ${className}`} data-detailed={description != null}>
      <Avatar name={name} size={description != null || Name !== "span" ? "regular" : "compact"} />
      <Container className={styles.copy}>
        <Container className={styles.nameLine}>
          <Name className={styles.name}>{name}</Name>
          {annotation && <span className={styles.annotation}>{annotation}</span>}
          {status}
        </Container>
        {description != null && <span className={styles.description}>{description}</span>}
      </Container>
    </Container>
  );
};
