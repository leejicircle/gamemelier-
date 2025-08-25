import Image from 'next/image';
import Gamemelier from '@/assets/Gamemelier.svg';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
export function Footer() {
  return (
    <footer className="w-full bg-gray-900 p-[40px] y-0">
      <div className="min-w-[281px]">
        <div className="mb-[40px]">
          <Image src={Gamemelier} width={145} height={18} alt="logo" />
        </div>
        <div className="flex-row text-sm text-gray-500 ">
          <p>© copyright. jiwon</p>
          <div className="flex mt-[20px] items-center h-5">
            <Link href="/terms">이용약관</Link>
            <Separator
              orientation="vertical"
              className="mx-2 bg-gray-800 h-[12px]"
            />
            <Link href="/privacy">개인정보처리방침</Link>
            <Separator
              orientation="vertical"
              className="mx-2 bg-gray-800 h-[12px]"
            />
            <Link href="/protection">정보보호정책</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
