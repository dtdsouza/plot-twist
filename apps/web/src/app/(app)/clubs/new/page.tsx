'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createClub,
  requestClubCoverIntent,
  uploadToPresignedPost,
  finalizeClubCover,
  AuthApiError,
} from '@/lib/api-client';
import styles from './page.module.css';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;
const COVER_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

interface IFormErrors {
  name?: string;
}

export default function NewClubPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [errors, setErrors] = useState<IFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [coverWarning, setCoverWarning] = useState<string | null>(null);

  function validate(): IFormErrors {
    const next: IFormErrors = {};
    if (!name.trim()) {
      next.name = 'Club name is required.';
    } else if (name.trim().length > NAME_MAX) {
      next.name = `Club name must be ${NAME_MAX} characters or fewer.`;
    }
    return next;
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) {
      setCoverFile(null);
      setCoverPreview(null);
      return;
    }

    if (!COVER_ALLOWED_MIME.includes(file.type)) {
      setCreateError(`Unsupported file type. Allowed: ${COVER_ALLOWED_MIME.join(', ')}.`);
      return;
    }

    setCoverFile(file);
    setCoverWarning(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setCoverPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCoverWarning(null);

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);

    let clubId: string;

    try {
      const club = await createClub({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      clubId = club.id;
    } catch (error) {
      if (error instanceof AuthApiError) {
        setCreateError(error.message);
      } else {
        setCreateError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
      return;
    }

    if (coverFile) {
      try {
        const intent = await requestClubCoverIntent(clubId, {
          contentType: coverFile.type,
          contentLength: coverFile.size,
        });
        await uploadToPresignedPost(intent.url, intent.fields, coverFile);
        await finalizeClubCover(clubId, { key: intent.key });
      } catch {
        setCoverWarning('Cover upload failed — you can retry from the club settings later.');
        // Non-blocking: navigate to the club detail page anyway.
        setSubmitting(false);
        router.push(`/clubs/${clubId}`);
        return;
      }
    }

    setSubmitting(false);
    router.push(`/clubs/${clubId}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Create a Club</h1>
        <p className={styles.subtitle}>Invite friends and start reading together.</p>
      </header>

      <form className={styles.card} onSubmit={onSubmit} noValidate>
        {createError && (
          <div role="alert" className={styles.errorBanner}>
            {createError}
          </div>
        )}

        {coverWarning && (
          <div role="status" className={styles.warningBanner}>
            {coverWarning}
          </div>
        )}

        <div className={styles.field}>
          <label className="eyebrow" htmlFor="club-name">
            Club name
          </label>
          <input
            id="club-name"
            type="text"
            className={styles.input}
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.name;
                  return next;
                });
              }
            }}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'club-name-error' : undefined}
          />
          <div className={styles.counter}>
            {name.length} / {NAME_MAX}
          </div>
          {errors.name && (
            <div id="club-name-error" className={styles.fieldError}>
              {errors.name}
            </div>
          )}
        </div>

        <div className={styles.field}>
          <label className="eyebrow" htmlFor="club-description">
            Description
            <span className={styles.optional}> (optional)</span>
          </label>
          <textarea
            id="club-description"
            className={`${styles.input} ${styles.textarea}`}
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
          />
          <div className={styles.counter}>
            {description.length} / {DESCRIPTION_MAX}
          </div>
        </div>

        <div className={styles.field}>
          <span className="eyebrow">Cover image <span className={styles.optional}>(optional)</span></span>
          {coverPreview && (
            <img
              src={coverPreview}
              alt="Cover preview"
              className={styles.coverPreview}
            />
          )}
          <div className={styles.fileRow}>
            <button
              type="button"
              className={styles.fileButton}
              onClick={() => fileInputRef.current?.click()}
            >
              {coverFile ? 'Change cover' : 'Choose file'}
            </button>
            {coverFile && (
              <span className={styles.fileName}>{coverFile.name}</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={COVER_ALLOWED_MIME.join(',')}
            className={styles.hiddenInput}
            onChange={onFileChange}
            aria-hidden="true"
            tabIndex={-1}
          />
          <p className={styles.helper}>JPEG, PNG, or WEBP.</p>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submit}
            disabled={submitting}
          >
            {submitting ? 'Creating…' : 'Create Club'}
          </button>
        </div>
      </form>
    </div>
  );
}
