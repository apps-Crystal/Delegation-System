import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Task } from "@/types/task";

// Only export selected fields
function mapTasks(tasks: Task[]) {
  return tasks.map((t) => ({
    Doer: t.doerName,
    Task: t.description,
    Planned: t.plannedDate,
    Status: t.status,
  }));
}

export function exportTasksToExcel(tasks: Task[], filename = "tasks.xlsx") {
  const data = mapTasks(tasks);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  XLSX.writeFile(wb, filename);
}

export function exportTasksToPDF(tasks: Task[], filename = "tasks.pdf") {
  const data = mapTasks(tasks);
  const doc = new jsPDF();
  autoTable(doc, {
    head: [["Doer", "Task", "Planned", "Status"]],
    body: data.map((row) => [row.Doer, row.Task, row.Planned, row.Status]),
  });
  doc.save(filename);
}
