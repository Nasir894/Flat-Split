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

export function RiceIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M3.5 11h17a1 1 0 0 1 1 1.1 9.6 9.6 0 0 1-6 7.6V21a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-1.3a9.6 9.6 0 0 1-6-7.6 1 1 0 0 1 1-1.1z" fill="currentColor" />
      <path d="M7 9.2c0-2 1.6-3.2 3-3.2 0-1.6 1.2-3 3-3s3 1.4 3 3c1.4 0 3 1.2 3 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".55" />
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
