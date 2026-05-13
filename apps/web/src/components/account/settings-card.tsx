import styles from './settings-card.module.css';

interface ISettingsCardProps {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
}

export function SettingsCard({ title, description, children }: ISettingsCardProps) {
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
