'use client';
import { Button } from '@/components/ui/button';

export type GenreItem = { id: number; name: string };

export default function GenreFilter({
  genres,
  selectedId,
  onChange,
}: {
  genres: GenreItem[];
  selectedId: number;
  onChange: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {genres.map((g) => {
        const active = selectedId === g.id;
        return (
          <Button
            key={g.id}
            size="sm"
            variant={active ? 'purple' : 'gray'}
            onClick={() => onChange(g.id)}
          >
            {g.name}
          </Button>
        );
      })}
    </div>
  );
}
