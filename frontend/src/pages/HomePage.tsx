import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Home"
        description="Current state of the dataset and recent activity."
      />
      <EmptyState title="Not built yet" />
    </>
  );
}