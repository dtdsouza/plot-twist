'use client';

import { BookIcon } from '@/components/icons/book-icon';
import styles from './loading-overlay.module.css';

interface ILoadingOverlayProps {
  readonly isVisible: boolean;
}

export function LoadingOverlay({ isVisible }: ILoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <BookIcon className={styles.icon} />
        <span className={styles.text}>OPENING ARCHIVE...</span>
      </div>
    </div>
  );
}
