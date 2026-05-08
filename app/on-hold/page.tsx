import { TaskListPage } from "@/components/TaskListPage";

export default function OnHoldPage() {
  return (
    <TaskListPage
      status="on-hold"
      title="On Hold"
      subtitle="Tasks that are paused or waiting on someone. Restore them when ready."
      emptyMessage="No tasks on hold."
      allowedActions={["restore", "complete"]}
    />
  );
}
