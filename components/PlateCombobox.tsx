"use client";

import { useState } from "react";

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

  const filtered = plates.filter((p) =>
    p.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-64">
      <input
        placeholder="🔍 Search plate..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border rounded-md px-3 py-2 text-sm w-full"
      />

      <div className="border mt-1 rounded-md max-h-48 overflow-auto bg-white shadow">
        {filtered.map((p) => (
          <div
            key={p}
            onClick={() => {
              onChange(p);
              setSearch(p);
            }}
            className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
              value === p ? "bg-gray-200 font-semibold" : ""
            }`}
          >
            {p}
          </div>
        ))}
      </div>
    </div>
  );
}   