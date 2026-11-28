import type { ReactNode } from "react";

import { Avatar } from "../../components/avatar/avatar";
import type { IconName } from "../../components/icon/icon-base";
import styles from "./person-identity.module.css";

/** A visible name with decorative initials. Links and person-specific metadata belong to callers. */
export const PersonIdentity = ({
  name,
  icon,
  description,
  annotation,
  status,
  isPlaceholder = false,
  nameAs: Name = "span",
}: {
  name: string;
  /** A glyph in place of initials, for an author that is not a person, such as Merit AI. */
  icon?: IconName;
  description?: ReactNode;
  /** Short identity qualifier, such as “You”; workflow status belongs outside the identity. */
  annotation?: string;
  /** A visible account status badge beside the name; the caller owns its meaning and tone. */
  status?: ReactNode;
  /** No person is selected: a dashed avatar and muted name keep the alignment of a person. */
  isPlaceholder?: boolean;
  nameAs?: "span" | "h2" | "h3";
}) => {
  const Container = Name === "span" ? "span" : "div";

  return (
    <Container
      className={styles.identity}
      data-detailed={description != null}
      data-placeholder={isPlaceholder || undefined}
    >
      <Avatar
        name={isPlaceholder ? undefined : name}
        icon={icon}
        size={description != null || Name !== "span" ? "regular" : "compact"}
      />
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
