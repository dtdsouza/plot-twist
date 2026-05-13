import { AppEmptyState } from '@/components/app-shell/app-empty-state';

export const metadata = {
  title: 'Discover · Plot-Twist',
};

export default function DiscoverPage() {
  return (
    <AppEmptyState
      eyebrow="Soon"
      title="Find a Club"
      body="Browse clubs by genre, cadence, and mood."
    />
  );
}
