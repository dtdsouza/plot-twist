'use client';

import { useState } from 'react';
import { AuthApiError, useAuth } from '@/lib/auth-context';
import { initiateEmailChange } from '@/lib/api-client';
import { validateEmailChangeForm } from '@/lib/validation';
import { SettingsCard } from './settings-card';
import styles from './email-section.module.css';

type Mode = 'idle' | 'editing' | 'sent';

export function EmailSection() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('idle');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setMode('idle');
    setCurrentPassword('');
    setNewEmail('');
    setErrors({});
    setServerError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const validationErrors = validateEmailChangeForm({ currentPassword, newEmail });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      await initiateEmailChange({ currentPassword, newEmail });
      setMode('sent');
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
      title="Email & sign-in"
      description="Used for log-in and important notifications."
    >
      <div className={styles.row}>
        <div className={styles.field}>
          <span className="eyebrow">Email</span>
          <div className={styles.currentValue}>{user?.email ?? '…'}</div>
        </div>
        <div className={styles.field}>
          <span className="eyebrow">Time zone</span>
          <div className={styles.timeZone}>System default · coming soon</div>
        </div>
      </div>

      {mode === 'idle' && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setMode('editing')}
          >
            Change email
          </button>
        </div>
      )}

      {mode === 'editing' && (
        <form onSubmit={onSubmit} className={styles.form} noValidate>
          <div className={styles.formField}>
            <label className="eyebrow" htmlFor="email-new">
              New email
            </label>
            <input
              id="email-new"
              type="email"
              className={styles.input}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              aria-invalid={!!errors['newEmail']}
              aria-describedby={errors['newEmail'] ? 'email-new-error' : undefined}
            />
            {errors['newEmail'] && (
              <div id="email-new-error" className={styles.fieldError}>
                {errors['newEmail']}
              </div>
            )}
          </div>
          <div className={styles.formField}>
            <label className="eyebrow" htmlFor="email-current-pw">
              Current password
            </label>
            <input
              id="email-current-pw"
              type="password"
              className={styles.input}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              aria-invalid={!!errors['currentPassword']}
              aria-describedby={errors['currentPassword'] ? 'email-current-pw-error' : undefined}
            />
            {errors['currentPassword'] && (
              <div id="email-current-pw-error" className={styles.fieldError}>
                {errors['currentPassword']}
              </div>
            )}
          </div>

          {serverError && (
            <div role="alert" className={styles.banner}>
              {serverError}
            </div>
          )}

          <div className={styles.formFooter}>
            <button
              type="button"
              className={styles.cancel}
              onClick={reset}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className={styles.primary} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send verification email'}
            </button>
          </div>
        </form>
      )}

      {mode === 'sent' && (
        <div role="status" className={styles.successBanner}>
          We sent a verification link to <strong>{newEmail}</strong>. Click it
          from that mailbox to confirm the change.{' '}
          <button type="button" className={styles.linkButton} onClick={reset}>
            Send to a different address
          </button>
        </div>
      )}
    </SettingsCard>
  );
}
