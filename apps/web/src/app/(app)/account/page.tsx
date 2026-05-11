import { EmailSection } from '@/components/account/email-section';
import { PasswordSection } from '@/components/account/password-section';
import { NotificationsSection } from '@/components/account/notifications-section';
import styles from './page.module.css';

export const metadata = {
  title: 'Account · Plot-Twist',
};

export default function AccountPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Account</h1>
        <p className={styles.subtitle}>Manage your sign-in and sanctuary preferences.</p>
      </header>
      <EmailSection />
      <PasswordSection />
      <NotificationsSection />
    </div>
  );
}
