'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { pageTransition } from '@/styles/motion';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : pageTransition}
      initial={prefersReducedMotion ? false : 'initial'}
      animate={prefersReducedMotion ? { opacity: 1 } : 'animate'}
      exit={prefersReducedMotion ? undefined : 'exit'}
      className={`page-transition-surface w-full h-full ${className}`}
    >
      {children}
    </motion.div>
  );
}
