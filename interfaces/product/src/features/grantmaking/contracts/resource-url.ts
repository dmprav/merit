import { publicIdSchema } from "@merit/grantmaking/api";

export const resourceRef = (title: string, publicId: string) => {
  const slug =
    title
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 80)
      .replace(/^-+|-+$/g, "") || "item";

  return `${slug}-${publicId}`;
};

export const publicIdFromRef = (ref: string) => {
  const id = ref.slice(ref.lastIndexOf("-") + 1);
  return publicIdSchema.safeParse(id).success ? id : null;
};
