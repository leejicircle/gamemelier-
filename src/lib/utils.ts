import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

//로그인 관련 에러메시지 한글 변환
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AuthError(err: any): string {
  const msg = String(err?.message ?? '').toLowerCase();

  if (msg.includes('already') && msg.includes('registered')) {
    return '이미 가입된 이메일입니다.';
  }
  if (msg.includes('invalid email')) {
    return '올바른 이메일 주소가 아닙니다.';
  }
  if (msg.includes('rate limit') || msg.includes('once every')) {
    return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (
    msg.includes('signups not allowed') ||
    msg.includes('signup not allowed')
  ) {
    return '현재 회원가입이 비활성화되어 있습니다.';
  }
  if (msg.includes('password')) {
    return '비밀번호를 확인해 주세요.';
  }
  if (err?.status && Number(err.status) >= 500) {
    return '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  return '회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}
