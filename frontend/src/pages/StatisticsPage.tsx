import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

export default function StatisticsPage() {
  return (
    <>
      <PageHeader
        title="Statistics"
        description="Current state of the dataset and recent activity."
      />
      <EmptyState title="Not built yet" />
    </>
  );
}