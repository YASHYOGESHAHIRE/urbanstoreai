"use client";

import { Shirt, Footprints, ShoppingBag, Watch, Leaf, LayoutGrid } from "lucide-react";

const categories = [
  { label: "All", icon: LayoutGrid },
  { label: "Fashion", icon: Shirt },
  { label: "Footwear", icon: Footprints },
  { label: "Bags", icon: ShoppingBag },
  { label: "Accessories", icon: Watch },
  { label: "Lifestyle", icon: Leaf },
];

interface CategoryNavProps {
  active: string;
  onChange: (cat: string) => void;
}

export default function CategoryNav({ active, onChange }: CategoryNavProps) {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {categories.map(({ label, icon: Icon }) => {
            const isActive = active === label;
            return (
              <button
                key={label}
                onClick={() => onChange(label)}
                className={`flex flex-col items-center gap-1.5 px-5 py-3.5 min-w-[80px] transition-all border-b-2 ${
                  isActive
                    ? "border-black bg-black text-white rounded-t-none"
                    : "border-transparent text-gray-500 hover:text-black hover:border-gray-300"
                }`}
                style={isActive ? { borderBottomColor: "transparent", background: "#111", borderRadius: "8px 8px 0 0", marginBottom: "-1px" } : {}}
              >
                <Icon size={20} strokeWidth={1.5} />
                <span className="text-[12px] font-medium whitespace-nowrap">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
