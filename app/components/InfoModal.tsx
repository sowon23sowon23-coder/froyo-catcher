"use client";

import { useState } from "react";

export type InfoCard = {
  src: string;
  alt: string;
};

export function InfoModal({
  cards,
  initialIndex = 0,
  onClose,
}: {
  cards: InfoCard[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const card = cards[index];
  const hasPrev = index > 0;
  const hasNext = index < cards.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-[280px] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={card.src}
          alt={card.alt}
          className="w-full rounded-3xl shadow-2xl"
          draggable={false}
        />

        {/* Prev / Next arrows */}
        {hasPrev && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            className="absolute left-[-44px] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white font-black text-[var(--yl-primary)] shadow-lg text-base"
            aria-label="Previous"
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className="absolute right-[-44px] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white font-black text-[var(--yl-primary)] shadow-lg text-base"
            aria-label="Next"
          >
            ›
          </button>
        )}

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white font-black text-[var(--yl-primary)] shadow-lg text-lg leading-none"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Dot indicators */}
        {cards.length > 1 && (
          <div className="mt-4 flex gap-2">
            {cards.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-5 bg-white" : "w-2 bg-white/40"
                }`}
                aria-label={`Go to card ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const ALL_INFO_CARDS: InfoCard[] = [
  { src: "/game-rules.png", alt: "Game Rules" },
  { src: "/how-to-redeem.png", alt: "How to Redeem" },
  { src: "/coupon-rules.png", alt: "Coupon Rules" },
  { src: "/coupon-tiers.png", alt: "Coupon Tiers" },
];
