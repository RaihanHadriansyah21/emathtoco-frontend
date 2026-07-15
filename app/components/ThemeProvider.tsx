'use client';
 
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { startThemeTransition } from '@/lib/theme-transition';
 
function ThemeTransitionHelper() {
  const { resolvedTheme } = useTheme();
  const firstRender = useRef(true);

  useEffect(() => {
    // Skip the transition on initial mount to prevent a flash of theme transition
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    startThemeTransition();
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeTransitionHelper />
      {children}
    </NextThemesProvider>
  );
}
