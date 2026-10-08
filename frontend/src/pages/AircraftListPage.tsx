import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

export default function AircraftListPage() {
  const [params] = useSearchParams();
  return (
    <>
      <PageHeader title="Flights" description="Select an aircraft to view its flights." />
      {params.get('needFlight') && (
        <p className="notice">Select a flight first — that page applies to one flight.</p>
      )}
      <EmptyState title="Not built yet" />
    </>
  );
}