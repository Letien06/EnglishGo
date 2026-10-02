import ListeningIcon from "./ListeningIcon";
import type { TestFilter, TestSort } from "./listening-view-model";
import styles from "./listening.module.css";

export const TEST_FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "new", label: "Chưa làm" },
  { value: "learning", label: "Đang học" },
  { value: "complete", label: "Hoàn thành" },
] as const;

export default function ListeningToolbar({ filter, query, sort, counts, onFilter, onQuery, onSort, progressReady, hasYears }: {
  filter: TestFilter;
  query: string;
  sort: TestSort;
  counts: Record<TestFilter, number>;
  onFilter: (filter: TestFilter) => void;
  onQuery: (query: string) => void;
  onSort: (sort: TestSort) => void;
  progressReady: boolean;
  hasYears: boolean;
}) {
  return <div className={styles.toolbar}>
    <div className={styles.filters} role="group" aria-label="Lọc theo trạng thái">
      {TEST_FILTERS.map((entry) => <button key={entry.value} type="button" aria-label={`${entry.label} ${progressReady || entry.value === "all" ? counts[entry.value] : "—"}`} aria-pressed={filter === entry.value} onClick={() => onFilter(entry.value)} disabled={!progressReady && entry.value !== "all"}>
        {entry.label}<span>{progressReady || entry.value === "all" ? counts[entry.value] : "—"}</span>
      </button>)}
    </div>
    <div className={styles.tools}>
      <label className={styles.search}><ListeningIcon name="search" /><input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Tìm test hoặc bộ đề…" aria-label="Tìm test hoặc bộ đề" /></label>
      <label className={styles.sort}><span>Sắp xếp</span><select aria-label="Sắp xếp test" value={sort} onChange={(event) => onSort(event.target.value as TestSort)}>
        <option value="catalog">Theo bộ đề</option>
        <option value="newest" disabled={!hasYears}>{hasYears ? "Mới nhất (năm đề)" : "Mới nhất (chưa có năm đề)"}</option>
        <option value="progress-desc" disabled={!progressReady}>Tiến độ cao nhất</option>
        <option value="progress-asc" disabled={!progressReady}>Tiến độ thấp nhất</option>
      </select></label>
    </div>
  </div>;
}
