import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useResizeSplit: manages a resizable two-column horizontal split.
 * Returns refs and state for container, left column width, and available height.
 */
export function useResizeSplit(initialLeft = 540, minLeft = 360, minRight = 320) {
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(initialLeft);
  const [resizing, setResizing] = useState(false);
  const [mainHeight, setMainHeight] = useState(480);

  const startResizing = useCallback(() => setResizing(true), []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const row = splitRef.current; if (!row) return;
      const rect = row.getBoundingClientRect();
      const total = rect.width;
      let next = e.clientX - rect.left; // width for left column
      if (next < minLeft) next = minLeft;
      if (next > total - minRight) next = total - minRight;
      setLeftWidth(Math.round(next));
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, minLeft, minRight]);

  useEffect(() => {
    const compute = () => {
      const row = splitRef.current;
      const top = row ? row.getBoundingClientRect().top : 0;
      const h = Math.max(240, Math.floor(window.innerHeight - top - 16));
      setMainHeight(h);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return { splitRef, leftWidth, startResizing, mainHeight } as const;
}

