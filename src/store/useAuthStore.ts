import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { supabase } from '@/lib/supabase/client';

export interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;

  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,

      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),

      logout: async () => {
        set({ isLoading: true });
        const { error } = await supabase.auth.signOut();

        if (!error) {
          set({ user: null });
        } else {
          alert('로그아웃에 실패했습니다. 다시 시도해 주세요.');
          console.error('로그아웃 실패:', error);
        }

        set({ isLoading: false });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
