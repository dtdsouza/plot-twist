'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth, AuthApiError } from '@/lib/auth-context';
import { BIO_MAX_LENGTH, validateProfileForm } from '@/lib/validation';
import styles from './profile-form.module.css';

interface IProfileFields {
  displayName: string;
  bio: string;
}

function fromUser(user: { displayName?: string; bio?: string | null } | null): IProfileFields {
  return {
    displayName: user?.displayName ?? '',
    bio: user?.bio ?? '',
  };
}

function diffPayload(initial: IProfileFields, current: IProfileFields) {
  const payload: { displayName?: string; bio?: string | null } = {};
  if (current.displayName.trim() !== initial.displayName.trim()) {
    payload.displayName = current.displayName.trim();
  }
  if (current.bio !== initial.bio) {
    payload.bio = current.bio.length === 0 ? null : current.bio;
  }
  return payload;
}

export function ProfileForm() {
  const { user, isLoading, updateProfile } = useAuth();

  const initial = useMemo(() => fromUser(user), [user]);
  const [fields, setFields] = useState<IProfileFields>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setFields(initial);
    setErrors({});
    setSuccess(false);
  }, [initial]);

  const dirty =
    fields.displayName.trim() !== initial.displayName.trim() ||
    fields.bio !== initial.bio;

  function setField<K extends keyof IProfileFields>(key: K, value: IProfileFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const validationErrors = validateProfileForm(fields);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const payload = diffPayload(initial, fields);
    if (Object.keys(payload).length === 0) {
      setSuccess(true);
      return;
    }

    setSubmitting(true);
    try {
      await updateProfile(payload);
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

  function onCancel() {
    setFields(initial);
    setErrors({});
    setServerError(null);
    setSuccess(false);
  }

  const usernameStub = '@username — coming soon';

  if (isLoading && !user) {
    return <div className={styles.card} aria-busy="true">Loading…</div>;
  }

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate>
      <div className={styles.grid2}>
        <div>
          <label className="eyebrow" htmlFor="profile-display-name">
            Display name
          </label>
          <input
            id="profile-display-name"
            type="text"
            className={styles.input}
            value={fields.displayName}
            onChange={(e) => setField('displayName', e.target.value)}
            aria-invalid={!!errors['displayName']}
            aria-describedby={errors['displayName'] ? 'profile-display-name-error' : undefined}
          />
          {errors['displayName'] && (
            <div id="profile-display-name-error" className={styles.fieldError}>
              {errors['displayName']}
            </div>
          )}
        </div>
        <div>
          <span className="eyebrow">Username</span>
          <div className={styles.usernameStub}>{usernameStub}</div>
        </div>
      </div>

      <div className={styles.field}>
        <label className="eyebrow" htmlFor="profile-bio">
          Bio
        </label>
        <textarea
          id="profile-bio"
          className={`${styles.input} ${styles.textarea}`}
          value={fields.bio}
          onChange={(e) => setField('bio', e.target.value.slice(0, BIO_MAX_LENGTH))}
          maxLength={BIO_MAX_LENGTH}
          aria-invalid={!!errors['bio']}
          aria-describedby="profile-bio-counter"
        />
        <div id="profile-bio-counter" className={styles.counter}>
          {fields.bio.length} / {BIO_MAX_LENGTH}
        </div>
        {errors['bio'] && <div className={styles.fieldError}>{errors['bio']}</div>}
      </div>

      <div className={styles.grid2}>
        <div>
          <span className="eyebrow">Favorite genres</span>
          <div className={styles.stubBox}>Coming soon</div>
        </div>
        <div>
          <span className="eyebrow">Currently reading</span>
          <div className={styles.stubBox}>Coming soon</div>
        </div>
      </div>

      {serverError && (
        <div role="alert" className={styles.banner}>
          {serverError}
        </div>
      )}
      {success && !serverError && (
        <div role="status" className={styles.successBanner}>
          Saved.
        </div>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.cancel}
          onClick={onCancel}
          disabled={submitting || !dirty}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.save}
          disabled={submitting || !dirty}
        >
          {submitting ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}
