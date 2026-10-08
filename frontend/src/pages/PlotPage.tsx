import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

export default function PlotPage() {
  return (
    <>
      <PageHeader
        title="Plots"
        description="Current state of the dataset and recent activity."
      />
      <EmptyState title="Not built yet" />
    </>
  );
}