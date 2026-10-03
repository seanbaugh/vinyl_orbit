// JSON shapes shared between server and web. Types only — no runtime imports.

export interface TrackRow {
  /** tracks.idx — stable key for previews */
  idx: number;
  position: string;
  type: string;
  title: string;
  duration: string;
  artists: string;
  credits: string;
}

export interface SideGroup {
  side: string;
  tracks: TrackRow[];
  totalSeconds: number | null;
}

export interface Tag {
  id: number;
  name: string;
  color: string | null;
  count?: number;
}

export interface Crate {
  id: number;
  name: string;
  description: string;
  count: number;
  createdAt: string;
}

export interface Play {
  id: number;
  playedAt: string;
  note: string | null;
}

export interface ReleaseListItem {
  id: number;
  title: string;
  artists: string;
  year: number | null;
  formatSummary: string;
  genres: string[];
  styles: string[];
  labels: { name: string; catno: string }[];
  coverUrl: string | null;
  dateAdded: string;
  lowestPrice: number | null;
  playCount: number;
  lastPlayedAt: string | null;
  tags: Tag[];
  copies: number;
  removed: boolean;
}

export interface ReleaseDetail extends ReleaseListItem {
  country: string | null;
  released: string | null;
  masterId: number | null;
  discogsUrl: string;
  discogsNotes: string | null;
  numForSale: number | null;
  communityRating: number | null;
  communityVotes: number | null;
  have: number | null;
  want: number | null;
  sides: SideGroup[];
  images: { idx: number; url: string; width: number | null; height: number | null }[];
  credits: { name: string; role: string }[];
  companies: { name: string; role: string }[];
  identifiers: { type: string; value: string; description?: string }[];
  videos: { uri: string; title: string }[];
  note: { bodyMd: string; updatedAt: string } | null;
  crates: Crate[];
  plays: Play[];
  priceHistory: { date: string; lowestPrice: number | null; numForSale: number | null }[];
  detailSyncedAt: string | null;
}

export type SortKey = 'artist' | 'title' | 'year' | 'added' | 'played' | 'plays' | 'value';

export interface ReleaseQuery {
  q?: string;
  genre?: string;
  style?: string;
  format?: string;
  decade?: number;
  label?: string;
  artist?: string;
  tag?: number;
  crate?: number;
  sort?: SortKey;
  order?: 'asc' | 'desc';
  includeRemoved?: boolean;
}

export interface Facet {
  value: string;
  count: number;
}

export interface Facets {
  genres: Facet[];
  styles: Facet[];
  formats: Facet[];
  decades: Facet[];
  labels: Facet[];
  artists: Facet[];
  tags: Tag[];
  crates: Crate[];
  total: number;
}

export interface Dashboard {
  stats: { records: number; estimatedValue: number; valuedCount: number; playsThisMonth: number; topGenre: string | null };
  recentlyAdded: ReleaseListItem[];
  pullSomething: ReleaseListItem[];
  recentlyPlayed: ReleaseListItem[];
  notPlayedInAWhile: ReleaseListItem[];
}

export interface Stats {
  byGenre: Facet[];
  byStyle: Facet[];
  byDecade: Facet[];
  byFormat: Facet[];
  byLabel: Facet[];
  mostPlayed: ReleaseListItem[];
  valueByGenre: { value: string; total: number }[];
  totalValue: number;
  playsByMonth: { month: string; count: number }[];
}

export interface SearchResults {
  releases: ReleaseListItem[];
  artists: Facet[];
  labels: Facet[];
  tracks: { releaseId: number; title: string; position: string; releaseTitle: string }[];
  notes: { releaseId: number; snippet: string; releaseTitle: string }[];
}

export interface SyncProgress {
  phase: 'idle' | 'collection' | 'details' | 'images' | 'done' | 'error';
  done: number;
  total: number;
  message?: string;
}

export interface SyncResult {
  added: number;
  removed: number;
  detailed: number;
  imagesSaved: number;
  errors: string[];
}

export interface SyncStatus {
  running: boolean;
  progress: SyncProgress;
  lastCompletedAt: string | null;
  lastError: string | null;
  lastResult: SyncResult | null;
}

export type PreviewStatus = 'auto' | 'manual' | 'none' | 'unmatched';

export interface PreviewInfo {
  status: PreviewStatus;
  album: { id: number; name: string; artist: string; url: string | null; artworkUrl: string | null } | null;
  tracks: Record<number, { previewUrl: string; url: string | null; source: 'album' | 'search' }>;
  matchedAt: string;
}

export interface PreviewCandidate {
  id: number;
  name: string;
  artist: string;
  year: number | null;
  trackCount: number;
  artworkUrl: string | null;
  url: string | null;
  score: number;
}
