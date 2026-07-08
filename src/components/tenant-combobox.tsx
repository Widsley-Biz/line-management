"use client";
import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

type TenantOption = { id: string; companyName: string };

export function TenantCombobox({
  tenants,
  name = "tenantId",
  defaultTenant = null,
  onChange,
  placeholder = "会社名で検索...",
}: {
  tenants: TenantOption[];
  name?: string;
  defaultTenant?: TenantOption | null;
  onChange?: (tenant: TenantOption | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(defaultTenant?.companyName ?? "");
  const [selected, setSelected] = useState<TenantOption | null>(defaultTenant);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? tenants.filter((t) =>
        t.companyName.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : [];

  function select(t: TenantOption) {
    setSelected(t);
    setQuery(t.companyName);
    setOpen(false);
    onChange?.(t);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setOpen(false);
    onChange?.(null);
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected) onChange?.(null);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => { if (query) setOpen(true); }}
          placeholder={placeholder}
          className="w-full h-8 pl-8 pr-7 rounded-md border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-52 overflow-auto text-sm">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="px-3 py-2 hover:bg-gray-50 cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault();
                select(t);
              }}
            >
              {t.companyName}
            </li>
          ))}
        </ul>
      )}

      {open && query && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg px-3 py-2 text-sm text-gray-400">
          該当なし
        </div>
      )}
    </div>
  );
}
