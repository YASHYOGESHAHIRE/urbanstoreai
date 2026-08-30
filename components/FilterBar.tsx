"use client";

import { useState } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";

const filters = ["Price", "Brand", "Category", "Color", "Size", "Style", "Material", "Availability"];

const sortOptions = ["Popular", "Price: Low to High", "Price: High to Low", "Newest", "Rating"];

export default function FilterBar() {
  const [activeSort, setActiveSort] = useState("Popular");
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <div className="bg-[#f5f5f3] border-b border-gray-200 sticky top-14 z-40">
      <div className="max-w-[1400px] mx-auto px-6 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {/* Filter button */}
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-700 hover:border-gray-400 transition-colors flex-shrink-0">
          <SlidersHorizontal size={13} />
          Filter
        </button>

        <div className="w-px h-4 bg-gray-300 flex-shrink-0 mx-1" />

        {/* Filter dropdowns */}
        {filters.map((filter) => (
          <button
            key={filter}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-700 hover:border-gray-400 transition-colors flex-shrink-0"
          >
            {filter}
            <ChevronDown size={12} />
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1 min-w-4" />

        {/* Sort */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-700 hover:border-gray-400 transition-colors"
          >
            Sort by: {activeSort}
            <ChevronDown size={12} />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44 z-50">
              {sortOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setActiveSort(opt); setSortOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-[12px] hover:bg-gray-50 transition-colors ${
                    activeSort === opt ? "font-semibold text-black" : "text-gray-600"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
