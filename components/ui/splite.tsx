'use client'

import React, { useEffect, useRef, useState } from 'react'
import { logger } from '@/lib/logger'

interface SplineSceneProps {
  scene: string
  className?: string
  onLoad?: () => void
  onError?: (err: unknown) => void
}

const fallbackSpinner = (
  <div className="w-full h-full flex items-center justify-center">
    <span className="loader"></span>
  </div>
)

export function SplineScene({ scene, className, onLoad, onError }: SplineSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false

    // Use @splinetool/runtime directly instead of the React component.
    // The React component (<Spline>) throws synchronously during render when
    // fetch fails, which triggers Next.js dev overlay and cannot be caught by
    // any ErrorBoundary or window handler in dev mode.
    // By using the runtime directly inside useEffect, ALL errors (including
    // network failures) are caught in the promise .catch() chain and never
    // surface as uncaught errors.
    import('@splinetool/runtime')
      .then(({ Application }) => {
        if (disposed) return
        const app = new Application(canvas)
        return app.load(scene)
      })
      .then(() => {
        if (disposed) return
        setLoading(false)
        onLoad?.()
      })
      .catch((err) => {
        if (disposed) return
        logger.warn('[SplineScene] Spline scene failed to load (graceful fallback):', err)
        setFailed(true)
        setLoading(false)
        onError?.(err)
      })

    return () => {
      disposed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  // When failed, render nothing — the parent (LoginAIScene) handles showing
  // the static fallback based on its own hasError/onError state.
  if (failed) {
    return null
  }

  return (
    <>
      {loading && fallbackSpinner}
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          display: loading ? 'none' : 'block',
        }}
      />
    </>
  )
}
