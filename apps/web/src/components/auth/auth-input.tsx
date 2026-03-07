'use client';

import { type ChangeEvent } from 'react';
import styles from './auth-input.module.css';

interface IAuthInputProps {
  readonly label: string;
  readonly type?: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly error?: string;
  readonly autoComplete?: string;
  readonly placeholder?: string;
}

export function AuthInput({
  label,
  type = 'text',
  name,
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
}: IAuthInputProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={name} className={styles.label}>
        {label}
      </label>
      <input
        id={name}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${styles.input} ${error ? styles.inputError : ''}`}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
