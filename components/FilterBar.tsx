"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { SlidersHorizontal, ChevronDown, X, Check } from "lucide-react";
import { Product } from "@/lib/products";

// ─── Exported types ───────────────────────────────────────────────────────────

export const sortOptions = ["Popular", "Price: Low to High", "Price: High to Low", "Newest", "Discount"] as const;
export type SortOption = typeof sortOptions[number];

export interface ActiveFilters {
  priceMin: number | null;
  priceMax: number | null;
  brands: string[];
  colors: string[];
  sizes: string[];
  availability: string[];
}

export const emptyFilters: ActiveFilters = {
  priceMin: null, priceMax: null,
  brands: [], colors: [], sizes: [], availability: [],
};

function countActive(f: ActiveFilters): number {
  return (f.priceMin !== null || f.priceMax !== null ? 1 : 0) +
    f.brands.length + f.colors.length + f.sizes.length + f.availability.length;
}

// ─── Dropdown — fixed-position so it's never clipped by sticky/overflow ───────

function Dropdown({ label, activeCount, children }: {
  label: string;
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const recalcPos = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Use viewport-relative coords since the panel is position:fixed
      setPos({ top: r.bottom + 6, left: r.left });
    }
  };

  useEffect(() => {
    if (open) {
      recalcPos();
      // Recalc on scroll so panel tracks the button as page scrolls
      window.addEventListener("scroll", recalcPos, true);
      window.addEventListener("resize", recalcPos);
    }
    return () => {
      window.removeEventListener("scroll", recalcPos, true);
      window.removeEventListener("resize", recalcPos);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border flex-shrink-0 ${
          activeCount > 0
            ? "bg-black text-white border-black"
            : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
        }`}
      >
        {label}
        {activeCount > 0
          ? <span className="ml-0.5 w-4 h-4 bg-white/25 rounded-full text-[10px] flex items-center justify-center font-bold">{activeCount}</span>
          : <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        }
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-2xl shadow-2xl min-w-[220px] max-h-[60vh] overflow-y-auto"
        >
          {children}
        </div>
      )}
    </>
  );
}

// ─── Multi-select ─────────────────────────────────────────────────────────────

function MultiSelect({ options, selected, onChange }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  return (
    <div className="max-h-52 overflow-y-auto py-1">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button key={opt} onClick={() => toggle(opt)}
            className="w-full flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-gray-50 transition-colors text-left">
            <span className={`w-4 h-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 ${active ? "bg-black border-black" : "border-gray-300"}`}>
              {active && <Check size={10} className="text-white" strokeWidth={3} />}
            </span>
            <span className={active ? "text-black font-semibold" : "text-gray-700"}>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Price panel ──────────────────────────────────────────────────────────────

const PRICE_PRESETS = [
  { label: "Under ₹500",       min: null, max: 500  },
  { label: "₹500 – ₹1,500",   min: 500,  max: 1500 },
  { label: "₹1,500 – ₹3,000", min: 1500, max: 3000 },
  { label: "₹3,000 – ₹6,000", min: 3000, max: 6000 },
  { label: "Above ₹6,000",    min: 6000, max: null  },
];

function PricePanel({ priceMin, priceMax, onChange }: {
  priceMin: number | null; priceMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  return (
    <div className="py-1.5">
      <p className="px-4 pt-2 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Price Range</p>
      {PRICE_PRESETS.map((p) => {
        const active = priceMin === p.min && priceMax === p.max;
        return (
          <button key={p.label} onClick={() => onChange(active ? null : p.min, active ? null : p.max)}
            className="w-full flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-gray-50 transition-colors text-left">
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${active ? "bg-black border-black" : "border-gray-300"}`}>
              {active && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <span className={active ? "text-black font-semibold" : "text-gray-700"}>{p.label}</span>
          </button>
        );
      })}
      <div className="px-4 pt-2 pb-3 border-t border-gray-100 mt-1">
        <p className="text-[11px] text-gray-400 mb-2">Custom range</p>
        <div className="flex items-center gap-2">
          <input type="number" placeholder="Min" value={priceMin ?? ""}
            onChange={(e) => onChange(e.target.value ? +e.target.value : null, priceMax)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] outline-none focus:border-black" />
          <span className="text-gray-400 text-[12px]">–</span>
          <input type="number" placeholder="Max" value={priceMax ?? ""}
            onChange={(e) => onChange(priceMin, e.target.value ? +e.target.value : null)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] outline-none focus:border-black" />
        </div>
      </div>
    </div>
  );
}

function PanelFooter({ onClear }: { onClear: () => void }) {
  return (
    <div className="border-t border-gray-100 px-4 py-2 flex justify-end sticky bottom-0 bg-white rounded-b-2xl">
      <button onClick={onClear} className="text-[12px] text-gray-400 hover:text-black transition-colors font-medium">
        Clear
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FilterBarProps {
  products?: Product[];
  activeSort?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  activeFilters?: ActiveFilters;
  onFiltersChange?: (f: ActiveFilters) => void;
}

export default function FilterBar({
  products = [], activeSort = "Popular", onSortChange,
  activeFilters = emptyFilters, onFiltersChange,
}: FilterBarProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const sortPanelRef = useRef<HTMLDivElement>(null);
  const [sortPos, setSortPos] = useState({ top: 0, left: 0 });

  const recalcSortPos = () => {
    if (sortBtnRef.current) {
      const r = sortBtnRef.current.getBoundingClientRect();
      setSortPos({ top: r.bottom + 6, left: r.right - 208 });
    }
  };

  useEffect(() => {
    if (sortOpen) {
      recalcSortPos();
      window.addEventListener("scroll", recalcSortPos, true);
      window.addEventListener("resize", recalcSortPos);
    }
    return () => {
      window.removeEventListener("scroll", recalcSortPos, true);
      window.removeEventListener("resize", recalcSortPos);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOpen]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        sortPanelRef.current && !sortPanelRef.current.contains(e.target as Node) &&
        sortBtnRef.current && !sortBtnRef.current.contains(e.target as Node)
      ) setSortOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const options = useMemo(() => {
    const brands = [...new Set(products.map((p) => p.brand))].sort();
    const colors: string[] = [], sizes: string[] = [];
    for (const p of products) {
      for (const v of p.variants ?? []) {
        const a = v.attributes as Record<string, string>;
        if (a.color && !colors.includes(a.color)) colors.push(a.color);
        if (a.size  && !sizes.includes(a.size))   sizes.push(a.size);
      }
    }
    colors.sort();
    sizes.sort((a, b) => {
      const order = ["XS","S","M","L","XL","XXL","XXXL"];
      const ai = order.indexOf(a), bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1; if (bi !== -1) return 1;
      return isNaN(+a) ? a.localeCompare(b) : +a - +b;
    });
    return { brands, colors, sizes };
  }, [products]);

  const update = (patch: Partial<ActiveFilters>) => onFiltersChange?.({ ...activeFilters, ...patch });
  const total = countActive(activeFilters);

  return (
    <div className="bg-[#f5f5f3] border-b border-gray-200 sticky top-14 z-30">
      <div className="max-w-[1400px] mx-auto px-6 py-2.5 flex items-center gap-2">

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {/* Clear all / Filter icon */}
          {total > 0 ? (
            <button onClick={() => onFiltersChange?.(emptyFilters)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-full text-[12px] font-medium flex-shrink-0">
              <X size={11} /> Clear ({total})
            </button>
          ) : (
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-500 flex-shrink-0">
              <SlidersHorizontal size={13} /> Filter
            </button>
          )}

          <div className="w-px h-4 bg-gray-200 flex-shrink-0 mx-1" />

          {/* Price */}
          <Dropdown label="Price" activeCount={activeFilters.priceMin !== null || activeFilters.priceMax !== null ? 1 : 0}>
            <PricePanel priceMin={activeFilters.priceMin} priceMax={activeFilters.priceMax}
              onChange={(min, max) => update({ priceMin: min, priceMax: max })} />
            <PanelFooter onClear={() => update({ priceMin: null, priceMax: null })} />
          </Dropdown>

          {/* Brand */}
          {options.brands.length > 0 && (
            <Dropdown label="Brand" activeCount={activeFilters.brands.length}>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Brand</p>
              <MultiSelect options={options.brands} selected={activeFilters.brands}
                onChange={(brands) => update({ brands })} />
              <PanelFooter onClear={() => update({ brands: [] })} />
            </Dropdown>
          )}

          {/* Color */}
          {options.colors.length > 0 && (
            <Dropdown label="Color" activeCount={activeFilters.colors.length}>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Color</p>
              <MultiSelect options={options.colors} selected={activeFilters.colors}
                onChange={(colors) => update({ colors })} />
              <PanelFooter onClear={() => update({ colors: [] })} />
            </Dropdown>
          )}

          {/* Size */}
          {options.sizes.length > 0 && (
            <Dropdown label="Size" activeCount={activeFilters.sizes.length}>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Size</p>
              <MultiSelect options={options.sizes} selected={activeFilters.sizes}
                onChange={(sizes) => update({ sizes })} />
              <PanelFooter onClear={() => update({ sizes: [] })} />
            </Dropdown>
          )}

          {/* Availability */}
          <Dropdown label="Availability" activeCount={activeFilters.availability.length}>
            <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Availability</p>
            <MultiSelect options={["In stock", "Low stock", "Out of stock"]}
              selected={activeFilters.availability}
              onChange={(availability) => update({ availability })} />
            <PanelFooter onClear={() => update({ availability: [] })} />
          </Dropdown>
        </div>

        {/* Sort */}
        <div className="flex-shrink-0 ml-2">
          <button ref={sortBtnRef} onClick={() => setSortOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-700 hover:border-gray-400 transition-colors whitespace-nowrap">
            Sort: <span className="font-semibold text-black ml-0.5">{activeSort}</span>
            <ChevronDown size={12} className={`transition-transform ${sortOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {sortOpen && (
          <div ref={sortPanelRef}
            style={{ position: "fixed", top: sortPos.top, left: sortPos.left, zIndex: 9999 }}
            className="bg-white border border-gray-200 rounded-2xl shadow-2xl py-1.5 w-52">
            {sortOptions.map((opt) => (
              <button key={opt} onClick={() => { onSortChange?.(opt); setSortOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50 transition-colors flex items-center justify-between ${
                  activeSort === opt ? "font-semibold text-black" : "text-gray-600"
                }`}>
                {opt}
                {activeSort === opt && <Check size={13} className="text-black" strokeWidth={2.5} />}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
