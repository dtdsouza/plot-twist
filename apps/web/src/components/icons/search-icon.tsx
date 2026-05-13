interface ISearchIconProps {
  readonly className?: string;
}

export function SearchIcon({ className }: ISearchIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <path
        d="M21 21l-4.3-4.3M11 18a7 7 0 110-14 7 7 0 010 14z"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
