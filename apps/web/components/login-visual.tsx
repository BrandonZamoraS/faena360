'use client';

import { useEffect, useState } from 'react';
import Ferrofluid from './Ferrofluid';

export function LoginVisual() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    if (typeof window.matchMedia !== 'function') {
      return false;
    }

    return typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <div className="login-visual media-sensitive" aria-label="Fondo visual de acceso">
      <Ferrofluid
        className="login-visual-fluid"
        colors={['#4F46E5', '#06B6D4', '#E0F2FE']}
        speed={0.5}
        scale={1.6}
        turbulence={1}
        fluidity={0.1}
        rimWidth={0.2}
        sharpness={2.5}
        shimmer={1.5}
        glow={2}
        flowDirection="down"
        opacity={1}
        mouseInteraction
        mouseStrength={1}
        mouseRadius={0.35}
        color1="#ffffff"
        color2="#ffffff"
        color3="#ffffff"
        paused={prefersReducedMotion}
      />
      <div className="login-visual-static" aria-hidden="true" />
    </div>
  );
}
