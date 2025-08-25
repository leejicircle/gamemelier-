'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { User } from '@/store/useAuthStore';
import { AuthError } from '@/lib/utils';

export async function signupAction(
  prevState: { error: string; success?: boolean; user?: User },
  formData: FormData,
) {
  const supabase = await createClient();

  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: '이메일과 비밀번호를 입력해주세요.', success: false };
  }
  if (password.length < 6) {
    return { error: '비밀번호는 최소 6자 이상이어야 합니다.', success: false };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (authError) {
    return { error: AuthError(authError), success: false };
  }

  revalidatePath('/', 'layout');
  return {
    error: '',
    success: true,
    user: authData.user
      ? { id: authData.user.id, email: authData.user.email! }
      : undefined,
  };
}
