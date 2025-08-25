import localFont from 'next/font/local';

export const pretendard = localFont({
  src: [
    {
      path: '../fonts/PretendardVariable.woff2',
      weight: '45 920',
      style: 'normal',
    },
  ],
  variable: '--font-pretendard',
  display: 'swap',
});
