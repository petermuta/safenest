import type { AppRole } from '@safenest/shared';
import { redirect } from 'next/navigation';
import { EstateProvider } from '@/components/estate-context';
import { Shell } from '@/components/shell';
import { createClient } from '@/lib/supabase/server';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('full_name, phone, role').eq('id', user.id).single();

  return (
    <EstateProvider userId={user.id} appRole={(profile?.role ?? 'resident') as AppRole}>
      <Shell name={profile?.full_name ?? profile?.phone ?? ''}>{children}</Shell>
    </EstateProvider>
  );
}
