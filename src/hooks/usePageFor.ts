import { useState } from 'react';

/**
 * A page number that goes back to page 1 by itself whenever `resetKey` changes
 * (new search, filter or scope), without an effect.
 */
export function usePageFor(resetKey: unknown) {
  const key = JSON.stringify(resetKey);
  const [state, setState] = useState<{ key: string; page: number }>({ key, page: 0 });
  const page = state.key === key ? state.page : 0;
  return [page, (p: number) => setState({ key, page: p })] as const;
}
