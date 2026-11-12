import type { ReactNode } from "react";

import { Avatar } from "../../components/avatar/avatar";
import styles from "./person-identity.module.css";

/** A visible name with decorative initials. Links and person-specific metadata belong to callers. */
export const PersonIdentity = ({
  name,
  description,
  nameAs: Name = "span",
  className = "",
}: {
  name: string;
  description?: ReactNode;
  nameAs?: "span" | "h2" | "h3";
  className?: string;
}) => {
  const Container = Name === "span" ? "span" : "div";

  return (
    <Container className={`${styles.identity} ${className}`} data-detailed={description != null}>
      <Avatar name={name} size={description != null || Name !== "span" ? "regular" : "compact"} />
      <Container className={styles.copy}>
        <Name className={styles.name}>{name}</Name>
        {description != null && <span className={styles.description}>{description}</span>}
      </Container>
    </Container>
  );
};
