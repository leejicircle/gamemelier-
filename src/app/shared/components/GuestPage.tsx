'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import bgImage from '@/assets/BgImage.png';
import LogoSvg from '@/assets/Group 1229.svg';
export default function GuestPage() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      <Image
        src={bgImage}
        alt="background"
        fill
        priority
        className="object-cover"
      />

      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#18181B]" />

      <div className="relative z-10 flex-row min-h-screen items-center justify-center">
        <div className="justify-center flex pt-20">
          <Image
            src={LogoSvg}
            alt="Gamemelier Logo"
            width={290}
            height={240}
            priority
            className="w-auto h-auto"
          />
        </div>

        <div className="py-4 text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
            <span className="align-middle">Gamemelier</span>
            <span className="ml-2 font-semibold text-white align-middle">
              에 오신걸 환영합니다
            </span>
          </h1>
          <div className="mt-16">
            <p className="text-lg text-gray-500">
              로그인 후 서비스를 이용하실 수 있습니다.
            </p>
            <p className="text-lg text-gray-500">
              첫 방문이시라면 회원가입을 진행하여 겜믈리에의 추천 게임을
              즐겨보세요!
            </p>
          </div>

          <div className="mt-16 flex items-center justify-center gap-3">
            <Button
              asChild
              variant="gray"
              className="px-5 py-5 md:px-6 md:py-6 text-sm md:text-base"
            >
              <Link href={'/signup'}>회원가입</Link>
            </Button>
            <Button
              asChild
              variant="purple"
              className="px-5 py-5 md:px-6 md:py-6 text-sm md:text-base"
            >
              <Link href={'/login'}>로그인 GO</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
