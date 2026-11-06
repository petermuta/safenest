import type { AppRole } from '@safenest/shared';
import { redirect } from 'next/navigation';
import { EstateProvider } from '@/components/estate-context';
import { Shell } from '@/components/shell';
import { asUser } from '@/lib/server/db';
import { currentUserId } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const userId = await currentUserId();
  if (!userId) redirect('/login');

  const profile = await asUser(userId, (tx) =>
    tx.one(
      `select full_name, phone, role, public.is_police() as police,
              exists (select 1 from memberships where user_id = auth.uid() and active and role in ('manager', 'guard')) as staff
         from profiles where id = auth.uid()`,
    ),
  );
  if (!profile) redirect('/login');
  // Police officers who don't also run an estate go straight to the police portal.
  if (profile.police && !profile.staff && profile.role !== 'super_admin') redirect('/police');

  return (
    <EstateProvider userId={userId} appRole={profile.role as AppRole}>
      <Shell name={profile.full_name ?? profile.phone ?? ''} police={!!profile.police}>{children}</Shell>
    </EstateProvider>
  );
}
