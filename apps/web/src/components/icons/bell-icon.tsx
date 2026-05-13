interface IBellIconProps {
  readonly className?: string;
}

export function BellIcon({ className }: IBellIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <path
        d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9zm3 13a3 3 0 006 0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
