import TestDashboardClient from "./TestDashboardClient";
import type { DauToeicPartTest } from "@/types/dautoeic";
import type { ListeningMetadata } from "../listen/_components/listening-view-model";
import type { ReactNode } from "react";

export default function StudyDashboard({ skill, part, tests, error, listeningMetadata, libraryTools }: {
  skill: "listening" | "reading";
  part: number;
  tests: DauToeicPartTest[];
  error: boolean;
  listeningMetadata?: ListeningMetadata;
  libraryTools?: ReactNode;
}) {
  return <TestDashboardClient key={`${skill}:${part}`} skill={skill} part={part} initialTests={tests} initialError={error} listeningMetadata={listeningMetadata} libraryTools={libraryTools} />;
}
