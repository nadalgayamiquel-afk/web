import masterBackupData from "@/public/master_backup.json";

export function getMasterBackupTable(tableName: string): any[] {
  try {
    const tableData = (masterBackupData as any)?.database_tables?.[tableName];
    if (tableData && Array.isArray(tableData.rows)) return tableData.rows;
    if (Array.isArray(tableData)) return tableData;
  } catch (e) {
    console.warn("[masterBackup] Error reading table " + tableName + ":", e);
  }
  return [];
}

export function getMasterBackupData(): any {
  return masterBackupData;
}
