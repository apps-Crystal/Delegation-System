// User type definitions
// Will be populated from Google Sheets in Phase 2.

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  department?: string;
  role?: string;
  lastWeekCommitment?: string;
  thisWeekCommitment?: string;
}
