import { SettingsCard } from './settings-card';
import styles from './notifications-section.module.css';

interface IPreference {
  readonly label: string;
  readonly sub: string;
  readonly defaultOn: boolean;
}

const PREFERENCES: readonly IPreference[] = [
  {
    label: "New messages in clubs I'm in",
    sub: 'Daily digest, evenings only.',
    defaultOn: true,
  },
  {
    label: 'Replies to my threads',
    sub: 'Sent immediately.',
    defaultOn: true,
  },
  {
    label: 'Upcoming meetings',
    sub: '2 hours before each gathering.',
    defaultOn: true,
  },
  {
    label: 'Weekly literary newsletter',
    sub: 'A short Sunday letter from the curator.',
    defaultOn: false,
  },
];

export function NotificationsSection() {
  return (
    <SettingsCard
      title="Notifications"
      description="Preferences are read-only — coming soon."
    >
      <ul className={styles.list}>
        {PREFERENCES.map((pref) => (
          <li key={pref.label} className={styles.row}>
            <div>
              <div className={styles.label}>{pref.label}</div>
              <div className={styles.sub}>{pref.sub}</div>
            </div>
            <span
              className={`${styles.toggle} ${pref.defaultOn ? styles.on : ''}`}
              aria-hidden="true"
            >
              <span className={styles.knob} />
            </span>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
