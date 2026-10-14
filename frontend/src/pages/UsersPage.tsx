import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="User and Role Administration"
        description="Manage system users, roles and permissions."
        banner={true}
      />
      <EmptyState title="User Management Interface" />
    </>
  );
}