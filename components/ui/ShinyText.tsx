'use client';

import React from 'react';

export interface ShinyTextProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children' | 'color'> {
  text: string;
  disabled?: boolean;
  speed?: number; // duration in seconds
  delay?: number; // start delay in seconds
  className?: string;
  color?: string; // base text color
  shineColor?: string; // shine highlight color
  spread?: number; // angle in degrees
}

export default function ShinyText({
  text,
  disabled = false,
  speed = 2,
  delay = 0,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  ...props
}: ShinyTextProps) {
  if (disabled) {
    return (
      <span className={className} style={{ color }} {...props}>
        {text}
      </span>
    );
  }

  return (
    <span
      className={`inline-block ${className}`}
      style={{
        backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: `shiny-text-sweep ${speed}s infinite linear`,
        animationDelay: `${delay}s`,
      }}
      {...props}
    >
      {text}
    </span>
  );
}
