"use client"

import { useEffect, useState } from "react"
import { requestBlob } from "@/lib/api/client"
import { Skeleton } from "./skeleton"
import { ImageIcon } from "lucide-react"

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  path: string
  fallback?: React.ReactNode
}

export function AuthenticatedImage({ path, fallback, className, ...props }: AuthenticatedImageProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let objectUrl: string | null = null

    const loadImage = async () => {
      if (!path) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(false)
        const blob = await requestBlob(path)
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      } catch (err) {
        console.error("Failed to load authenticated image:", err)
        setError(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadImage()

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [path])

  if (isLoading) {
    return <Skeleton className={className} />
  }

  if (error || !src) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 border border-slate-100 ${className}`}>
        {fallback || (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <ImageIcon className="h-8 w-8 opacity-20" />
            <span className="text-[10px] uppercase font-bold tracking-widest">Image unavailable</span>
          </div>
        )}
      </div>
    )
  }

  return <img src={src} className={className} {...props} />
}
