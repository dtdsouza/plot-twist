import styles from './app-empty-state.module.css';

interface IAppEmptyStateProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly body?: string;
}

export function AppEmptyState({ eyebrow, title, body }: IAppEmptyStateProps) {
  return (
    <section className={styles.section}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1 className={styles.title}>{title}</h1>
      {body && <p className={styles.body}>{body}</p>}
    </section>
  );
}
