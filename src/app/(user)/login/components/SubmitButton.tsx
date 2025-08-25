import { Button } from '@/components/ui/button';
import React from 'react';
import { useFormStatus } from 'react-dom';
interface SubmitButtonProps {
  text: string;
}

const SubmitButton: React.FC<SubmitButtonProps> = ({ text }) => {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      variant={'purple'}
      className="w-full"
    >
      {pending ? `${text} 중...` : text}
    </Button>
  );
};

export default SubmitButton;
