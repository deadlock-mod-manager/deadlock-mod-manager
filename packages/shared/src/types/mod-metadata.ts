export interface DonationLink {
  url: string;
  platform: string;
}

export interface EmbeddedVideo {
  provider: "youtube" | "vimeo";
  id: string;
  /** Access hash that unlisted Vimeo videos need in the player URL */
  hash?: string;
}

export interface ModMetadata {
  mapName?: string;
  donationLinks?: DonationLink[];
  /** Videos the author embedded on the submission page */
  videos?: EmbeddedVideo[];
}
