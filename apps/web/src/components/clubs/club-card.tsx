import Image from 'next/image';
import Link from 'next/link';
import type { IClubResponse } from '@/lib/types/club';
import styles from './club-card.module.css';

interface IClubCardProps {
  readonly club: IClubResponse;
}

export function ClubCard({ club }: IClubCardProps) {
  return (
    <Link href={`/clubs/${club.id}`} className={styles.card}>
      <div className={styles.coverWrapper}>
        {club.coverImageUrl ? (
          <Image
            src={club.coverImageUrl}
            alt={`${club.name} cover`}
            fill
            sizes="(max-width: 640px) 100vw, 320px"
            className={styles.coverImage}
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
      <div className={styles.body}>
        <h2 className={styles.name}>{club.name}</h2>
        {club.role === 'owner' && (
          <span className={styles.ownerBadge}>Owner</span>
        )}
        {club.description && (
          <p className={styles.description}>{club.description}</p>
        )}
      </div>
    </Link>
  );
}
