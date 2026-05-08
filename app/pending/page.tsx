import { TaskListPage } from "@/components/TaskListPage";

export default function PendingPage() {
  return (
    <TaskListPage
      status="pending"
      title="All Pending"
      subtitle="Every task that has been delegated but not yet started or completed."
      emptyMessage="No pending tasks. Use 'Add New Task' to delegate something."
    />
  );
}
