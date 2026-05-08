import { TaskListPage } from "@/components/TaskListPage";

export default function FollowUpPage() {
  return (
    <TaskListPage
      dueToday
      title="Follow Up"
      subtitle="Tasks that are due today across every doer."
      emptyMessage="Nothing due today."
    />
  );
}
