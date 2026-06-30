'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import LogoSvg from '@/assets/Group 1229.svg';

/**
 * 앱 초기진입(콜드 로드) 인트로 스플래시.
 * - 다크 오버레이는 SSR 첫 페인트부터 떠서 진짜 첫 백지를 가린다.
 * - 하이드레이션 후: 왕관이 스프링으로 등장 → 가볍게 플로트, 환영 문구가 뒤따라 페이드인.
 * - 최소 노출 뒤 AnimatePresence 가 오버레이를 페이드아웃하고 DOM 에서 제거.
 * - SPA 이동에선 루트 레이아웃이 리마운트되지 않아 다시 뜨지 않음(콜드 진입 전용).
 */
export default function AppIntroLoader() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    // 환영 문구가 읽히도록 최소 노출 후 퇴장
    const t = setTimeout(() => setShow(false), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          aria-hidden
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
        >
          <div className="flex flex-col items-center gap-6">
            {/* 스프링 등장 → 무한 플로트 (등장과 플로트를 중첩 분리) */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Image
                  src={LogoSvg}
                  alt=""
                  width={160}
                  height={132}
                  priority
                  className="w-[140px] tablet:w-[160px] h-auto"
                />
              </motion.div>
            </motion.div>

            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5, ease: 'easeOut' }}
            >
              <p className="text-2xl tablet:text-3xl font-extrabold tracking-tight text-white">
                Gamemelier
              </p>
              <p className="mt-2 text-sm tablet:text-base font-medium text-gray-400">
                에 오신 것을 환영합니다
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
