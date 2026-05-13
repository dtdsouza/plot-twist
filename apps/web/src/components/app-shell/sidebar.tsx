'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { MenuBookIcon } from '@/components/icons/menu-book-icon';
import { UsersIcon } from '@/components/icons/users-icon';
import { LibraryIcon } from '@/components/icons/library-icon';
import { SettingsIcon } from '@/components/icons/settings-icon';
import styles from './sidebar.module.css';

interface INavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly Icon: React.ComponentType<{ readonly className?: string }>;
  readonly matchPrefixes: readonly string[];
}

const PRIMARY_ITEMS: readonly INavItem[] = [
  {
    id: 'desk',
    label: 'Reading Desk',
    href: '/',
    Icon: MenuBookIcon,
    matchPrefixes: ['/'],
  },
  {
    id: 'clubs',
    label: 'My Clubs',
    href: '/clubs',
    Icon: UsersIcon,
    matchPrefixes: ['/clubs'],
  },
  {
    id: 'bookshelf',
    label: 'Bookshelf',
    href: '/bookshelf',
    Icon: LibraryIcon,
    matchPrefixes: ['/bookshelf'],
  },
];

const SECONDARY_ITEMS: readonly INavItem[] = [
  {
    id: 'settings',
    label: 'Settings',
    href: '/profile',
    Icon: SettingsIcon,
    matchPrefixes: ['/profile', '/account'],
  },
];

function isActive(pathname: string, item: INavItem): boolean {
  if (item.href === '/') {
    return pathname === '/';
  }
  return item.matchPrefixes.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const { user } = useAuth();

  return (
    <aside className={styles.sidebar} aria-label="Primary navigation">
      <div className={styles.identity}>
        <span className="eyebrow">Signed in as</span>
        <div className={styles.userName}>{user?.displayName ?? '…'}</div>
      </div>
      <nav className={styles.nav}>
        {PRIMARY_ITEMS.map((item) => (
          <SidebarLink key={item.id} item={item} active={isActive(pathname, item)} />
        ))}
        <div className={styles.divider} />
        {SECONDARY_ITEMS.map((item) => (
          <SidebarLink key={item.id} item={item} active={isActive(pathname, item)} />
        ))}
      </nav>
    </aside>
  );
}

function SidebarLink({
  item,
  active,
}: {
  readonly item: INavItem;
  readonly active: boolean;
}) {
  const { Icon, href, label } = item;
  return (
    <Link
      href={href}
      className={`${styles.item} ${active ? styles.active : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className={styles.icon} />
      <span className={styles.label}>{label}</span>
    </Link>
  );
}
