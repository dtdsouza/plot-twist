interface ILibraryIconProps {
  readonly className?: string;
}

export function LibraryIcon({ className }: ILibraryIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <path
        d="M3 21V8m4 13V5m4 16V8m4 13V5m4 16V11"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
