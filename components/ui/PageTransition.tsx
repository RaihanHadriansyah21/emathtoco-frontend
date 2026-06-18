'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { pageTransition } from '@/styles/motion';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`w-full h-full ${className}`}
    >
      {children}
    </motion.div>
  );
}
