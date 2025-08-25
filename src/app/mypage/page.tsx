import { createClient } from '@/lib/supabase/server';
import GuestPage from '@/app/shared/components/GuestPage';
import MyPageClient from './client';

export default async function MyPagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <GuestPage />;

  return <MyPageClient />;
}
