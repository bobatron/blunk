export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Blunk">
      <rect width="64" height="64" rx="16" fill="#aa3bff" />
      <circle cx="43" cy="32" r="10" fill="#fff" />
      <circle cx="45" cy="32" r="4.5" fill="#1a1a1a" />
      <path d="M11 32 Q21 22 31 32" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
