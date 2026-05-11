import { Sidebar } from '@/components/app-shell/sidebar';
import { Topbar } from '@/components/app-shell/topbar';
import styles from './layout.module.css';

export default function AppLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className={`bg-paper ${styles.shell}`}>
      <Topbar />
      <div className={styles.row}>
        <Sidebar />
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
