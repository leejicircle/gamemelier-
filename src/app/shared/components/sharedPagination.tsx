'use client';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  page: number;
  totalPages: number;
  totalCount: number;
  isLoading?: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPageChange: (page: number) => void;
  className?: string;
};

export default function AppPagination({
  page,
  totalPages,
  totalCount,
  isLoading = false,
  hasPrev,
  hasNext,
  onPageChange,
  className,
}: Props) {
  return (
    <div
      className={[
        'mt-6 flex flex-col items-center gap-3 bg-transparent',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink
              href="#"
              aria-disabled={!hasPrev || isLoading}
              className={
                'bg-transparent text-white rounded-md px-2 py-1 transition-transform hover:scale-110 ' +
                (!hasPrev || isLoading ? 'opacity-50 cursor-not-allowed' : '')
              }
              onClick={(e) => {
                e.preventDefault();
                if (!hasPrev || isLoading) return;
                onPageChange(Math.max(1, page - 1));
              }}
            >
              <ChevronLeft />
            </PaginationLink>
          </PaginationItem>

          {(() => {
            const windowSize = 5;
            const chunkIndex = Math.floor((page - 1) / windowSize);
            const start = chunkIndex * windowSize + 1;
            const end = Math.min(totalPages, start + windowSize - 1);

            const items = [] as React.ReactNode[];
            for (let p = start; p <= end; p++) {
              const active = p === page;
              items.push(
                <PaginationItem key={p}>
                  <PaginationLink
                    href="#"
                    isActive={active}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'bg-purple2 text-white rounded-full w-6 h-6'
                        : 'text-gray-700'
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      if (isLoading || p === page) return;
                      onPageChange(p);
                    }}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>,
              );
            }
            return items;
          })()}

          <PaginationItem>
            <PaginationLink
              href="#"
              aria-disabled={!hasNext || isLoading}
              className={
                'bg-transparent text-white rounded-md px-2 py-1 transition-transform hover:scale-110 ' +
                (!hasNext || isLoading ? 'opacity-50 cursor-not-allowed' : '')
              }
              onClick={(e) => {
                e.preventDefault();
                if (!hasNext || isLoading) return;
                onPageChange(page + 1);
              }}
            >
              <ChevronRight />
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <span>Total items: {totalCount}</span>
    </div>
  );
}
