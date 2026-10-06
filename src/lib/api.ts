import { queryOptions } from "@tanstack/react-query";
import type {
  ChecklistResponse,
  ChecklistSummary,
  ContinueInfo,
  GameDetail,
  GameSummary,
  GuideMarker,
  GuideResponse,
  LockConflict,
  LockInfo,
  Notes,
  SaveFile,
  SaveStateInfo,
  Settings,
} from "@shared/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
  });
  if (res.status === 204) return null as T;
  const body: unknown = res.headers.get("content-type")?.includes("json")
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

const send = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const api = {
  games: () => request<{ games: GameSummary[]; error: string | null }>("/api/games"),
  game: (id: string) => request<GameDetail>(`/api/games/${id}`),
  continue: () => request<ContinueInfo>("/api/continue"),
  createSave: (gameId: string, name: string) =>
    request<SaveFile>(`/api/games/${gameId}/saves`, send("POST", { name })),
  renameSave: (saveId: string, name: string) =>
    request<SaveFile>(`/api/saves/${saveId}`, send("PATCH", { name })),
  lock: (
    saveId: string,
    body: { clientId: string; label: string; takeover?: boolean; playedSec?: number },
  ) => request<LockInfo>(`/api/saves/${saveId}/lock`, send("POST", body)),
  unlockBeacon: (saveId: string, clientId: string) =>
    navigator.sendBeacon(
      `/api/saves/${saveId}/unlock`,
      new Blob([JSON.stringify({ clientId })], { type: "application/json" }),
    ),
  states: (saveId: string) => request<SaveStateInfo[]>(`/api/saves/${saveId}/states`),
  guide: (gameId: string) => request<GuideResponse>(`/api/games/${gameId}/guide`),
  checklist: (saveId: string) => request<ChecklistResponse>(`/api/saves/${saveId}/checklist`),
  setChecked: (saveId: string, itemId: string, checked: boolean) =>
    request<{ checked: Record<string, number>; summary: ChecklistSummary }>(
      `/api/saves/${saveId}/checklist`,
      send("PATCH", { itemId, checked }),
    ),
  notes: (saveId: string) => request<Notes>(`/api/saves/${saveId}/notes`),
  setNotes: (saveId: string, body: string) =>
    request<Notes>(`/api/saves/${saveId}/notes`, send("PUT", { body })),
  marker: (saveId: string) => request<GuideMarker>(`/api/saves/${saveId}/marker`),
  setMarker: (saveId: string, sectionId: string | null) =>
    request<GuideMarker>(`/api/saves/${saveId}/marker`, send("PUT", { sectionId })),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (s: Settings) => request<Settings>("/api/settings", send("PUT", s)),
};

export const isLockConflict = (e: unknown): e is ApiError & { body: LockConflict } =>
  e instanceof ApiError && e.status === 409 && (e.body as LockConflict | null)?.error === "locked";

export const q = {
  games: () => queryOptions({ queryKey: ["games"], queryFn: api.games }),
  game: (id: string) => queryOptions({ queryKey: ["game", id], queryFn: () => api.game(id) }),
  continue: () => queryOptions({ queryKey: ["continue"], queryFn: api.continue }),
  states: (saveId: string) =>
    queryOptions({ queryKey: ["states", saveId], queryFn: () => api.states(saveId) }),
  guide: (gameId: string) =>
    queryOptions({
      queryKey: ["guide", gameId],
      queryFn: () => api.guide(gameId),
      staleTime: 5 * 60_000,
    }),
  checklist: (saveId: string) =>
    queryOptions({ queryKey: ["checklist", saveId], queryFn: () => api.checklist(saveId) }),
  notes: (saveId: string) =>
    queryOptions({ queryKey: ["notes", saveId], queryFn: () => api.notes(saveId) }),
  marker: (saveId: string) =>
    queryOptions({ queryKey: ["marker", saveId], queryFn: () => api.marker(saveId) }),
  settings: () =>
    queryOptions({ queryKey: ["settings"], queryFn: api.settings, staleTime: Infinity }),
};
