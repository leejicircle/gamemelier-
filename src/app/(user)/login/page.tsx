'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginAction } from './actions';
import SubmitButton from './components/SubmitButton';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, { error: '' });
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (state.success) {
      setRedirecting(true);
      router.push('/');
    }
  }, [state, router]);

  return (
    <div
      className="flex flex-col items-center min-h-screen bg-gray-950 px-4 py-10 tablet:justify-center"
      aria-busy={redirecting}
    >
      <div className="p-6 tablet:p-8 bg-gray-900 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center text-white">
          로그인
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
              className="mt-1 block w-full px-3 py-2 bg-gray-950 text-white border border-gray-700 rounded-md shadow-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple2 focus:border-purple2"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {state?.error && (
            <p className="text-red-400 text-sm text-center">{state.error}</p>
          )}

          <SubmitButton text="로그인" />
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            계정이 없으신가요?{' '}
            <Link
              href="/signup"
              className="text-purple2 hover:text-purple font-medium"
            >
              회원가입
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
