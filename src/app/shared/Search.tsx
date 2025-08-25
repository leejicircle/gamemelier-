'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command';
import { SearchIcon } from 'lucide-react';
import { useSearchGames } from '@/lib/hooks/useSearchGames';
import Image from 'next/image';

export default function Search() {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const router = useRouter();

  const { data: searchResults = [], isFetching } = useSearchGames(
    searchText,
    8,
  );

  return (
    <Popover
      open={isPopoverOpen}
      onOpenChange={(nextOpen) => {
        setIsPopoverOpen(nextOpen);
        if (!nextOpen) setSearchText('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="gray"
          size="icon"
          aria-label="검색 열기"
          className="h-9 w-9 rounded-full"
        >
          <SearchIcon className="w-5 h-5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={-36}
        className="p-0 w-90 z-50"
      >
        <Command shouldFilter={false} className="z-50">
          <CommandInput
            placeholder="게임 이름 검색"
            value={searchText}
            onValueChange={setSearchText}
          />
          <CommandList>
            {isFetching && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                검색 중…
              </div>
            )}
            <CommandEmpty></CommandEmpty>

            {searchResults.map((item) => (
              <CommandItem
                key={item.id}
                value={item.name}
                onSelect={() => {
                  setIsPopoverOpen(false);
                  setSearchText('');
                  router.push(`/games/${item.id}`);
                }}
              >
                {item.image ? (
                  <Image
                    src={item.image}
                    alt="image"
                    width={100}
                    height={46}
                    className="mr-3 rounded w-auto h-auto"
                  />
                ) : (
                  <div className="mr-3 h-6 w-12 rounded bg-muted" />
                )}
                <span className="line-clamp-1 text-bold text-md">
                  {item.name}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
