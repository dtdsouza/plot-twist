interface IUsersIconProps {
  readonly className?: string;
}

export function UsersIcon({ className }: IUsersIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <circle cx="9" cy="8" r="3.5" strokeWidth="2" />
      <circle cx="17" cy="9" r="2.5" strokeWidth="2" />
      <path
        d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M15 20c0-2 1-3.5 2.5-4"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
