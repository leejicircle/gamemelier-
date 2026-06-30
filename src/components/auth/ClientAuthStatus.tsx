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
    // initialUser 가 null 이면 스토어를 건드리지 않는다. useAuthStore 는 sessionStorage 에
    // persist 되므로, 새로고침 직후 살아있는 로그인 상태를 setUser(null) 로 덮어써
    // Nav 가 로그인→로그아웃→로그인으로 깜빡이는 것(FOUC)을 막는다.
    // 실제 인증 동기화는 아래 onAuthStateChange(마운트 시 현재 세션으로 발화)가 담당.
    if (initialUser !== null) setUser(initialUser);

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
