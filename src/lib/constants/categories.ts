export const PARENT_CATEGORIES = [
  '액션',
  'RPG',
  '전략',
  '어드벤처',
  '시뮬레이션',
  '스포츠·레이싱',
  '기타',
] as const;

export type ParentCategory = (typeof PARENT_CATEGORIES)[number];
