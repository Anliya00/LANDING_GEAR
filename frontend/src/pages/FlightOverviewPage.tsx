import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

export default function FlightOverviewPage() {
  return (
    <>
      <PageHeader
        title="Flight Overview"
        description="Current state of the dataset and recent activity."
      />
      <EmptyState title="Not built yet" />
    </>
  );
}