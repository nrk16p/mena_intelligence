"use client";

import { useEffect, useRef, useState } from "react";

export function PlateCombobox({
  plates,
  value,
  onChange,
}: {
  plates: string[];
  value: string;
  onChange: (val: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = plates.filter((p) =>
    p.toLowerCase().includes(search.toLowerCase())
  );

  // close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="w-64 relative">
      <input
        placeholder={value || "🔍 Search plate..."}
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        className="border rounded-md px-3 py-2 text-sm w-full"
      />

      {open && (
        <div className="absolute z-50 w-full border mt-1 rounded-md max-h-48 overflow-auto bg-white shadow">
          {filtered.map((p) => (
            <div
              key={p}
              onClick={() => {
                onChange(p);
                setSearch("");
                setOpen(false);
              }}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                value === p ? "bg-gray-200 font-semibold" : ""
              }`}
            >
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
