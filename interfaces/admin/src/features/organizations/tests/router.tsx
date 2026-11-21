import type { ComponentProps, MouseEventHandler, ReactNode } from "react";
import { vi } from "vite-plus/test";

import type { Link as SharedLink } from "@merit/ui/link";

export const navigate = vi.fn();

export const useHydrated = () => true;

export const useNavigate = () => navigate;

export const useRouter = () => ({ invalidate: navigate });

type Destination = {
  to: string;
  params?: Record<string, string>;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/** Resolves a route's path and keeps navigation with the test. */
const destination = ({ to, params = {}, onClick }: Destination) => ({
  href: to.replace(/\$(\w+)/g, (segment, name: string) => params[name] ?? segment),
  onClick: (event: Parameters<MouseEventHandler<HTMLAnchorElement>>[0]) => {
    event.preventDefault();
    onClick?.(event);
  },
});

type SharedLinkProps = ComponentProps<typeof SharedLink>;

export const createLink =
  (Anchor: (props: SharedLinkProps) => ReactNode) =>
  ({ to, params, onClick, ...props }: Omit<SharedLinkProps, "href"> & Destination) => (
    <Anchor {...props} {...destination({ to, params, onClick })} />
  );

export const Link = ({ children, ...link }: Destination & { children: ReactNode }) => (
  <a {...destination(link)}>{children}</a>
);
