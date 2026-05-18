import { cookies } from 'next/headers';
import Link from 'next/link';
import { AppEmptyState } from '@/components/app-shell/app-empty-state';
import { ClubCard } from '@/components/clubs/club-card';
import type { IClubResponse } from '@/lib/types/club';
import styles from './page.module.css';

export const metadata = {
  title: 'My Clubs · Plot-Twist',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

async function fetchClubs(): Promise<IClubResponse[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    return [];
  }

  try {
    const response = await fetch(`${API_URL}/clubs`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch {
    return [];
  }
}

export default async function ClubsPage() {
  const clubs = await fetchClubs();

  if (clubs.length === 0) {
    return (
      <div className={styles.page}>
        <AppEmptyState
          eyebrow="My Clubs"
          title="No clubs yet"
          body="Start a book club and invite friends to read together."
        />
        <div className={styles.emptyAction}>
          <Link href="/clubs/new" className={styles.createButton}>
            Create Club
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>My Clubs</h1>
        <Link href="/clubs/new" className={styles.createButton}>
          Create Club
        </Link>
      </header>
      <section className={styles.grid}>
        {clubs.map((club) => (
          <ClubCard key={club.id} club={club} />
        ))}
      </section>
    </div>
  );
}
