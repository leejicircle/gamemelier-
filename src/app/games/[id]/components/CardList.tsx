import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { PARENT_CATEGORIES, ParentCategory } from '@/lib/constants/categories';
import { GameDetail } from '@/types';

export function CardList({ data }: { data: GameDetail }) {
  const matchedGenres = data.genres.filter((genre): genre is ParentCategory =>
    PARENT_CATEGORIES.includes(genre as ParentCategory),
  );
  return (
    <>
      <Card className="w-48 bg-gray-900 px-4 py-5 gap-2 rounded-xl">
        <CardTitle className="text-gray-500">장르</CardTitle>
        <CardDescription className="text-white font-semibold">
          {matchedGenres.join(', ')}
        </CardDescription>
      </Card>
      <Card className="w-48 bg-gray-900 px-4 py-5 gap-2 rounded-xl">
        <CardTitle className="text-gray-500">출시일자</CardTitle>
        <CardDescription className="text-white font-semibold">
          {data.release_date_text}
        </CardDescription>
      </Card>
      <Card className="w-48 bg-gray-900 px-4 py-5 gap-2 rounded-xl">
        <CardTitle className="text-gray-500">발행자</CardTitle>
        <CardDescription className="text-white font-semibold whitespace-pre-line">
          {data.publishers.join('\n')}
        </CardDescription>
      </Card>
      <Card className="w-48 bg-gray-900 px-4 py-5 gap-2 rounded-xl">
        <CardTitle className="text-gray-500">개발자</CardTitle>
        <CardDescription className="text-white font-semibold whitespace-pre-line">
          {data.developers}
        </CardDescription>
      </Card>
    </>
  );
}
