'use client'

import React, { Suspense, lazy, ComponentProps } from 'react'
const Spline = lazy(() => import('@splinetool/react-spline'))


type SplineProps = ComponentProps<typeof Spline>

interface SplineSceneProps {
  scene: string
  className?: string
  onLoad?: SplineProps['onLoad']
  onError?: SplineProps['onError']
}

const fallbackSpinner = (
  <div className="w-full h-full flex items-center justify-center">
    <span className="loader"></span>
  </div>
)

export function SplineScene({ scene, className, onLoad, onError }: SplineSceneProps) {
  return (
    <Suspense fallback={fallbackSpinner}>
      <Spline
        scene={scene}
        className={className}
        onLoad={onLoad}
        onError={onError}
      />
    </Suspense>
  )
}
