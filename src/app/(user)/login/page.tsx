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
      className="flex flex-col items-center justify-center min-h-screen bg-gray-100"
      aria-busy={redirecting}
    >
      <div className="p-8 bg-white rounded shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">로그인</h1>

        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="이메일을 입력하세요"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {state?.error && (
            <p className="text-red-500 text-sm text-center">{state.error}</p>
          )}

          <SubmitButton text="로그인" />
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            계정이 없으신가요?{' '}
            <Link
              href="/signup"
              className="text-green-600 hover:text-green-800 font-medium"
            >
              회원가입
            </Link>
          </p>
        </div>
      </div>
      {redirecting && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <Loader2
            className="h-36 w-36 animate-spin text-white"
            aria-label="화면 전환 중"
          />
        </div>
      )}
    </div>
  );
}
