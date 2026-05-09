"use client";

import dynamic from "next/dynamic";

const WalletSecurePageClient = dynamic(
  () => import("../components/WalletSecurePageClient"),
  {
    ssr: false,
    loading: () => (
      <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-4 sm:p-5">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white px-5 py-10 text-center text-sm font-bold text-[var(--yl-ink-muted)] shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
            Loading wallet...
          </section>
        </div>
      </main>
    ),
  }
);

export default function WalletPageClient({ initialTab }: { initialTab?: string }) {
  return <WalletSecurePageClient initialTab={initialTab} />;
}
