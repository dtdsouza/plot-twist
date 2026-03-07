interface IBookIconProps {
  readonly className?: string;
}

export function BookIcon({ className }: IBookIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <path
        d="M32 14C26 10 18 8 8 8v40c10 0 18 2 24 6m0-40c6-4 14-6 24-6v40c-10 0-18 2-24 6"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M32 14v40" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
