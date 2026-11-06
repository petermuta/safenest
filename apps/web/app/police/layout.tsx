import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PoliceShell } from '@/components/police-shell';
import { asUser } from '@/lib/server/db';
import { currentUserId } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function PoliceLayout({ children }: { children: React.ReactNode }) {
  const userId = await currentUserId();
  if (!userId) redirect('/login');

  const officer = await asUser(userId, (tx) =>
    tx.one(
      `select o.id, o.full_name, o.role, o.on_duty, o.badge_no, s.name as station_name, s.level as station_level
         from police_officers o join police_stations s on s.id = o.station_id
        where o.user_id = auth.uid() and o.active`,
    ),
  );

  if (!officer) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="text-lg font-bold">Police portal</p>
          <p className="mt-2 text-muted">
            This phone number isn&apos;t registered as a police officer. Ask the SafeNest administrator to add you, then sign in again.
          </p>
          <Link href="/" className="btn btn-secondary mt-5">Back</Link>
        </div>
      </main>
    );
  }

  return <PoliceShell officer={officer}>{children}</PoliceShell>;
}
