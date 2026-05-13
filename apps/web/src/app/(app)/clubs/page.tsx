import { AppEmptyState } from '@/components/app-shell/app-empty-state';

export const metadata = {
  title: 'My Clubs · Plot-Twist',
};

export default function ClubsPage() {
  return (
    <AppEmptyState
      eyebrow="Soon"
      title="My Clubs"
      body="Every gathering you've joined, in one place."
    />
  );
}
