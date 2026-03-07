import { BookIcon } from '@/components/icons/book-icon';
import styles from './brand-panel.module.css';

export function BrandPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.overlay} />
      <div className={styles.content}>
        <BookIcon className={styles.icon} />
        <h1 className={styles.heading}>Plot-Twist</h1>
        <p className={styles.tagline}>
          <em>Where every chapter brings a new perspective</em>
        </p>
      </div>
    </div>
  );
}
