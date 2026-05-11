import { AppEmptyState } from '@/components/app-shell/app-empty-state';

export const metadata = {
  title: 'Reading Desk · Plot-Twist',
};

export default function ReadingDeskPage() {
  return (
    <AppEmptyState
      eyebrow="Soon"
      title="Your Reading Desk"
      body="A quiet home for current reads, your clubs, and the next chapter. Arriving soon."
    />
  );
}
