'use client';

import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { cardTransition } from '@/styles/motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverScale?: boolean;
  variants?: Variants;
  accentColor?: string; // Optional top accent color border
}

export function GlassCard({
  children,
  className = '',
  onClick,
  hoverScale = true,
  variants = cardTransition,
  accentColor
}: GlassCardProps) {
  const CardComponent = onClick ? motion.button : motion.div;

  const motionProps = onClick
    ? {
        whileHover: hoverScale ? { scale: 1.015, translateY: -1 } : {},
        whileTap: { scale: 0.985 },
      }
    : {
        whileHover: hoverScale ? { scale: 1.015, translateY: -1 } : {},
      };

  return (
    <CardComponent
      variants={variants}
      {...motionProps}
      onClick={onClick}
      className={`relative bg-white dark:glass-card border border-slate-200 dark:border-neutral-900 rounded-2xl p-5 text-left transition-all duration-300 shadow-sm ${
        onClick ? 'cursor-pointer select-none' : ''
      } ${
        hoverScale
          ? 'hover:border-cyan-500/40 dark:hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.05)]'
          : ''
      } ${className}`}
    >
      {accentColor && (
        <>
          {/* Premium Glowing Ambient Backing */}
          <div className={`absolute top-0 left-6 right-6 h-[4px] bg-gradient-to-r ${accentColor} opacity-20 blur-[3px] rounded-full pointer-events-none`} />
          {/* Sleek Inset Accent Line */}
          <div className="absolute top-0 left-6 right-6 h-[2px] pointer-events-none">
            <div className={`w-full h-full rounded-full bg-gradient-to-r ${accentColor} opacity-80`} />
          </div>
        </>
      )}
      {children}
    </CardComponent>
  );
}

// ═══════════════════════════════════════════════════════
// STANDARD SHADCN CARD COMPONENTS
// ═══════════════════════════════════════════════════════
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm border-slate-200 dark:border-neutral-900 bg-white dark:bg-[#0A0A0F]/90",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

// Helper utility import for styling
import { cn } from "@/lib/utils"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

