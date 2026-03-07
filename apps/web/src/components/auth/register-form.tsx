'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useAuth, AuthApiError } from '@/lib/auth-context';
import { validateRegisterForm } from '@/lib/validation';
import { AuthInput } from './auth-input';
import { PasswordInput } from './password-input';
import { SubmitButton } from './submit-button';
import { LoadingOverlay } from './loading-overlay';
import styles from './register-form.module.css';

export function RegisterForm() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');

    const validationErrors = validateRegisterForm({
      email,
      password,
      displayName,
    });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await register({ email, password, displayName });
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

      <h2 className={styles.heading}>Join the reading room.</h2>
      <p className={styles.subtitle}>
        Fill in your details to receive a library card.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {serverError && (
          <div className={styles.errorBanner}>{serverError}</div>
        )}

        <AuthInput
          label="Display name"
          type="text"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={errors['displayName']}
          autoComplete="name"
        />

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
          autoComplete="new-password"
        />

        <div className={styles.submitWrapper}>
          <SubmitButton label="Request Library Card" isLoading={isLoading} />
        </div>
      </form>

      <div className={styles.footer}>
        <div className={styles.footerLinks}>
          Already a member?{' '}
          <Link href="/login" className={styles.link}>
            Present your library card
          </Link>
        </div>
        <span className={styles.copyright}>
          &copy; 2024 Plot-Twist &mdash; Est. MMXXIV
        </span>
      </div>
    </div>
  );
}
