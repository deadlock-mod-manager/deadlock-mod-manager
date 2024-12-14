export interface GameBananaSubmission {
  _idRow: number
  _sModelName: string
  _sSingularTitle: string
  _sIconClasses: string
  _sName: string
  _sProfileUrl: string
  _tsDateAdded: number
  _tsDateModified: number
  _bHasFiles: boolean
  _aTags: Array<string>
  _aPreviewMedia: {
    _aImages: Array<{
      _sType: string
      _sBaseUrl: string
      _sFile: string
      _sFile220?: string
      _hFile220?: number
      _wFile220?: number
      _sFile530?: string
      _hFile530?: number
      _wFile530?: number
      _sFile100: string
      _hFile100: number
      _wFile100: number
      _sFile800?: string
      _hFile800?: number
      _wFile800?: number
      _sCaption?: string
    }>
  }
  _aSubmitter: {
    _idRow: number
    _sName: string
    _bIsOnline: boolean
    _bHasRipe: boolean
    _sProfileUrl: string
    _sAvatarUrl: string
    _aSubjectShaper?: {
      _sBorderStyle: string
      _sFont: string
      _sTextColor: string
      _sBorderColor: string
    }
    _sSubjectShaperCssCode?: string
  }
  _aGame: {
    _idRow: number
    _sName: string
    _sProfileUrl: string
    _sIconUrl: string
  }
  _aRootCategory: {
    _sName: string
    _sProfileUrl: string
    _sIconUrl: string
  }
  _sVersion: string
  _bIsObsolete: boolean
  _sInitialVisibility: string
  _bHasContentRatings: boolean
  _nLikeCount: number
  _bWasFeatured: boolean
  _nViewCount: number
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

export interface GameBananaTopSubmission {
  _idRow: number
  _sModelName: string
  _sName: string
  _sProfileUrl: string
  _sImageUrl: string
  _sThumbnailUrl: string
  _sInitialVisibility: string
  _sPeriod: string
  _aSubmitter: {
    _idRow: number
    _sName: string
    _bIsOnline: boolean
    _bHasRipe: boolean
    _sProfileUrl: string
    _sAvatarUrl: string
    _sMoreByUrl: string
  }
  _sDescription: string
  _nLikeCount: number
  _aRootCategory: {
    _sName: string
    _sProfileUrl: string
    _sIconUrl: string
  }
}
