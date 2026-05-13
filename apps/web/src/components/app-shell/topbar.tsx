'use client';

import { useAuth } from '@/lib/auth-context';
import { SearchIcon } from '@/components/icons/search-icon';
import { BellIcon } from '@/components/icons/bell-icon';
import { LogoMark } from './logo-mark';
import { UserMenu } from './user-menu';
import styles from './topbar.module.css';

export function Topbar() {
  const { user } = useAuth();
  const displayName = user?.displayName ?? '…';

  return (
    <header className={styles.topbar}>
      <LogoMark size={26} />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Search (coming soon)"
          disabled
        >
          <SearchIcon className={styles.icon} />
          <span className={styles.searchLabel}>Search</span>
        </button>
        <button
          type="button"
          className={styles.bellButton}
          aria-label="Notifications (coming soon)"
          disabled
        >
          <BellIcon className={styles.icon} />
          <span className={styles.bellDot} aria-hidden="true" />
        </button>
        <UserMenu displayName={displayName} avatar={user?.avatar ?? null} />
      </div>
    </header>
  );
}
