export interface DiscogsArtist {
  name: string;
  anv: string;
  join: string;
  role: string;
  tracks: string;
  id: number;
}

export interface DiscogsLabel {
  name: string;
  catno: string;
  id: number;
}

export interface DiscogsFormat {
  name: string;
  qty: string;
  text?: string;
  descriptions?: string[];
}

export interface DiscogsTrack {
  position: string;
  type_: 'track' | 'heading' | 'index';
  title: string;
  duration: string;
  artists?: DiscogsArtist[];
  extraartists?: DiscogsArtist[];
  sub_tracks?: DiscogsTrack[];
}

export interface DiscogsImage {
  type: 'primary' | 'secondary';
  uri: string;
  uri150: string;
  width: number;
  height: number;
}

export interface CollectionItem {
  id: number;
  instance_id: number;
  date_added: string;
  rating: number;
  basic_information: {
    id: number;
    master_id: number;
    title: string;
    year: number;
    cover_image: string;
    thumb: string;
    formats: DiscogsFormat[];
    labels: DiscogsLabel[];
    artists: DiscogsArtist[];
    genres: string[];
    styles: string[];
  };
}

export interface CollectionPage {
  pagination: { page: number; pages: number; items: number };
  releases: CollectionItem[];
}

export interface DiscogsRelease {
  id: number;
  title: string;
  year: number;
  country?: string;
  released?: string;
  notes?: string;
  master_id?: number;
  artists: DiscogsArtist[];
  extraartists?: DiscogsArtist[];
  labels: DiscogsLabel[];
  formats: DiscogsFormat[];
  genres?: string[];
  styles?: string[];
  tracklist: DiscogsTrack[];
  images?: DiscogsImage[];
  videos?: { uri: string; title: string; duration: number }[];
  identifiers?: { type: string; value: string; description?: string }[];
  companies?: { name: string; entity_type_name: string; catno: string }[];
  community?: { rating?: { average: number; count: number }; have?: number; want?: number };
  lowest_price: number | null;
  num_for_sale: number;
}
