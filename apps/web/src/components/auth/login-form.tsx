'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useAuth, AuthApiError } from '@/lib/auth-context';
import { validateLoginForm } from '@/lib/validation';
import { AuthInput } from './auth-input';
import { PasswordInput } from './password-input';
import { SubmitButton } from './submit-button';
import { LoadingOverlay } from './loading-overlay';
import styles from './login-form.module.css';

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');

    const validationErrors = validateLoginForm({ email, password });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await login({ email, password });
    } catch (error) {
      if (error instanceof AuthApiError) {
        setServerError(error.message);
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <LoadingOverlay isVisible={isLoading} />

      <h2 className={styles.heading}>Welcome back, reader.</h2>
      <p className={styles.subtitle}>
        Please present your library card to continue.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {serverError && (
          <div className={styles.errorBanner}>{serverError}</div>
        )}

        <AuthInput
          label="Email address"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors['email']}
          autoComplete="email"
        />

        <PasswordInput
          label="Password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors['password']}
          autoComplete="current-password"
        />

        <div className={styles.submitWrapper}>
          <SubmitButton label="Enter Library" isLoading={isLoading} />
        </div>
      </form>

      <div className={styles.footer}>
        <div className={styles.footerLinks}>
          <Link href="/forgot-password" className={styles.link}>
            Forgot password?
          </Link>
          <span className={styles.separator}>|</span>
          <Link href="/register" className={styles.link}>
            Request a library card (Sign up)
          </Link>
        </div>
        <span className={styles.copyright}>
          &copy; 2024 Plot-Twist &mdash; Est. MMXXIV
        </span>
      </div>
    </div>
  );
}
