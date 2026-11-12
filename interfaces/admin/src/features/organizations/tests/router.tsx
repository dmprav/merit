import type { MouseEventHandler, ReactNode } from "react";
import { vi } from "vite-plus/test";

export const navigate = vi.fn();

export const useHydrated = () => true;

export const useNavigate = () => navigate;

export const useRouter = () => ({ invalidate: navigate });

export const Link = ({
  children,
  to,
  onClick,
}: {
  children: ReactNode;
  to: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) => (
  <a
    href={to}
    onClick={(event) => {
      event.preventDefault();
      onClick?.(event);
    }}
  >
    {children}
  </a>
);
