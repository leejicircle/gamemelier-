'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { User } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface MobileMenuSheetProps {
  menuItems: { name: string; href: string }[];
  isActive: (href: string) => boolean;
  triggerClassName?: string;
  user?: User | null;
  onLogout?: () => void | Promise<void>;
}

export default function MenuDropDown({
  menuItems,
  isActive,
  triggerClassName,
  user,
  onLogout,
}: MobileMenuSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="gray"
          size="icon"
          aria-label="메뉴 열기"
          className={cn(triggerClassName)}
        >
          <Menu className="size-5 text-white" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[min(80vw,280px)] p-0"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-left">메뉴</SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col p-2 overflow-hidden">
          {menuItems.map(({ name, href }) => (
            <SheetClose className="text-white" asChild key={href}>
              <Link
                href={href}
                className={cn(
                  'rounded-md px-3 py-2 text-sm hover:bg-purple2 whitespace-nowrap',
                  isActive(href) ? 'text-white font-bold' : 'text-white/80',
                )}
              >
                {name}
              </Link>
            </SheetClose>
          ))}

          <div className="mt-3 flex flex-col gap-2">
            {user ? (
              <SheetClose asChild>
                <Button
                  onClick={onLogout}
                  className="w-full"
                  size="sm"
                >
                  로그아웃
                </Button>
              </SheetClose>
            ) : (
              <>
                <SheetClose asChild>
                  <Button
                    asChild
                    variant="purple"
                    className="w-full text-white"
                    size="sm"
                  >
                    <Link href="/login">로그인</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild className="w-full" size="sm">
                    <Link href="/signup">회원가입</Link>
                  </Button>
                </SheetClose>
              </>
            )}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
