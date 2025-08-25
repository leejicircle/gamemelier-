'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  appId: number;
};

export default function ConfirmBuy({ appId }: Props) {
  const handleConfirm = () => {
    window.open(
      `https://store.steampowered.com/app/${appId}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="gradient"
          className="w-full h-[52px] text-xl font-semibold text-white px-4 py-3 leading-7 rounded-xl"
        >
          구입하기
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-gray-950 border-gray-800 border-1">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-white">
            스팀 구매창으로 이동하시겠습니까?
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            외부 사이트(스팀 스토어)로 이동합니다.
            <br /> 이동하는 사이트는 새창에서 열립니다.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="align-end">
          <DialogClose asChild>
            <Button className="bg-gray-600">취소</Button>
          </DialogClose>

          <Button onClick={handleConfirm} variant={'purple'}>
            이동
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
