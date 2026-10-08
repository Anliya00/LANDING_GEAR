import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

export default function FlightParametersPage() {
  return (
    <>
      <PageHeader
        title="Parameter"
        description="Current state of the dataset and recent activity."
      />
      <EmptyState title="Not built yet" />
    </>
  );
}