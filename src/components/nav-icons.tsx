// Filled tab-bar icons (solid shapes with cut-out details), in the style of the reference nav.
// Cut-outs are drawn in the bar's own background color via `var(--nav-bg)`.
type P = { className?: string };

export function HomeIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M10.6 2.6a2.2 2.2 0 0 1 2.8 0l7 5.7c.5.4.8 1 .8 1.7V19a3 3 0 0 1-3 3H5.8a3 3 0 0 1-3-3v-9c0-.7.3-1.3.8-1.7z" fill="currentColor" />
      <rect x="8.5" y="15.4" width="7" height="2.2" rx="1.1" fill="var(--nav-bg)" />
    </svg>
  );
}

export function WalletIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M5 4.5h12.5a2 2 0 0 1 2 2v.7H5.3a1.3 1.3 0 0 1 0-2.6z" fill="currentColor" opacity=".55" />
      <rect x="2.5" y="6.5" width="19.5" height="14" rx="3.2" fill="currentColor" />
      <rect x="15" y="11.6" width="7" height="3.8" rx="1.9" fill="var(--nav-bg)" />
      <circle cx="17.1" cy="13.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function AddIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="currentColor" />
      <path d="M12 7.5v9M7.5 12h9" stroke="var(--nav-bg)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Turns: a rounded tile with two chasing arrows (taking turns in a cycle). */
export function TurnsIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="currentColor" />
      <path d="M16.6 9.6A5 5 0 0 0 7.6 9" fill="none" stroke="var(--nav-bg)" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M16.9 6.6v3.2h-3.2" fill="none" stroke="var(--nav-bg)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.4 14.4a5 5 0 0 0 9 .6" fill="none" stroke="var(--nav-bg)" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M7.1 17.4v-3.2h3.2" fill="none" stroke="var(--nav-bg)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function StatsIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="currentColor" />
      <path d="M6.5 15.5l3.4-3.6 2.8 2.4 4.8-5.3" fill="none" stroke="var(--nav-bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
