'use client';

import { useState } from 'react';
import { AuthApiError } from '@/lib/auth-context';
import { changePassword } from '@/lib/api-client';
import { validateChangePasswordForm } from '@/lib/validation';
import { SettingsCard } from './settings-card';
import styles from './password-section.module.css';

export function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function clearMessages() {
    setServerError(null);
    setSuccess(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    const validationErrors = validateChangePasswordForm({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (error) {
      if (error instanceof AuthApiError) {
        setServerError(error.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsCard
      title="Change password"
      description="Use a passphrase you'd be comfortable scribbling on a library card."
    >
      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <div className={styles.field}>
          <label className="eyebrow" htmlFor="password-current">
            Current password
          </label>
          <input
            id="password-current"
            type="password"
            className={styles.input}
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              clearMessages();
            }}
            aria-invalid={!!errors['currentPassword']}
          />
          {errors['currentPassword'] && (
            <div className={styles.fieldError}>{errors['currentPassword']}</div>
          )}
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className="eyebrow" htmlFor="password-new">
              New password
            </label>
            <input
              id="password-new"
              type="password"
              className={styles.input}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                clearMessages();
              }}
              aria-invalid={!!errors['newPassword']}
            />
            {errors['newPassword'] && (
              <div className={styles.fieldError}>{errors['newPassword']}</div>
            )}
          </div>
          <div className={styles.field}>
            <label className="eyebrow" htmlFor="password-confirm">
              Confirm
            </label>
            <input
              id="password-confirm"
              type="password"
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearMessages();
              }}
              aria-invalid={!!errors['confirmPassword']}
            />
            {errors['confirmPassword'] && (
              <div className={styles.fieldError}>{errors['confirmPassword']}</div>
            )}
          </div>
        </div>

        {serverError && (
          <div role="alert" className={styles.banner}>
            {serverError}
          </div>
        )}
        {success && !serverError && (
          <div role="status" className={styles.successBanner}>
            Password updated.
          </div>
        )}

        <div className={styles.footer}>
          <button type="submit" className={styles.primary} disabled={submitting}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </SettingsCard>
  );
}
