import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Crate, Dashboard, Facets, NowSpinningState, Play, PreviewCandidate, PreviewInfo, ReleaseDetail, ReleaseListItem, ReleaseQuery, SearchResults,
  SpinOptions, Stats, SyncStatus, Tag,
} from '@api/api-types';


import { api, request } from './client';

export type { Dashboard, SearchResults, Stats, SyncStatus };

export const useReleases = (q: ReleaseQuery) =>
  useQuery({
    queryKey: ['releases', q],
    queryFn: () => api.get<ReleaseListItem[]>('/api/releases', q as Record<string, string | number | boolean | undefined>),
    placeholderData: keepPreviousData,
  });

export const useRelease = (id: number) =>
  useQuery({ queryKey: ['release', id], queryFn: () => api.get<ReleaseDetail>(`/api/releases/${id}`), enabled: id > 0 });

export const useFacets = () => useQuery({ queryKey: ['facets'], queryFn: () => api.get<Facets>('/api/facets') });
export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/api/dashboard') });
export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api.get<Stats>('/api/stats') });
export const useSpinOptions = (enabled = true) =>
  useQuery({ queryKey: ['spin-options'], queryFn: () => api.get<SpinOptions>('/api/spin-options'), enabled });

export interface SpinPickParams {
  genre?: string[]; style?: string[]; format?: string; days?: number; neverPlayed?: boolean; exclude?: number[];
}

/** Each pick is a fresh random draw, so it is a mutation rather than a cached query. */
export const useSpinPick = () =>
  useMutation({
    mutationFn: ({ exclude, neverPlayed, ...rest }: SpinPickParams) =>
      api.get<{ release: ReleaseListItem | null }>('/api/spin-pick', {
        ...rest, neverPlayed: neverPlayed || undefined, exclude: exclude?.length ? exclude.join(',') : undefined,
      }).then((r) => r.release),
  });

export const useCrate = (id: number) => useQuery({ queryKey: ['crate', id], queryFn: () => api.get<Crate>(`/api/crates/${id}`) });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<SearchResults>('/api/search', { q }),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

export const useSyncStatus = () =>
  useQuery({
    queryKey: ['sync'],
    queryFn: () => api.get<SyncStatus>('/api/sync/status'),
    refetchInterval: (query) => (query.state.data?.running ? 2000 : 60_000),
  });

/** Invalidates everything derived from library data. */
function useInvalidate() {
  const qc = useQueryClient();
  return (releaseId?: number) => {
    if (releaseId) qc.invalidateQueries({ queryKey: ['release', releaseId] });
    for (const key of ['releases', 'facets', 'dashboard', 'stats', 'search', 'crate']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useSaveNote(releaseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bodyMd: string) => api.put<{ bodyMd: string; updatedAt: string }>(`/api/releases/${releaseId}/note`, { bodyMd }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['release', releaseId] });
      qc.invalidateQueries({ queryKey: ['search'] });
    },
  });
}

export function useAddTag(releaseId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.post<Tag>(`/api/releases/${releaseId}/tags`, { name }),
    onSuccess: () => invalidate(releaseId),
  });
}

export function useRemoveTag(releaseId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (tagId: number) => api.del(`/api/releases/${releaseId}/tags/${tagId}`),
    onSuccess: () => invalidate(releaseId),
  });
}

export function useCreateCrate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) => api.post<Crate>('/api/crates', body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCrate(id: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name?: string; description?: string }) => api.patch<Crate>(`/api/crates/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCrate() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api.del(`/api/crates/${id}`), onSuccess: () => invalidate() });
}

export function useAddToCrate(releaseId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (crateId: number) => api.post<Crate>(`/api/crates/${crateId}/releases`, { releaseId }),
    onSuccess: () => invalidate(releaseId),
  });
}

export function useRemoveFromCrate(releaseId?: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ crateId, releaseId: rid }: { crateId: number; releaseId: number }) =>
      api.del(`/api/crates/${crateId}/releases/${rid}`),
    onSuccess: (_d, v) => invalidate(releaseId ?? v.releaseId),
  });
}

export function useAddPlay(releaseId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { playedAt?: string; note?: string | null } = {}) => api.post<Play>(`/api/releases/${releaseId}/plays`, body),
    onSuccess: () => invalidate(releaseId),
  });
}

const NOW_SPINNING_KEY = ['nowSpinning'] as const;

/** What is on the turntable, from the server; polled so every open screen follows a tag tap. */
export const useNowSpinningState = () =>
  useQuery({
    queryKey: NOW_SPINNING_KEY,
    queryFn: () => api.get<NowSpinningState>('/api/now-spinning'),
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

/** Spin now: the server marks the record and logs the play (once per 10 minutes). */
export function useSetNowSpinning() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (releaseId: number) => api.put<NowSpinningState & { playLogged: boolean }>('/api/now-spinning', { releaseId }),
    onMutate: (releaseId) => {
      qc.setQueryData<NowSpinningState>(NOW_SPINNING_KEY, (old) => ({
        tap: 0, tapAgeMs: null, ...old, releaseId, source: 'manual', updatedAt: new Date().toISOString(),
      }));
    },
    onSuccess: ({ playLogged: _playLogged, ...state }, releaseId) => {
      qc.setQueryData(NOW_SPINNING_KEY, state);
      invalidate(releaseId);
    },
    onError: () => qc.invalidateQueries({ queryKey: NOW_SPINNING_KEY }),
  });
}

export function useClearNowSpinning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del('/api/now-spinning'),
    onMutate: () => {
      qc.setQueryData<NowSpinningState>(NOW_SPINNING_KEY, (old) => old && { ...old, releaseId: null, source: null, updatedAt: null });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOW_SPINNING_KEY }),
  });
}

export function useDeletePlay(releaseId: number) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (playId: number) => api.del(`/api/plays/${playId}`), onSuccess: () => invalidate(releaseId) });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SyncStatus>('/api/sync', { full: true }),
    onSuccess: (status) => qc.setQueryData(['sync'], status),
  });
}

// ---------------------------------------------------------------- previews

export const usePreviews = (releaseId: number, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['previews', releaseId],
    queryFn: () => api.get<PreviewInfo>(`/api/releases/${releaseId}/previews`),
    retry: false,
    staleTime: Infinity,
  });

export const usePreviewCandidates = (releaseId: number, enabled: boolean) =>
  useQuery({
    queryKey: ['preview-candidates', releaseId],
    queryFn: () => api.get<PreviewCandidate[]>(`/api/releases/${releaseId}/previews/candidates`),
    enabled,
    staleTime: 5 * 60_000,
  });

export function useSetPreviewAlbum(releaseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { appleAlbumId: number } | { none: true }) =>
      api.put<PreviewInfo>(`/api/releases/${releaseId}/previews`, body),
    onSuccess: (info) => qc.setQueryData(['previews', releaseId], info),
  });
}

export function useResetPreviews(releaseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<PreviewInfo>('DELETE', `/api/releases/${releaseId}/previews`),
    onSuccess: (info) => qc.setQueryData(['previews', releaseId], info),
  });
}
