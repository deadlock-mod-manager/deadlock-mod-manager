export interface DonationLink {
  url: string;
  platform: string;
}

export interface ModAuthorMetadata {
  id: number;
  profileUrl: string;
  avatarUrl: string;
  hdAvatarUrl?: string;
  upicUrl?: string;
  title?: string;
}

export interface ModMetadata {
  mapName?: string;
  donationLinks?: DonationLink[];
  author?: ModAuthorMetadata;
}
