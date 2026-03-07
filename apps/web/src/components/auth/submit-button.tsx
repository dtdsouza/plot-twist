'use client';

import { ArrowRightIcon } from '@/components/icons/arrow-right-icon';
import styles from './submit-button.module.css';

interface ISubmitButtonProps {
  readonly label: string;
  readonly isLoading?: boolean;
  readonly disabled?: boolean;
}

export function SubmitButton({ label, isLoading, disabled }: ISubmitButtonProps) {
  return (
    <button
      type="submit"
      className={styles.button}
      disabled={disabled || isLoading}
    >
      <span className={styles.label}>{isLoading ? 'Please wait...' : label}</span>
      {!isLoading && <ArrowRightIcon className={styles.arrow} />}
    </button>
  );
}
