import { Logo } from "@/components/layout/Logo";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <Logo className="scale-[1.26] md:scale-[1.28]" priority />
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
}
