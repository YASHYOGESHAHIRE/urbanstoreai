"use client";

import { useState } from "react";
import { Send, Zap } from "lucide-react";
import Image from "next/image";

const suggestedPrompts = [
  "Running shoes under ₹3,000",
  "Minimal office bag",
  "Wedding outfit",
  "Gift under ₹1,500",
  "Something for travel",
];

interface HeroProps {
  onAISearch?: (query: string) => void;
}

export default function Hero({ onAISearch }: HeroProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && onAISearch) onAISearch(query.trim());
  };

  const handlePromptClick = (prompt: string) => {
    setQuery(prompt);
    if (onAISearch) onAISearch(prompt);
  };

  return (
    <section className="bg-[#f5f5f3] border-b border-gray-200">
      <div className="max-w-[1400px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Left: Text + Search */}
        <div className="max-w-[480px]">
          <p className="text-[11px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-3">
            AI · Native Shopping
          </p>

          <h1 className="text-[56px] md:text-[72px] font-black leading-[0.92] tracking-tight text-black uppercase mb-5">
            Find your<br />everyday.
          </h1>

          <p className="text-[14px] text-gray-500 leading-relaxed mb-6">
            Tell Urban AI what you need.<br />
            We&apos;ll search the store for you.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="relative mb-4">
            <div className="flex items-center bg-[#1a1a1a] rounded-full px-4 py-3 gap-3">
              <Zap size={16} className="text-[#c8f04b] flex-shrink-0" fill="#c8f04b" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What are you looking for?"
                className="flex-1 bg-transparent text-white placeholder-gray-400 text-[14px] outline-none"
              />
              <button
                type="submit"
                className="w-8 h-8 bg-[#c8f04b] rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[#b8e03b] transition-colors"
              >
                <Send size={14} className="text-black" />
              </button>
            </div>
          </form>

          {/* Suggested prompts */}
          <div>
            <p className="text-[11px] text-gray-400 mb-2 font-medium">Try these</p>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handlePromptClick(prompt)}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[12px] text-gray-600 hover:border-gray-400 hover:text-black transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Hero image */}
        <div className="relative rounded-2xl overflow-hidden bg-[#1a1a1a] h-[340px] lg:h-[380px]">
          <Image
            src="/hero-main.png"
            alt="Urban Attitude hero"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-center"
            priority
          />
          {/* Overlay text */}
          <div className="absolute inset-0 p-6 flex flex-col justify-between">
            <div className="self-end max-w-[180px] text-right">
              <p className="text-white text-[18px] font-bold italic leading-tight drop-shadow-lg">
                Style moves<br />with you.
              </p>
            </div>
            <div>
              <p className="text-gray-300 text-[11px] font-semibold tracking-widest uppercase mb-1">
                New Drop
              </p>
              <p className="text-white text-[20px] font-black uppercase tracking-tight">
                Urban Attitude
              </p>
              <p className="text-gray-300 text-[12px] mt-0.5">Spring Summer &apos;24</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
