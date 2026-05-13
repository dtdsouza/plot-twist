import { AppEmptyState } from '@/components/app-shell/app-empty-state';

export const metadata = {
  title: 'Notifications · Plot-Twist',
};

export default function NotificationsPage() {
  return (
    <AppEmptyState
      eyebrow="Soon"
      title="The Daily Page"
      body="Replies, invites, and meeting reminders will live here."
    />
  );
}
