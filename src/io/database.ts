import { invoke } from "@tauri-apps/api/core";
import type { Dataset } from "../core/types";
import { dedupeNames } from "./csv";

export type DatabaseKind = "oracle" | "sqlite";
export type QueryParamType = "text" | "number" | "boolean" | "null";

export interface DatabaseProfile {
  id: string;
  name: string;
  kind: DatabaseKind;
  host: string | null;
  port: number | null;
  serviceName: string | null;
  username: string | null;
  password: string | null;
  sqlitePath: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface QueryParam {
  name: string;
  value: string;
  valueType: QueryParamType;
}

export interface DatabaseQueryResult {
  columns: string[];
  rows: string[][];
  rowCount: number;
  truncated: boolean;
  sourceLabel: string;
}

export function emptyProfile(kind: DatabaseKind): DatabaseProfile {
  const now = Date.now();
  return {
    id: "",
    name: "",
    kind,
    host: kind === "oracle" ? "" : null,
    port: kind === "oracle" ? 1521 : null,
    serviceName: kind === "oracle" ? "" : null,
    username: kind === "oracle" ? "" : null,
    password: kind === "oracle" ? "" : null,
    sqlitePath: kind === "sqlite" ? "" : null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listDatabaseProfiles(): Promise<DatabaseProfile[]> {
  return invoke<DatabaseProfile[]>("list_database_profiles");
}

export async function saveDatabaseProfile(profile: DatabaseProfile): Promise<DatabaseProfile> {
  return invoke<DatabaseProfile>("save_database_profile", { profile });
}

export async function deleteDatabaseProfile(profileId: string): Promise<void> {
  await invoke("delete_database_profile", { profileId });
}

export async function testDatabaseConnection(profileId: string): Promise<void> {
  await invoke("test_database_connection", { profileId });
}

export async function runDatabaseQuery(profileId: string, sql: string, params: QueryParam[], maxRows: number): Promise<DatabaseQueryResult> {
  return invoke<DatabaseQueryResult>("run_database_query", {
    request: {
      profileId,
      sql,
      params,
      maxRows,
    },
  });
}

export function queryResultToDataset(result: DatabaseQueryResult): Dataset {
  const columnNames = dedupeNames(result.columns);
  const columns = columnNames.map((_, index) => result.rows.map((row) => String(row[index] ?? "")));
  return {
    name: result.sourceLabel,
    columnNames,
    columns,
    rowCount: result.rows.length,
  };
}
