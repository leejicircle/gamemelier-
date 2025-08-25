'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import Logo from '@/assets/Gamemelier.svg';

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '../../components/ui/navigation-menu';
import Search from './Search';

const menuItems = [
  { name: '전체 게임', href: '/games' },
  { name: '추천 게임', href: '/recommend' },
  { name: '출시예정', href: '/upcoming' },
  { name: '마이페이지', href: '/mypage' },
];

export default function Nav() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname?.startsWith(href));
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="w-full bg-gray-950 items-center h-15">
      <nav className="w-full h-12 grid grid-cols-[1fr_auto_1fr] items-center px-5 py-3">
        <div className="flex items-center justify-start">
          <Link href="/" className="inline-flex  items-center ">
            <Image
              src={Logo}
              alt="Gamemelier"
              className="h-4.5 w-auto"
              priority
            />
          </Link>
        </div>

        <div className="flex items-center justify-center">
          <NavigationMenu>
            <NavigationMenuList>
              {menuItems.map((item) => (
                <NavigationMenuItem
                  key={item.href}
                  className="inline-flex items-center"
                >
                  <NavigationMenuLink asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        'px-2 text-sm font-medium transition-colors',
                        isActive(item.href) ? 'text-white' : 'text-white/80',
                        'hover:text-white',
                      )}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                    >
                      {item.name}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Search />

          {user ? (
            <div className="inline-flex items-center gap-2">
              <Button onClick={handleLogout} size="sm" className="h-8">
                로그아웃
              </Button>
            </div>
          ) : (
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: 'sm', variant: 'purple' }),
                'h-8 rounded-md ',
              )}
            >
              로그인
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
