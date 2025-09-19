// Common shared types
type BaseUser = {
  _idRow: number;
  _sName: string;
  _bIsOnline: boolean;
  _bHasRipe: boolean;
  _sProfileUrl: string;
  _sAvatarUrl: string;
};

type BaseMedia = {
  _sType: string;
  _sBaseUrl: string;
  _sFile: string;
  _sFile100: string;
  _hFile100: number;
  _wFile100: number;
  _sFile220?: string;
  _hFile220?: number;
  _wFile220?: number;
  _sFile530?: string;
  _hFile530?: number;
  _wFile530?: number;
  _sFile800?: string;
  _hFile800?: number;
  _wFile800?: number;
};

type BaseCategory = {
  _sName: string;
  _sProfileUrl: string;
  _sIconUrl: string;
};

interface BaseGame extends BaseCategory {
  _idRow: number;
}

// Base submission interface for shared properties
type BaseSubmission = {
  _idRow: number;
  _sModelName: string;
  _sName: string;
  _sProfileUrl: string;
  _sInitialVisibility?: string;
  _bIsObsolete?: boolean;
  _nLikeCount?: number;
  _nViewCount?: number;
  _aSubmitter: BaseUser;
  _aGame: BaseGame;
  _aRootCategory: BaseCategory;
};

type GameBananaFile = {
  _idRow: number;
  _sFile: string;
  _nFilesize: number;
  _sDescription: string;
  _tsDateAdded: number;
  _nDownloadCount: number;
  _sAnalysisState: string;
  _sAnalysisResultCode: string;
  _sAnalysisResult: string;
  _bContainsExe: boolean;
  _sDownloadUrl: string;
  _sMd5Checksum: string;
  _sClamAvResult: string;
  _sAvastAvResult: string;
};

export interface GameBananaSubmission extends BaseSubmission {
  _sSingularTitle: string;
  _sIconClasses: string;
  _tsDateAdded: number;
  _tsDateModified: number;
  _bHasFiles: boolean;
  _aTags: Array<string | { _sTitle: string; _sValue: string }>;
  _aPreviewMedia: {
    _aImages: Array<BaseMedia & { _sCaption?: string }>;
  };
  _bHasContentRatings: boolean;
  _bWasFeatured: boolean;
  _bIsOwnedByAccessor: boolean;
  _aFeaturings: Array<{
    _sFeatureGroup: string;
    _sTitle: string;
    _sIconClasses: string;
    _tsDate: number;
  }>;
  _nPostCount?: number;
  _tsDateUpdated?: number;
}

export type GameBananaPaginatedResponse<T> = {
  _aRecords: T[];
  _aMetadata: {
    _nRecordCount: number;
    _nPerpage: number;
    _bIsComplete: boolean;
  };
};

export type GameBananaTopSubmission = BaseSubmission & {
  _sImageUrl: string;
  _sThumbnailUrl: string;
  _sPeriod: string;
  _aSubmitter: BaseUser & {
    _sMoreByUrl: string;
  };
  _sDescription: string;
};

export type GameBananaModDownload = {
  _bIsTrashed: boolean;
  _bIsWithheld: boolean;
  _aFiles: GameBananaFile[];
  _bAcceptsDonations: boolean;
  _bShowRipePromo: boolean;
  _sLicense: string;
};

export type GameBananaModFile = {
  _idRow: number;
  _sFile: string;
  _nFilesize: number;
  _sDescription: string;
  _tsDateAdded: number;
  _nDownloadCount: number;
  _sAnalysisState: string;
  _sAnalysisResultCode: string;
  _sAnalysisResult: string;
  _bContainsExe: boolean;
  _sDownloadUrl: string;
  _sMd5Checksum: string;
  _sClamAvResult: string;
  _sAvastAvResult: string;
};

export type GameBananaModProfile = BaseSubmission & {
  _nStatus: string;
  _bIsPrivate: boolean;
  _tsDateModified: number;
  _tsDateAdded: number;
  _tsDateUpdated?: number;
  _aPreviewMedia: {
    _aImages: BaseMedia[];
  };
  _sFeedbackInstructions?: string;
  _sCommentsMode: string;
  _bAccessorIsSubmitter: boolean;
  _bIsTrashed: boolean;
  _bIsWithheld: boolean;
  _nUpdatesCount: number;
  _bHasUpdates: boolean;
  _nAllTodosCount: number;
  _bHasTodos: boolean;
  _nPostCount: number;
  _aAttributes: unknown[];
  _aTags: string[] | Array<{ _sTitle: string; _sValue: string }>;
  _bCreatedBySubmitter: boolean;
  _bIsPorted: boolean;
  _nThanksCount: number;
  _aContentRatings?: Record<string, string>; // CRITICAL: NSFW content ratings
  _sInitialVisibility?: string; // CRITICAL: Visibility hint for NSFW
  _sDownloadUrl: string;
  _nDownloadCount: number;
  _aFiles: GameBananaFile[];
  _aArchivedFiles?: Array<{
    _idRow: number;
    _sFile: string;
    _nFilesize: number;
    _tsDateAdded: number;
    _nDownloadCount: number;
    _sDownloadUrl: string;
    _sMd5Checksum: string;
    _sAnalysisState: string;
    _sAnalysisResult: string;
    _sAnalysisResultVerbose: string;
    _sAvState: string;
    _sAvResult: string;
    _bIsArchived: boolean;
    _bHasContents: boolean;
    _sVersion: string;
    _sDescription: string;
  }>;
  _nSubscriberCount: number;
  _aContributingStudios: unknown[];
  _sLicense: string;
  _aLicenseChecklist: {
    yes: string[];
    ask: string[];
    no: string[];
  };
  _sDescription?: string; // CRITICAL: Description text for keyword detection
  _bGenerateTableOfContents: boolean;
  _sText: string; // CRITICAL: Main text content for keyword detection
  _bIsObsolete?: boolean;
  _nLikeCount?: number;
  _nViewCount?: number;
  _sVersion?: string;
  _bAcceptsDonations: boolean;
  _bShowRipePromo: boolean;
  _aEmbeddables: {
    _sEmbeddableImageBaseUrl: string;
    _aVariants: string[];
  };
  _bFollowLinks?: boolean;
  _aSubmitter: BaseUser & {
    _sUserTitle: string;
    _sHonoraryTitle: string;
    _tsJoinDate: number;
    _sSigUrl: string;
    _sPointsUrl: string;
    _sMedalsUrl: string;
    _sLocation: string;
    _sOnlineTitle: string;
    _sOfflineTitle: string;
    _nPoints: number;
    _nPointsRank: number;
    _aNormalMedals: [string, string, string, number][];
    _aRareMedals: [string, string, string, number][];
    _aLegendaryMedals: unknown[];
    _nBuddyCount: number;
    _nSubscriberCount: number;
    _aDonationMethods: unknown[];
    _bAccessorIsBuddy: boolean;
    _bBuddyRequestExistsWithAccessor: boolean;
    _bAccessorIsSubscribed: boolean;
    _aDefaultLicenseChecklist?: string[];
    _sDefaultLicense?: string;
  };
  _aGame: BaseGame & {
    _sAbbreviation: string;
    _sBannerUrl: string;
    _nSubscriberCount: number;
    _bHasSubmissionQueue: boolean;
    _bAccessorIsSubscribed: boolean;
  };
  _aCategory: BaseCategory & {
    _idRow: number;
    _sModelName: string;
  };
  _aFeaturings: {
    today: {
      _sFeatureGroup: string;
      _sTitle: string;
      _sIconClasses: string;
      _tsDate: number;
    };
  };
  _aCredits?: Array<{
    _sGroupName: string;
    _aAuthors: Array<{
      _sRole?: string;
      _sName: string;
      _idRow?: number;
      _sProfileUrl?: string;
      _bIsOnline?: boolean;
    }>;
  }>;
};

export type GameBananaSoundProfile = BaseSubmission & {
  _nStatus: string;
  _bIsPrivate: boolean;
  _tsDateModified: number;
  _tsDateAdded: number;
  _aPreviewMedia: {
    _aMetadata: {
      _sAudioUrl: string;
    };
  };
  _sCommentsMode: string;
  _bAccessorIsSubmitter: boolean;
  _bIsTrashed: boolean;
  _bIsWithheld: boolean;
  _nUpdatesCount: number;
  _bHasUpdates: boolean;
  _nAllTodosCount: number;
  _bHasTodos: boolean;
  _nPostCount: number;
  _aTags: Array<{ _sTitle: string; _sValue: string }>;
  _bCreatedBySubmitter: boolean;
  _bIsPorted: boolean;
  _nThanksCount: number;
  _sDownloadUrl: string;
  _nDownloadCount: number;
  _aFiles: Array<{
    _idRow: number;
    _sFile: string;
    _nFilesize: number;
    _tsDateAdded: number;
    _nDownloadCount: number;
    _sDownloadUrl: string;
    _sMd5Checksum: string;
    _sAnalysisState: string;
    _sAnalysisResult: string;
    _sAnalysisResultVerbose: string;
    _sAvState: string;
    _sAvResult: string;
    _bIsArchived: boolean;
    _bHasContents: boolean;
  }>;
  _nSubscriberCount: number;
  _aContributingStudios: unknown[];
  _sLicense: string;
  _aLicenseChecklist: {
    yes: string[];
    ask: string[];
    no: string[];
  };
  _sDescription: string;
  _bGenerateTableOfContents: boolean;
  _sText: string;
  _bAcceptsDonations: boolean;
  _bShowRipePromo: boolean;
  _aEmbeddables: {
    _sEmbeddableImageBaseUrl: string;
    _aVariants: string[];
  };
  _aSubmitter: BaseUser & {
    _sUserTitle: string;
    _sHonoraryTitle: string;
    _tsJoinDate: number;
    _sSigUrl: string;
    _sPointsUrl: string;
    _sMedalsUrl: string;
    _sLocation: string;
    _sOnlineTitle: string;
    _sOfflineTitle: string;
    _nPoints: number;
    _nPointsRank: number;
    _aNormalMedals: [string, string, string, number][];
    _aRareMedals: [string, string, string, number][];
    _aLegendaryMedals: unknown[];
    _nBuddyCount: number;
    _nSubscriberCount: number;
    _aDonationMethods: unknown[];
    _bAccessorIsBuddy: boolean;
    _bBuddyRequestExistsWithAccessor: boolean;
    _bAccessorIsSubscribed: boolean;
    _aDefaultLicenseChecklist: string[];
    _sDefaultLicense: string;
  };
  _bFollowLinks: boolean;
  _aGame: BaseGame & {
    _sAbbreviation: string;
    _sBannerUrl: string;
    _nSubscriberCount: number;
    _bHasSubmissionQueue: boolean;
    _bAccessorIsSubscribed: boolean;
  };
  _aCategory: BaseCategory & {
    _idRow: number;
    _sModelName: string;
  };
  _aCredits: Array<{
    _sGroupName: string;
    _aAuthors: Array<{
      _sRole: string;
      _idRow: number;
      _sName: string;
      _sProfileUrl: string;
      _bIsOnline: boolean;
    }>;
  }>;
};

export type GameBananaIndexSubmission = BaseSubmission & {
  _sSingularTitle: string;
  _sIconClasses: string;
  _tsDateAdded: number;
  _tsDateModified: number;
  _bHasFiles: boolean;
  _aTags: string[] | Array<{ _sTitle: string; _sValue: string }>;
  _aPreviewMedia: {
    _aImages: BaseMedia[];
  };
  _bHasContentRatings: boolean;
  _bWasFeatured: boolean;
  _bIsOwnedByAccessor: boolean;
};

export type GameBananaSoundSubmission = Omit<
  GameBananaIndexSubmission,
  "_aPreviewMedia"
> & {
  _aPreviewMedia: {
    _aMetadata: {
      _sAudioUrl: string;
    };
  };
};
