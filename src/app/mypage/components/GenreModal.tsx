'use client';

import { useEffect, useMemo, useState } from 'react';
import { saveSignupGenres } from '@/lib/fetchGenres';
import { useProfileQuery } from '@/lib/hooks/useProfileQuery';
import { useAuthStore } from '@/store/useAuthStore';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowDownUpIcon, Loader2 } from 'lucide-react';

import {
  PARENT_CATEGORIES,
  type ParentCategory,
} from '@/lib/constants/categories';
import { cn } from '@/lib/utils';

export default function GenreModal() {
  const user = useAuthStore((s) => s.user);
  const { data: profile, isLoading: loadingProfile } = useProfileQuery(
    user?.id,
  );

  const baseline: string[] = useMemo(() => {
    const genre = (profile?.favorite_genres ?? []) as string[];

    return genre.filter((g) => PARENT_CATEGORIES.includes(g as ParentCategory));
  }, [profile?.favorite_genres]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(baseline);
  }, [open, baseline]);

  const toggle = (name: string) =>
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name],
    );

  const dirty = useMemo(() => {
    if (baseline.length !== selected.length) return true;
    const a = [...baseline].sort();
    const b = [...selected].sort();
    return a.some((v, i) => v !== b[i]);
  }, [baseline, selected]);

  const onSave = async () => {
    try {
      setSaving(true);
      await saveSignupGenres(selected);
      setOpen(false);
    } catch (e) {
      console.error(e);

      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">선호 장르</h3>
        {loadingProfile && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="purple"
            className="text-xl font-semibold h-auto py-3 px-4 rounded-xl"
          >
            <ArrowDownUpIcon className="h-5 w-5" />
            선호 장르 설정
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-[560px] border-none bg-gray-950 ring-1 ring-gray-800 shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-white font-semibold text-xl">
              선호 장르 선택
            </DialogTitle>
            <DialogDescription className="text-gray-300 text-sm font-medium">
              가입/추천에 사용할 대표 장르를 선택하세요.
              <br /> 언제든 변경할 수 있어요.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 py-2">
            {PARENT_CATEGORIES.map((name) => {
              const pressed = selected.includes(name);
              return (
                <Toggle
                  key={name}
                  pressed={pressed}
                  onPressedChange={() => toggle(name)}
                  disabled={saving}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-md bg-gray-700 text-white hover:bg-white hover:text-gray-900',
                    'data-[state=on]:bg-white data-[state=on]:text-gray-900 data-[state=on]:border-transparent',
                  )}
                  aria-label={name}
                >
                  {name}
                </Toggle>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="bg-gray-600 text-white"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button
              variant={'purple'}
              onClick={onSave}
              disabled={!dirty || saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
