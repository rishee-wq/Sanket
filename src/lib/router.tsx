/**
 * A tiny history-API router: enough for a handful of pages without another dependency.
 */
import React, { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function navigate(to: string, { replace = false } = {}) {
  if (to === location.pathname + location.search + location.hash) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  listeners.forEach((l) => l());
  const hash = new URL(to, location.href).hash;
  if (hash) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
  else window.scrollTo(0, 0);
}

/** Current pathname, re-rendering on navigation. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

/** Current query string parameters, re-rendering on navigation. */
export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, () => location.search);
  return new URLSearchParams(search);
}

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** An <a> that navigates client-side for plain left clicks. */
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(({ to, onClick, ...rest }, ref) => (
  <a
    ref={ref}
    href={to}
    onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (rest.target && rest.target !== '_self') return;
      e.preventDefault();
      navigate(to);
    }}
    {...rest}
  />
));
Link.displayName = 'Link';
