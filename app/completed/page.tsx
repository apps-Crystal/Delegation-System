import { TaskListPage } from "@/components/TaskListPage";

export default function CompletedPage() {
  return (
    <TaskListPage
      status="completed"
      title="Completed"
      subtitle="Read-only history of finished tasks. Review past work and stay accountable."
      emptyMessage="No completed tasks yet."
      showActions={false}
    />
  );
}
