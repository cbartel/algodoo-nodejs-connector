import React from 'react';
import { useLocation } from 'react-router-dom';

import styles from './BrandingBadge.module.css';

export function BrandingBadge() {
  const loc = useLocation();
  const inGame = (loc.pathname || '').startsWith('/game');
  return (
    <div className={`${styles.badge} ${inGame ? styles.badgeGame : styles.badgeDefault}`}>
      made with <span className={styles.heart}>❤️</span> by Krise
    </div>
  );
}

export default BrandingBadge;
