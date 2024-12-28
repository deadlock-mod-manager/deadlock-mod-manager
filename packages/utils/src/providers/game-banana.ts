// Common shared types
interface BaseUser {
  _idRow: number
  _sName: string
  _bIsOnline: boolean
  _bHasRipe: boolean
  _sProfileUrl: string
  _sAvatarUrl: string
}

interface BaseMedia {
  _sType: string
  _sBaseUrl: string
  _sFile: string
  _sFile100: string
  _hFile100: number
  _wFile100: number
  _sFile220?: string
  _hFile220?: number
  _wFile220?: number
  _sFile530?: string
  _hFile530?: number
  _wFile530?: number
  _sFile800?: string
  _hFile800?: number
  _wFile800?: number
}

interface BaseCategory {
  _sName: string
  _sProfileUrl: string
  _sIconUrl: string
}

interface BaseGame extends BaseCategory {
  _idRow: number
}

// Base submission interface for shared properties
interface BaseSubmission {
  _idRow: number
  _sModelName: string
  _sName: string
  _sProfileUrl: string
  _sInitialVisibility?: string
  _bIsObsolete?: boolean
  _nLikeCount?: number
  _nViewCount?: number
  _aSubmitter: BaseUser
  _aGame: BaseGame
  _aRootCategory: BaseCategory
}

interface GameBananaFile {
  _idRow: number
  _sFile: string
  _nFilesize: number
  _sDescription: string
  _tsDateAdded: number
  _nDownloadCount: number
  _sAnalysisState: string
  _sAnalysisResultCode: string
  _sAnalysisResult: string
  _bContainsExe: boolean
  _sDownloadUrl: string
  _sMd5Checksum: string
  _sClamAvResult: string
  _sAvastAvResult: string
}

export interface GameBananaSubmission extends BaseSubmission {
  _sSingularTitle: string
  _sIconClasses: string
  _tsDateAdded: number
  _tsDateModified: number
  _bHasFiles: boolean
  _aTags: Array<string | { _sTitle: string; _sValue: string }>
  _aPreviewMedia: {
    _aImages: Array<BaseMedia & { _sCaption?: string }>
  }
  _bHasContentRatings: boolean
  _bWasFeatured: boolean
  _bIsOwnedByAccessor: boolean
  _aFeaturings: Array<{
    _sFeatureGroup: string
    _sTitle: string
    _sIconClasses: string
    _tsDate: number
  }>
  _nPostCount?: number
  _tsDateUpdated?: number
}

export interface GameBananaPaginatedResponse<T> {
  _aRecords: T[]
  _aMetadata: {
    _nRecordCount: number
    _nPerpage: number
    _bIsComplete: boolean
  }
}

export type GameBananaTopSubmission = BaseSubmission & {
  _sImageUrl: string
  _sThumbnailUrl: string
  _sPeriod: string
  _aSubmitter: BaseUser & {
    _sMoreByUrl: string
  }
  _sDescription: string
}

export interface GameBananaModDownload {
  _bIsTrashed: boolean
  _bIsWithheld: boolean
  _aFiles: GameBananaFile[]
  _bAcceptsDonations: boolean
  _bShowRipePromo: boolean
  _sLicense: string
}

export interface GameBananaModFile {
  _idRow: number
  _sFile: string
  _nFilesize: number
  _sDescription: string
  _tsDateAdded: number
  _nDownloadCount: number
  _sAnalysisState: string
  _sAnalysisResultCode: string
  _sAnalysisResult: string
  _bContainsExe: boolean
  _sDownloadUrl: string
  _sMd5Checksum: string
  _sClamAvResult: string
  _sAvastAvResult: string
}

export type GameBananaModProfile = BaseSubmission & {
  _nStatus: string
  _bIsPrivate: boolean
  _tsDateModified: number
  _tsDateAdded: number
  _aPreviewMedia: {
    _aImages: Array<BaseMedia>
  }
  _sCommentsMode: string
  _bAccessorIsSubmitter: boolean
  _bIsTrashed: boolean
  _bIsWithheld: boolean
  _nUpdatesCount: number
  _bHasUpdates: boolean
  _nAllTodosCount: number
  _bHasTodos: boolean
  _nPostCount: number
  _aAttributes: Array<any>
  _aTags: Array<string> | Array<{ _sTitle: string; _sValue: string }>
  _bCreatedBySubmitter: boolean
  _bIsPorted: boolean
  _nThanksCount: number
  _sDownloadUrl: string
  _nDownloadCount: number
  _aFiles: GameBananaFile[]
  _nSubscriberCount: number
  _aContributingStudios: Array<any>
  _sLicense: string
  _aLicenseChecklist: {
    yes: Array<string>
    ask: Array<string>
    no: Array<string>
  }
  _bGenerateTableOfContents: boolean
  _sText: string
  _bAcceptsDonations: boolean
  _bShowRipePromo: boolean
  _aEmbeddables: {
    _sEmbeddableImageBaseUrl: string
    _aVariants: Array<string>
  }
  _aSubmitter: BaseUser & {
    _sUserTitle: string
    _sHonoraryTitle: string
    _tsJoinDate: number
    _sSigUrl: string
    _sPointsUrl: string
    _sMedalsUrl: string
    _sLocation: string
    _sOnlineTitle: string
    _sOfflineTitle: string
    _nPoints: number
    _nPointsRank: number
    _aNormalMedals: Array<[string, string, string, number]>
    _aRareMedals: Array<[string, string, string, number]>
    _aLegendaryMedals: Array<any>
    _nBuddyCount: number
    _nSubscriberCount: number
    _aDonationMethods: Array<any>
    _bAccessorIsBuddy: boolean
    _bBuddyRequestExistsWithAccessor: boolean
    _bAccessorIsSubscribed: boolean
  }
  _aGame: BaseGame & {
    _sAbbreviation: string
    _sBannerUrl: string
    _nSubscriberCount: number
    _bHasSubmissionQueue: boolean
    _bAccessorIsSubscribed: boolean
  }
  _aCategory: BaseCategory & {
    _idRow: number
    _sModelName: string
  }
  _aFeaturings: {
    today: {
      _sFeatureGroup: string
      _sTitle: string
      _sIconClasses: string
      _tsDate: number
    }
  }
  _aCredits: Array<{
    _sGroupName: string
    _aAuthors: Array<{
      _idRow: number
      _sName: string
      _sProfileUrl: string
      _bIsOnline: boolean
    }>
  }>
}

export type GameBananaIndexSubmission = BaseSubmission & {
  _sSingularTitle: string
  _sIconClasses: string
  _tsDateAdded: number
  _tsDateModified: number
  _bHasFiles: boolean
  _aTags: Array<string> | Array<{ _sTitle: string; _sValue: string }>
  _aPreviewMedia: {
    _aImages: Array<BaseMedia>
  }
  _bHasContentRatings: boolean
  _bWasFeatured: boolean
  _bIsOwnedByAccessor: boolean
}
