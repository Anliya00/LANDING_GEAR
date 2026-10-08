import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

export default function QueuePage() {
  return (
    <>
      <PageHeader title="Queue"
        description="Conversion and computation tasks picked up by the workers." />
      <EmptyState title="Not built yet" />
    </>
  );
}