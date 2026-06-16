'use client'

import { Suspense, lazy, ComponentProps } from 'react'
const Spline = lazy(() => import('@splinetool/react-spline'))

type SplineProps = ComponentProps<typeof Spline>

interface SplineSceneProps {
  scene: string
  className?: string
  onLoad?: SplineProps['onLoad']
}

export function SplineScene({ scene, className, onLoad }: SplineSceneProps) {
  return (
    <Suspense 
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <span className="loader"></span>
        </div>
      }
    >
      <Spline
        scene={scene}
        className={className}
        onLoad={onLoad}
      />
    </Suspense>
  )
}
