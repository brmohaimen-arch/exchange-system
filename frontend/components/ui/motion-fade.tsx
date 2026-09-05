"use client"

import { motion, type Variants } from "framer-motion"
import { useRef } from "react"
import { cn } from "@/lib/utils"

interface AnimatedSectionProps {
  children: React.ReactNode
  className?: string
  delay?: number
  direction?: "up" | "down" | "left" | "right" | "none"
  duration?: number
  once?: boolean
}

const directionVariants: Record<string, Variants> = {
  up: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0 },
  },
  down: {
    hidden: { opacity: 0, y: -24 },
    visible: { opacity: 1, y: 0 },
  },
  left: {
    hidden: { opacity: 0, x: -24 },
    visible: { opacity: 1, x: 0 },
  },
  right: {
    hidden: { opacity: 0, x: 24 },
    visible: { opacity: 1, x: 0 },
  },
  none: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
}

export function AnimatedSection({
  children,
  className,
  delay = 0,
  direction = "up",
  duration = 0.5,
  once = true,
}: AnimatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const variants = directionVariants[direction]

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-40px" }}
      variants={variants}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface AnimatedCardProps {
  children: React.ReactNode
  className?: string
  delay?: number
  index?: number
}

export function AnimatedCard({ children, className, delay = 0, index }: AnimatedCardProps) {
  const d = index !== undefined ? delay + index * 0.06 : delay
  return (
    <AnimatedSection delay={d} className={className}>
      <div className="card-hover h-full [&>*]:h-full">{children}</div>
    </AnimatedSection>
  )
}

export function StaggerContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  )
}

export const fadeInUpItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
}

export function FadeInView({ children, className, delay = 0, once = true, duration = 0.6 }: AnimatedSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-20px" }}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function ScaleOnHover({ children, className, scale = 1.02 }: { children: React.ReactNode, className?: string, scale?: number }) {
  return (
    <motion.div
      whileHover={{ scale }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function SlideIn({ children, className, direction = "up", delay = 0 }: AnimatedSectionProps) {
  const dirOffset = { up: { y: 30 }, down: { y: -30 }, left: { x: 30 }, right: { x: -30 }, none: {} }[direction]
  return (
    <motion.div
      initial={{ opacity: 0, ...dirOffset }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function BlurFade({ children, className, delay = 0, inView = true }: AnimatedSectionProps & { inView?: boolean }) {
  const content = (
    <motion.div
      initial={{ opacity: 0, filter: "blur(10px)", y: 10 }}
      animate={!inView ? { opacity: 1, filter: "blur(0px)", y: 0 } : undefined}
      whileInView={inView ? { opacity: 1, filter: "blur(0px)", y: 0 } : undefined}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
  return content
}
