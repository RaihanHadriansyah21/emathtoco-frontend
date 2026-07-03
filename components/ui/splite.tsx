'use client'

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
  onError?: (error: Error) => void
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
    // Intentionally empty — we do NOT log here because:
    // 1. logger.error triggers console.error which Next.js dev overlay picks up
    // 2. logger.warn still appears in terminal causing confusion
    // The parent (LoginAIScene) handles error state via onError prop.
    void error
    void errorInfo
    this.props.onError?.(error)
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

  // Suppress "Failed to fetch" errors from reaching Next.js dev overlay.
  // React dev mode re-throws ErrorBoundary-caught errors via setTimeout,
  // which fires a window 'error' event. We intercept it in capture phase
  // and prevent propagation to the overlay handler.
  React.useEffect(() => {
    const suppressSplineError = (event: ErrorEvent) => {
      if (
        event.message === 'Failed to fetch' ||
        event.message?.includes('Failed to fetch') ||
        event.message?.includes('NetworkError')
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('error', suppressSplineError, true)
    return () => window.removeEventListener('error', suppressSplineError, true)
  }, [])

  return (
    <SplineErrorBoundary
      fallback={fallbackSpinner}
      onError={(err) => onError?.(err)}
    >
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
