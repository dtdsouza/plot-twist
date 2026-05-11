import styles from './logo-mark.module.css';

interface ILogoMarkProps {
  readonly size?: number;
}

export function LogoMark({ size = 26 }: ILogoMarkProps) {
  return (
    <span className={styles.mark} style={{ gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 6.5 C3 5.7 3.7 5 4.5 5 H14 C14.8 5 15.5 5.7 15.5 6.5 V25.5 C15.5 26.3 14.8 27 14 27 H4.5 C3.7 27 3 26.3 3 25.5 Z"
          fill="var(--color-primary)"
        />
        <path
          d="M16.5 6.5 C16.5 5.7 17.2 5 18 5 H27.5 C28.3 5 29 5.7 29 6.5 V25.5 C29 26.3 28.3 27 27.5 27 H18 C17.2 27 16.5 26.3 16.5 25.5 Z"
          fill="var(--color-primary)"
          opacity="0.78"
        />
        <rect x="5.5" y="9" width="7.5" height="1.2" rx=".6" fill="white" opacity=".7" />
        <rect x="5.5" y="11.6" width="6" height="1.2" rx=".6" fill="white" opacity=".5" />
        <rect x="19" y="9" width="7.5" height="1.2" rx=".6" fill="white" opacity=".7" />
        <rect x="19" y="11.6" width="6" height="1.2" rx=".6" fill="white" opacity=".5" />
      </svg>
      <span className={styles.wordmark} style={{ fontSize: size * 0.78 }}>
        Plot-Twist
      </span>
    </span>
  );
}
