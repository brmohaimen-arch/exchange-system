"use client"

import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  width?: number
  height?: number
  link?: boolean
}

export function Logo({ className, width = 120, height = 40, link = true }: LogoProps) {
  const logoContent = (
    <div className={cn("relative flex items-center", className)}>
      <Image
        src="/CareSys.png"
        alt="CareSys Logo"
        width={width}
        height={height}
        className="dark:invert-0 invert transition-all duration-300 object-contain"
        priority
      />
    </div>
  )

  if (link) {
    return (
      <Link href="/" className="hover:opacity-90 transition-opacity">
        {logoContent}
      </Link>
    )
  }

  return logoContent
}
