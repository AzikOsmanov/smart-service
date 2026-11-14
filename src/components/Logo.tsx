// The "IN" mark (Infra Neuro). Same drawing as the mobile app icon.
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="8 8 240 240" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#17366a" /><stop offset="1" stopColor="#0b1b36" /></linearGradient>
        <linearGradient id="lg-in" gradientUnits="userSpaceOnUse" x1="70" y1="60" x2="180" y2="195"><stop offset="0" stopColor="#6ecdf8" /><stop offset="1" stopColor="#3fb4f2" /></linearGradient>
      </defs>
      <rect x="8.5" y="8.5" width="239" height="239" rx="57.5" fill="url(#lg-bg)" stroke="#24488a" strokeWidth="1" />
      <g stroke="url(#lg-in)" strokeWidth="22" strokeLinecap="round" fill="none"><path d="M77.5 72V183" /><path d="M119.5 72V179" /><path d="M119.5 72L177.5 183" /><path d="M177.5 72V183" /></g>
      <g fill="#e6f6fe"><circle cx="77.5" cy="72" r="15" /><circle cx="119.5" cy="72" r="15" /><circle cx="177.5" cy="183" r="15" /></g>
    </svg>
  );
}
