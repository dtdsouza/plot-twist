interface ISettingsIconProps {
  readonly className?: string;
}

export function SettingsIcon({ className }: ISettingsIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
    >
      <circle cx="12" cy="12" r="3" strokeWidth="2" />
      <path
        d="M19 12.8a7 7 0 000-1.6l1.8-1.4-2-3.4-2.1.8a7 7 0 00-1.4-.8L15 4h-4l-.3 2.4a7 7 0 00-1.4.8l-2.1-.8-2 3.4L7 11.2a7 7 0 000 1.6l-1.8 1.4 2 3.4 2.1-.8a7 7 0 001.4.8L11 20h4l.3-2.4a7 7 0 001.4-.8l2.1.8 2-3.4z"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
