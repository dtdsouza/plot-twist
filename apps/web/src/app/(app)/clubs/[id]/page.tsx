import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import type { IClubResponse } from '@/lib/types/club';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

interface IPageProps {
  params: Promise<{ id: string }>;
}

async function fetchClub(id: string): Promise<IClubResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/clubs/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: IPageProps) {
  const { id } = await params;
  const club = await fetchClub(id);
  return {
    title: club ? `${club.name} · Plot-Twist` : 'Club · Plot-Twist',
  };
}

export default async function ClubDetailPage({ params }: IPageProps) {
  const { id } = await params;
  const club = await fetchClub(id);

  if (!club) {
    notFound();
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.coverWrapper}>
          {club.coverImageUrl ? (
            <Image
              src={club.coverImageUrl}
              alt={`${club.name} cover`}
              fill
              sizes="(max-width: 960px) 100vw, 960px"
              className={styles.coverImage}
              priority
            />
          ) : (
            <img
              src="/club-cover-placeholder.svg"
              alt=""
              className={styles.coverPlaceholder}
              aria-hidden="true"
            />
          )}
        </div>
        <div className={styles.heroBody}>
          <h1 className={styles.title}>{club.name}</h1>
          <p className={styles.memberCount}>1 member</p>
          {club.description && (
            <p className={styles.description}>{club.description}</p>
          )}
        </div>
      </header>

      <div className={styles.sections}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Discussions</h2>
          <p className={styles.sectionBody}>Reading discussions will appear here.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Members</h2>
          <p className={styles.sectionBody}>Club members will appear here.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Settings</h2>
          <p className={styles.sectionBody}>Club settings will appear here.</p>
        </section>
      </div>
    </div>
  );
}
