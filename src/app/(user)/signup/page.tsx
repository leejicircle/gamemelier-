'use client';

import { signupAction } from './actions';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';
import { useProfileStore } from '@/store/useProfileStore';

import GenreToggleList from './components/GenreToggleList';
import { PARENT_CATEGORIES } from '@/lib/constants/categories';
import SubmitButton from '../login/components/SubmitButton';

export default function SignupPage() {
  const [state, formAction] = useActionState(signupAction, {
    error: '',
    success: false,
    user: undefined,
  });
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const favoriteGenres = useProfileStore((s) => s.favoriteGenres);
  const toggleGenre = useProfileStore((s) => s.toggleGenre);
  const resetGenres = useProfileStore((s) => s.resetGenres);

  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    resetGenres();
    return () => resetGenres();
  }, [resetGenres]);

  useEffect(() => {
    if (state?.success && state?.user) {
      setUser(state.user);
      resetGenres();
      setRedirecting(true);
      router.push('/login');
    }
  }, [state?.success, state?.user, setUser, resetGenres, router]);

  const genreNames = PARENT_CATEGORIES as unknown as string[];

  return (
    <div
      className="flex flex-col items-center min-h-screen bg-gray-950 px-4 py-10"
      aria-busy={redirecting}
    >
      <div className="p-6 tablet:p-8 bg-gray-900 rounded-lg shadow-md w-full max-w-sm tablet:my-auto">
        <h1 className="text-2xl font-bold mb-6 text-center text-white">
          회원가입
        </h1>

        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-200"
            >
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 block w-full px-3 py-2 bg-gray-950 text-white border border-gray-700 rounded-md shadow-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple2 focus:border-purple2"
              placeholder="이메일을 입력하세요"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-200"
            >
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className="mt-1 block w-full px-3 py-2 bg-gray-950 text-white border border-gray-700 rounded-md shadow-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple2 focus:border-purple2"
              placeholder="비밀번호를 입력하세요 (최소 6자)"
            />
          </div>

          <div>
            <label
              htmlFor="nickname"
              className="block text-sm font-medium text-gray-200"
            >
              닉네임
            </label>
            <input
              id="nickname"
              name="nickname"
              type="text"
              maxLength={30}
              className="mt-1 block w-full px-3 py-2 bg-gray-950 text-white border border-gray-700 rounded-md shadow-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple2 focus:border-purple2"
              placeholder="닉네임 (최대 30자)"
            />
          </div>

          {favoriteGenres.map((genre) => (
            <input
              key={genre}
              type="hidden"
              name="favoriteGenres"
              value={genre}
            />
          ))}

          <GenreToggleList
            genres={genreNames}
            favoriteGenres={favoriteGenres}
            toggleGenre={toggleGenre}
          />

          {state?.error && (
            <p className="text-red-400 text-sm mb-2 text-center">
              {state.error}
            </p>
          )}

          <SubmitButton text="회원가입" />
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            이미 계정이 있으신가요?{' '}
            <Link
              href="/login"
              className="text-purple2 hover:text-purple2/80 font-medium"
            >
              로그인
            </Link>
          </p>
        </div>
      </div>
      {redirecting && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <Loader2
            className="h-20 w-20 animate-spin text-purple2"
            aria-label="화면 전환 중"
          />
        </div>
      )}
    </div>
  );
}
