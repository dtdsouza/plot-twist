'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { forgotPassword, AuthApiError } from '@/lib/api-client';
import { validateForgotPasswordForm } from '@/lib/validation';
import { AuthInput } from './auth-input';
import { SubmitButton } from './submit-button';
import { LoadingOverlay } from './loading-overlay';
import { MailIcon } from '@/components/icons/mail-icon';
import styles from './forgot-password-form.module.css';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');

    const validationErrors = validateForgotPasswordForm({ email });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await forgotPassword({ email });
      setIsSubmitted(true);
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

      <h2 className={styles.heading}>Forgot Password?</h2>
      <p className={styles.subtitle}>
        Enter the email associated with your shelf, and we&apos;ll help you find
        your way back.
      </p>

      {isSubmitted ? (
        <div className={styles.successCard}>
          <MailIcon className={styles.successIcon} />
          <div>
            <h3 className={styles.successHeading}>
              A library messenger is on their way with your reset link.
            </h3>
            <p className={styles.successBody}>
              Please check your inbox (and perhaps the dustier corners of your
              spam folder) to continue your journey.
            </p>
          </div>
        </div>
      ) : (
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
            placeholder="curator@plot-twist.com"
          />

          <div className={styles.submitWrapper}>
            <SubmitButton label="Send Reset Link" isLoading={isLoading} />
          </div>
        </form>
      )}

      <div className={styles.footer}>
        <div className={styles.footerLinks}>
          <Link href="/login" className={styles.link}>
            Return to Login
          </Link>
        </div>
        <span className={styles.copyright}>
          &copy; 2024 Plot-Twist &mdash; Est. MMXXIV
        </span>
      </div>
    </div>
  );
}
