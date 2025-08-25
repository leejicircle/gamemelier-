'use client';

import { useEffect } from 'react';
import { useAuthStore, User } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase/client';
import { useProfileStore } from '@/store/useProfileStore';
import { saveSignupGenres } from '@/lib/fetchGenres';

export default function ClientAuthStatus({
  initialUser,
}: {
  initialUser: User | null;
}) {
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    setUser(initialUser);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session) {
          setUser({ id: session.user.id, email: session.user.email! });

          const { nickname, favoriteGenres, resetAll } =
            useProfileStore.getState();
          if (nickname) {
            await supabase
              .from('profiles')
              .update({ nickname })
              .eq('id', session.user.id);
          }
          if (favoriteGenres && favoriteGenres.length > 0) {
            await saveSignupGenres(favoriteGenres);
          }
          resetAll();
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('onAuthStateChange error:', error);
      }
    });

    return () => {
      try {
        subscription?.unsubscribe();
      } catch (error) {
        console.error('error', error);
      }
    };
  }, [initialUser, setUser]);

  return null;
}
