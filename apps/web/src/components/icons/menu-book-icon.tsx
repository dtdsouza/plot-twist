interface IMenuBookIconProps {
  readonly className?: string;
}

export function MenuBookIcon({ className }: IMenuBookIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <path
        d="M12 6v15M3 6c3 0 6 1 9 3 3-2 6-3 9-3v13c-3 0-6 1-9 3-3-2-6-3-9-3V6z"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
