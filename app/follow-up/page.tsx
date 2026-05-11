import { TaskListPage } from "@/components/TaskListPage";

export default function FollowUpPage() {
  return (
    <TaskListPage
      dueToday
      title="Follow Up"
      subtitle="Pending tasks planned for today or earlier."
      emptyMessage="No pending tasks due today or overdue."
    />
  );
}
