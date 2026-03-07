'use client';

import { type ChangeEvent, useState } from 'react';
import { EyeIcon, EyeOffIcon } from '@/components/icons/eye-icon';
import styles from './password-input.module.css';

interface IPasswordInputProps {
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly error?: string;
  readonly autoComplete?: string;
  readonly placeholder?: string;
}

export function PasswordInput({
  label,
  name,
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
}: IPasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={styles.field}>
      <label htmlFor={name} className={styles.label}>
        {label}
      </label>
      <div className={styles.inputWrapper}>
        <input
          id={name}
          type={showPassword ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`${styles.input} ${error ? styles.inputError : ''}`}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <EyeOffIcon className={styles.icon} />
          ) : (
            <EyeIcon className={styles.icon} />
          )}
        </button>
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
