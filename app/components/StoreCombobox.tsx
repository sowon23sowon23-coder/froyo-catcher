"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function StoreCombobox({
  stores,
  value,
  onChange,
  placeholder = "Search store...",
  wrapperClassName = "",
  inputClassName = "",
  disabled = false,
}: {
  stores: string[];
  value: string;
  onChange: (store: string) => void;
  placeholder?: string;
  wrapperClassName?: string;
  inputClassName?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => setMounted(true), []);

  // Sync input text when external value changes (e.g. "All Stores" button clicked)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) return;
    const h = () => updatePos();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("scroll", h, true);
      window.removeEventListener("resize", h);
    };
  }, [open]);

  const filtered = query.trim()
    ? stores.filter((s) => s.toLowerCase().includes(query.trim().toLowerCase()))
    : stores;

  const handleSelect = (store: string) => {
    onChange(store);
    setQuery(store);
    setOpen(false);
  };

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={inputRef}
        value={query}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return;
          setQuery(e.target.value);
          updatePos();
          setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          updatePos();
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          // Restore to the last confirmed selection
          setQuery(value);
        }}
        className={inputClassName}
      />
      {open &&
        mounted &&
        createPortal(
          <ul
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            onMouseDown={(e) => e.preventDefault()} // keep focus on input
            className="max-h-52 overflow-auto rounded-xl border border-[#f3bdd8] bg-white shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm font-semibold text-[#8d5b76]">No matching stores.</li>
            ) : (
              filtered.map((store) => (
                <li
                  key={store}
                  onClick={() => handleSelect(store)}
                  className={`cursor-pointer px-3 py-2 text-sm font-semibold ${
                    store === value ? "bg-[#fff1f8] text-[#960953]" : "text-[#4b0f31] hover:bg-[#fff4fb]"
                  }`}
                >
                  {store}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
