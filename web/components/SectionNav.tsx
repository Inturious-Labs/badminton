"use client";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "standings", label: "Standings" },
  { id: "disciplines", label: "Disciplines" },
  { id: "team-spotlight", label: "Teams" },
  { id: "pair-leaderboards", label: "Pairs" },
];

export function SectionNav() {
  return (
    <nav className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-200">
      <div className="mx-auto max-w-6xl px-3 sm:px-6 py-2">
        <ul className="flex items-center gap-2 sm:gap-4 overflow-x-auto text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-block px-3 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 whitespace-nowrap transition-colors"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
