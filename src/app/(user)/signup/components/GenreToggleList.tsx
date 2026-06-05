'use client';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

interface GenreToggleListProps {
  genres: string[];
  favoriteGenres: string[];
  toggleGenre: (genre: string) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export default function GenreToggleList({
  genres,
  favoriteGenres,
  toggleGenre,
  disabled,
  loading,
  className,
}: GenreToggleListProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="font-semibold text-gray-200">선호 장르 선택</p>

      <div className="flex flex-wrap gap-2">
        {genres.map((genre) => {
          const selected = favoriteGenres.includes(genre);
          return (
            <Toggle
              key={genre}
              pressed={selected}
              onPressedChange={() => toggleGenre(genre)}
              disabled={disabled || loading}
              className={cn(
                'rounded-full border border-gray-700 px-3 py-1.5 text-sm text-gray-200 bg-transparent',
                'data-[state=on]:bg-purple2 data-[state=on]:text-white data-[state=on]:border-transparent',
                'hover:bg-gray-800 hover:text-white',
              )}
            >
              {genre}
            </Toggle>
          );
        })}
      </div>
    </div>
  );
}
