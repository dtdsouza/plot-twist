'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPassword, AuthApiError } from '@/lib/api-client';
import { validateResetPasswordForm } from '@/lib/validation';
import { PasswordInput } from './password-input';
import { SubmitButton } from './submit-button';
import { LoadingOverlay } from './loading-overlay';
import { CheckCircleIcon } from '@/components/icons/check-circle-icon';
import styles from './reset-password-form.module.css';

const REDIRECT_DELAY_MS = 2000;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');

    const validationErrors = validateResetPasswordForm({
      password,
      confirmPassword,
    });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await resetPassword({ token, password });
      setIsSuccess(true);
      redirectTimer.current = setTimeout(() => {
        router.push('/login');
      }, REDIRECT_DELAY_MS);
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

  if (isSuccess) {
    return (
      <div className={styles.container}>
        <div className={styles.successPanel}>
          <CheckCircleIcon className={styles.successIcon} />
          <h2 className={styles.successHeading}>Chapter Restored</h2>
          <p className={styles.successBody}>
            Your password has been successfully updated. Redirecting you to the
            library...
          </p>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <LoadingOverlay isVisible={isLoading} />

      <h2 className={styles.heading}>Reset Password</h2>
      <p className={styles.subtitle}>
        Enter your new credentials to regain access to your library.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {serverError && (
          <div className={styles.errorBanner}>{serverError}</div>
        )}

        <PasswordInput
          label="New password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors['password']}
          autoComplete="new-password"
        />

        <PasswordInput
          label="Confirm password"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors['confirmPassword']}
          autoComplete="new-password"
        />

        <div className={styles.submitWrapper}>
          <SubmitButton label="Renew My Access" isLoading={isLoading} />
        </div>
      </form>

      <div className={styles.footer}>
        <div className={styles.footerLinks}>
          <Link href="/login" className={styles.link}>
            Back to Sign In
          </Link>
        </div>
        <span className={styles.copyright}>
          &copy; 2024 Plot-Twist &mdash; Est. MMXXIV
        </span>
      </div>
    </div>
  );
}
