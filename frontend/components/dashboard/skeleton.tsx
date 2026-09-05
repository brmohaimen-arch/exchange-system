"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function DashboardSkeleton() {
  return (
    <div className="space-y-3 pb-20">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-28 rounded-md" />
        </div>
      </div>

      {/* KPI Grid Skeleton */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-border/50 shadow-sm overflow-hidden">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
              <Skeleton className="h-9 w-9 rounded-xl" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Grid Skeleton */}
      <div className="grid gap-2.5 lg:grid-cols-5">
        <Card className="lg:col-span-3 border-border/50 shadow-sm">
          <CardHeader className="pb-2 border-b border-border/30">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-28" />
              <div className="flex gap-3">
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <Skeleton className="h-[140px] w-full rounded-lg" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/50 shadow-sm">
          <CardHeader className="pb-2 border-b border-border/30">
            <Skeleton className="h-3.5 w-24" />
          </CardHeader>
          <CardContent className="p-3">
            <Skeleton className="h-[140px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>

      {/* List Skeletons */}
      <div className="grid gap-2.5 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i} className="border-border/50 shadow-sm">
            <CardHeader className="py-2.5 flex flex-row items-center justify-between border-b border-border/30">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-4 w-12 rounded" />
            </CardHeader>
            <CardContent className="p-0">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-center gap-3 px-3 py-2.5 border-b border-border/20 last:border-0">
                  <Skeleton className="h-6 w-6 rounded-lg" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-14 rounded" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
