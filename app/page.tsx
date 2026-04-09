import { WorkspaceErrorBoundary } from "@/components/error-boundary";
import { TranscribbleApp } from "@/components/transcribble-app";

export default function HomePage() {
  return (
    <WorkspaceErrorBoundary>
      <TranscribbleApp />
    </WorkspaceErrorBoundary>
  );
}
