'use client';

import { useRef, useState } from 'react';
import { useAuth, AuthApiError } from '@/lib/auth-context';
import {
  createAvatarUploadIntent,
  finalizeAvatarUpload,
  uploadToPresignedPost,
} from '@/lib/api-client';
import styles from './avatar-upload.module.css';

const DEFAULT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX_BYTES = 2_097_152;

type Phase = 'idle' | 'requesting' | 'uploading' | 'finalizing' | 'removing';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AvatarUpload() {
  const { user, updateProfile, refreshUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const busy = phase !== 'idle';
  const currentAvatar = user?.avatar ?? null;
  const initial = (user?.displayName?.trim() || '?').charAt(0).toUpperCase();
  const inputAccept = DEFAULT_ALLOWED_MIME.join(',');

  function onPickClick() {
    if (busy) return;
    setError(null);
    setSuccess(false);
    inputRef.current?.click();
  }

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!DEFAULT_ALLOWED_MIME.includes(file.type)) {
      setError(
        `Unsupported file type. Allowed: ${DEFAULT_ALLOWED_MIME.join(', ')}`
      );
      return;
    }
    if (file.size > DEFAULT_MAX_BYTES) {
      setError(
        `File is too large (${formatBytes(file.size)}). Max ${formatBytes(DEFAULT_MAX_BYTES)}.`
      );
      return;
    }

    setError(null);
    setSuccess(false);
    setProgressPct(0);

    try {
      setPhase('requesting');
      const intent = await createAvatarUploadIntent({
        contentType: file.type,
        contentLength: file.size,
      });

      if (file.size > intent.limits.maxContentLength) {
        throw new AuthApiError(
          `File exceeds server limit of ${formatBytes(intent.limits.maxContentLength)}.`,
          400
        );
      }

      setPhase('uploading');
      await uploadToPresignedPost(
        intent.url,
        intent.fields,
        file,
        (loaded, total) => {
          setProgressPct(total > 0 ? Math.round((loaded / total) * 100) : 0);
        }
      );

      setPhase('finalizing');
      await finalizeAvatarUpload({ uploadKey: intent.key });
      await refreshUser();
      setSuccess(true);
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setPhase('idle');
      setProgressPct(0);
    }
  }

  async function onRemoveClick() {
    if (busy || !currentAvatar) return;
    setError(null);
    setSuccess(false);
    setPhase('removing');
    try {
      await updateProfile({ avatar: null });
      setSuccess(true);
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.message);
      } else {
        setError('Could not remove avatar. Please try again.');
      }
    } finally {
      setPhase('idle');
    }
  }

  const phaseLabel: Record<Phase, string> = {
    idle: 'Upload new photo',
    requesting: 'Preparing…',
    uploading: `Uploading… ${progressPct}%`,
    finalizing: 'Finalizing…',
    removing: 'Removing…',
  };

  return (
    <div className={styles.row}>
      <div
        className={styles.avatar}
        style={
          currentAvatar
            ? { backgroundImage: `url('${currentAvatar}')` }
            : undefined
        }
        aria-hidden="true"
      >
        {!currentAvatar && <span className={styles.avatarInitial}>{initial}</span>}
      </div>
      <div className={styles.controls}>
        <span className={`eyebrow ${styles.label}`}>Avatar</span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.uploadButton}
            onClick={onPickClick}
            disabled={busy}
          >
            {phaseLabel[phase]}
          </button>
          {currentAvatar && (
            <button
              type="button"
              className={styles.removeButton}
              onClick={onRemoveClick}
              disabled={busy}
            >
              {phase === 'removing' ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={inputAccept}
          className={styles.hiddenInput}
          onChange={onFileChosen}
          aria-hidden="true"
          tabIndex={-1}
        />
        {phase === 'uploading' && (
          <div className={styles.progress} aria-hidden="true">
            <div
              className={styles.progressBar}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : success ? (
          <p role="status" className={styles.success}>
            Avatar updated.
          </p>
        ) : (
          <p className={styles.helper}>
            JPEG, PNG, or WEBP. Up to {formatBytes(DEFAULT_MAX_BYTES)}.
          </p>
        )}
      </div>
    </div>
  );
}
