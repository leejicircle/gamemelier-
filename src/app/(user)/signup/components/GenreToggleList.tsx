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
      <p className="font-semibold">선호 장르 선택</p>

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
                'rounded-full border px-3 py-1.5 text-sm',
                'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-transparent',
                'hover:bg-muted',
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
