export default function CompleteBlockScreen({ message }: { message?: string }) {
  return (
    <main className="fixed inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_15%_5%,#ffffff_0%,#ffeef8_35%,#f8d5e8_100%)] p-6">
      <div className="w-full max-w-sm rounded-[2rem] bg-white/95 p-8 text-center shadow-[0_22px_60px_rgba(150,9,83,0.28)] ring-1 ring-[var(--yl-card-border)]">
        <img src="/yogurtland-logo.png" alt="Yogurtland" className="mx-auto h-8 w-auto" draggable={false} />
        <h1 className="mt-3 text-2xl font-black text-[var(--yl-ink-strong)]">Froyo Catcher</h1>
        <div className="mt-6 rounded-2xl bg-[#fff4f0] px-4 py-4 text-sm font-bold leading-relaxed text-[#c0502a]">
          {message || "This campaign has ended. This page is no longer available."}
        </div>
      </div>
    </main>
  );
}
