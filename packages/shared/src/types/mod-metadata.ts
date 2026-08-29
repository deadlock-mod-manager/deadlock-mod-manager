export interface DonationLink {
  url: string;
  platform: string;
}

export interface ModMetadata {
  mapName?: string;
  donationLinks?: DonationLink[];
}
