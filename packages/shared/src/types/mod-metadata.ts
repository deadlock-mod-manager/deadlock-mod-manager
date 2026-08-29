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
  signatureUrl?: string;
  title?: string;
  joinedAt?: number;
  subscriberCount?: number;
}

export interface ModMetadata {
  mapName?: string;
  donationLinks?: DonationLink[];
  author?: ModAuthorMetadata;
}
