'use client'

import { logger } from '@/lib/logger';
import React, { Suspense, lazy, ComponentProps, Component, ErrorInfo, ReactNode } from 'react'
const Spline = lazy(() => import('@splinetool/react-spline'))

type SplineProps = ComponentProps<typeof Spline>

interface SplineSceneProps {
  scene: string
  className?: string
  onLoad?: SplineProps['onLoad']
  onError?: SplineProps['onError']
}

interface ErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

class SplineErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false
  }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Spline rendering error caught:", error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}

export function SplineScene({ scene, className, onLoad, onError }: SplineSceneProps) {
  const fallbackSpinner = (
    <div className="w-full h-full flex items-center justify-center">
      <span className="loader"></span>
    </div>
  )

  return (
    <SplineErrorBoundary fallback={fallbackSpinner}>
      <Suspense fallback={fallbackSpinner}>
        <Spline
          scene={scene}
          className={className}
          onLoad={onLoad}
          onError={onError}
        />
      </Suspense>
    </SplineErrorBoundary>
  )
}
