import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ProfileState {
  nickname: string;
  favoriteGenres: string[];
  toggleGenre: (genre: string) => void;
  resetGenres: () => void;
  setGenres: (genres: string[]) => void;
  setNickname: (nickname: string) => void;
  resetAll: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      nickname: '',
      favoriteGenres: [],
      toggleGenre: (genre) => {
        const { favoriteGenres } = get();
        if (favoriteGenres.includes(genre)) {
          set({ favoriteGenres: favoriteGenres.filter((g) => g !== genre) });
        } else {
          set({ favoriteGenres: [...favoriteGenres, genre] });
        }
      },
      resetGenres: () => set({ favoriteGenres: [] }),
      setGenres: (genres) => set({ favoriteGenres: genres }),
      setNickname: (nickname) => set({ nickname }),
      resetAll: () => set({ nickname: '', favoriteGenres: [] }),
    }),
    {
      name: 'profile-storage',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
