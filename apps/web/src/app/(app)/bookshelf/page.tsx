import { AppEmptyState } from '@/components/app-shell/app-empty-state';

export const metadata = {
  title: 'Bookshelf · Plot-Twist',
};

export default function BookshelfPage() {
  return (
    <AppEmptyState
      eyebrow="Soon"
      title="Your Bookshelf"
      body="Books you've read, want to read, and marginalia — under construction."
    />
  );
}
