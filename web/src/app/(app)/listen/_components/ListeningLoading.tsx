import ListeningDashboard from "./ListeningDashboard";

export { default as ListeningGridSkeleton } from "./ListeningGridSkeleton";

export default function ListeningLoading({ skill = "listening" }: { skill?: "listening" | "reading" }) {
  return <ListeningDashboard skill={skill} part={skill === "reading" ? 5 : 1} tests={[]} initialError={false} progressError={false} progressReady={false} authenticated={false} catalogLoading />;
}
