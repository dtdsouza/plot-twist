'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthApiError, useAuth } from '@/lib/auth-context';
import { verifyEmailChange } from '@/lib/api-client';
import styles from './verify-email-change.module.css';

type State =
  | { kind: 'pending' }
  | { kind: 'missing-token' }
  | { kind: 'success'; email: string }
  | { kind: 'failure'; message: string };

function VerifyEmailChangeBody() {
  const params = useSearchParams();
  const token = params?.get('token') ?? '';
  const { refreshUser } = useAuth();
  const [state, setState] = useState<State>(
    token ? { kind: 'pending' } : { kind: 'missing-token' }
  );
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const result = await verifyEmailChange({ token });
        if (cancelled) return;
        await refreshUser();
        if (cancelled) return;
        setState({ kind: 'success', email: result.email });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthApiError) {
          setState({ kind: 'failure', message: error.message });
        } else {
          setState({ kind: 'failure', message: 'Something went wrong. Please try again.' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, refreshUser]);

  return (
    <main className={`bg-paper ${styles.shell}`}>
      <section className={styles.card}>
        {state.kind === 'pending' && (
          <>
            <span className="eyebrow">One moment</span>
            <h1 className={styles.title}>Verifying your new email…</h1>
            <p className={styles.body}>Hang tight — we&apos;re confirming the link.</p>
          </>
        )}
        {state.kind === 'missing-token' && (
          <>
            <span className="eyebrow">Hmm</span>
            <h1 className={styles.title}>This link looks incomplete</h1>
            <p className={styles.body}>
              We couldn&apos;t find a verification token in the URL. Please use the
              full link from the email we sent you.
            </p>
            <Link href="/account" className={styles.primaryLink}>
              Back to account
            </Link>
          </>
        )}
        {state.kind === 'success' && (
          <>
            <span className="eyebrow">All set</span>
            <h1 className={styles.title}>Your email is updated</h1>
            <p className={styles.body}>
              You&apos;ll sign in with <strong>{state.email}</strong> from now on.
            </p>
            <Link href="/account" className={styles.primaryLink}>
              Back to account
            </Link>
          </>
        )}
        {state.kind === 'failure' && (
          <>
            <span className="eyebrow">Sorry</span>
            <h1 className={styles.title}>We couldn&apos;t verify this link</h1>
            <p className={styles.body}>{state.message}</p>
            <Link href="/account" className={styles.primaryLink}>
              Back to account
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

export function VerifyEmailChange() {
  return (
    <Suspense
      fallback={
        <main className={`bg-paper ${styles.shell}`}>
          <section className={styles.card}>
            <span className="eyebrow">One moment</span>
            <h1 className={styles.title}>Loading…</h1>
          </section>
        </main>
      }
    >
      <VerifyEmailChangeBody />
    </Suspense>
  );
}
