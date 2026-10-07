import { useEffect, useState } from 'react';

/** The value after it stops changing for `ms`: search boxes that ask the server wait for the typing to pause. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
