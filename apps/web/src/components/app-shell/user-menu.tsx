'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import styles from './user-menu.module.css';

interface IUserMenuProps {
  readonly displayName: string;
  readonly avatar: string | null;
}

export function UserMenu({ displayName, avatar }: IUserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { logout } = useAuth();

  useEffect(() => {
    if (!open) return;

    function onClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.name}>{displayName}</span>
        <span
          className={styles.avatar}
          style={
            avatar
              ? { backgroundImage: `url('${avatar}')` }
              : undefined
          }
          aria-hidden="true"
        >
          {!avatar && <span className={styles.initial}>{initialOf(displayName)}</span>}
        </span>
      </button>
      {open && (
        <div role="menu" className={styles.menu}>
          <Link
            href="/profile"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={async () => {
              setOpen(false);
              await logout();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}
