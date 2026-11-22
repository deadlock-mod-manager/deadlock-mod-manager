export interface DonationLink {
  url: string;
  platform: string;
}

export interface EmbeddedVideo {
  provider: "youtube" | "vimeo";
  id: string;
  hash?: string;
}

export interface ModMetadata {
  mapName?: string;
  donationLinks?: DonationLink[];
  videos?: EmbeddedVideo[];
}
