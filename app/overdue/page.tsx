import { TaskListPage } from "@/components/TaskListPage";

export default function OverduePage() {
  return (
    <TaskListPage
      overdue
      title="Overdue"
      subtitle="Active tasks whose planned date is before today. Clear these first."
      emptyMessage="Nothing overdue — every active task is planned for today or later."
      reverse
    />
  );
}
