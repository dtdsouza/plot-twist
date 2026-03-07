import { BrandPanel } from '@/components/auth/brand-panel';
import styles from './layout.module.css';

export default function AuthLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className={styles.grid}>
      <div className={styles.brandPanel}>
        <BrandPanel />
      </div>
      <main className={styles.formPanel}>{children}</main>
    </div>
  );
}
