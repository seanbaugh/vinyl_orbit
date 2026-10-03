// JSON shapes shared between server and web. Types only — no runtime imports.

export interface TrackRow {
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
