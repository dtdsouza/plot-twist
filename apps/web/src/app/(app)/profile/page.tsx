import { ProfileForm } from '@/components/profile/profile-form';
import styles from './page.module.css';

export const metadata = {
  title: 'Profile · Plot-Twist',
};

export default function ProfilePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Profile</h1>
        <p className={styles.subtitle}>How you appear in clubs and discussions.</p>
      </header>
      <ProfileForm />
    </div>
  );
}
