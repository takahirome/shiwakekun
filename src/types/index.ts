export interface Config {
  categories: Record<string, string[]>;
  output_folders: string[];
  input_folder?: string;
}

export interface FileResult {
  file_path: string;
  success: boolean;
  message: string;
}

export interface OrganizeProgress {
  total_files: number;
  processed_files: number;
  current_result?: FileResult;
  finished: boolean;
  batch_progress?: boolean;
}

export type TabType = "files" | "folders" | "results" | "settings" | "permissions";

export interface PermissionStatus {
  accessibility: string;
  fullDiskAccess: string;
} 