import { PlatformSkeleton } from "@/components/platform/PlatformPrimitives";

/** Route-level fallback for every Control Center server-rendered screen. */
export default function PlatformLoading() {
  return <main className="platform-loading" aria-busy="true" aria-label="Loading Control Center">
    <div className="space-y-3"><PlatformSkeleton className="h-3 w-32" /><PlatformSkeleton className="h-10 w-[min(22rem,80vw)]" /><PlatformSkeleton className="h-4 w-[min(38rem,90vw)]" /></div>
    <div className="platform-loading__grid">{Array.from({ length: 4 }, (_, index) => <PlatformSkeleton key={index} className="h-32 border" />)}</div>
    <div className="platform-loading__panels"><PlatformSkeleton className="h-80 border" /><PlatformSkeleton className="h-80 border" /></div>
    <span className="sr-only">Loading Control Center data</span>
  </main>;
}
