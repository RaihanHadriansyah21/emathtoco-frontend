'use client'

import React, { Suspense, lazy, ComponentProps, Component, ErrorInfo, ReactNode } from 'react'
const Spline = lazy(() => import('@splinetool/react-spline'))

type SplineProps = ComponentProps<typeof Spline>

interface SplineSceneProps {
  scene: string
  className?: string
  onLoad?: SplineProps['onLoad']
  onError?: (err: unknown) => void
}

interface ErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
  onError?: (error: unknown) => void
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
    // Suppress console.error by logging as warning to prevent triggering Next.js dev overlay
    const msg = error.message || String(error);
    console.warn("[SplineErrorBoundary] Suppressed Spline render error:", msg);
    this.props.onError?.(error);
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
    <SplineErrorBoundary fallback={fallbackSpinner} onError={(err) => onError?.(err)}>
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
