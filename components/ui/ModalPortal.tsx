'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
  active?: boolean;
}

let activeScrollLocks = 0;
let previousBodyOverflow = '';
let previousBodyPaddingRight = '';

function lockBodyScroll() {
  const body = document.body;

  if (activeScrollLocks === 0) {
    previousBodyOverflow = body.style.overflow;
    previousBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  activeScrollLocks += 1;

  return () => {
    activeScrollLocks = Math.max(0, activeScrollLocks - 1);
    if (activeScrollLocks === 0) {
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    }
  };
}

export default function ModalPortal({ children, active = true }: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !active) return;
    return lockBodyScroll();
  }, [active, mounted]);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
