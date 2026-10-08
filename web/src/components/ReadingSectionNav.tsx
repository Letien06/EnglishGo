import Link from "@/components/IntentLink";

export type ReadingSection = "grammar" | "part5" | "part6" | "part7";

const sections = [
  { id: "grammar", label: "Ngữ pháp", name: "Ngữ pháp", href: "/read/grammar" },
  { id: "part5", label: "Part 5", name: "Part 5: Hoàn thành câu", href: "/read?part=part5" },
  { id: "part6", label: "Part 6", name: "Part 6: Hoàn thành đoạn văn", href: "/read?part=part6" },
  { id: "part7", label: "Part 7", name: "Part 7: Đọc hiểu", href: "/read?part=part7" },
] as const;

export default function ReadingSectionNav({ selected }: { selected: ReadingSection }) {
  return <nav aria-label="Các phần luyện đọc" className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1.5">
    {sections.map((section) => <Link key={section.id} href={section.href} aria-label={section.name} aria-current={selected === section.id ? "page" : undefined} className={`flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink sm:px-6 ${selected === section.id ? "bg-teal-soft text-teal-ink" : "text-muted hover:bg-surface-soft hover:text-ink"}`}>{section.label}</Link>)}
  </nav>;
}
