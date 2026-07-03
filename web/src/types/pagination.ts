export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  nextCursor?: string;
};