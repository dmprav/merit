/** Pure destination definitions, safe for browser and server composition. */
export const productLinks = {
  review: (id: string) => `/reviews/${encodeURIComponent(id)}`,
  invitation: (token: string) => `/invitations/${encodeURIComponent(token)}`,
  signIn: "/app/sign-in",
};
