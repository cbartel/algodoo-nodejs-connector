/* eslint-env browser */
import { useEffect } from 'react';

/** Prevent page scrolling while mounted (Dashboard layout). */
export function useNoPageScroll() {
  useEffect(() => {
    const prevHtmlH = document.documentElement.style.height;
    const prevBodyH = document.body.style.height;
    const prevBodyOv = document.body.style.overflow;
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.height = prevHtmlH;
      document.body.style.height = prevBodyH;
      document.body.style.overflow = prevBodyOv;
    };
  }, []);
}
