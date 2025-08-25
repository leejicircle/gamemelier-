'use server';

import { createClient } from '@/lib/supabase/server';

export interface LoginState {
  error?: string;
  success?: boolean;
}

export async function loginAction(
  prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const supabase = await createClient();

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  };

  if (!data.email || !data.password) {
    return { error: '이메일과 비밀번호를 입력해주세요.' };
  }

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    return { error: '로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.' };
  }

  return { success: true };
}
