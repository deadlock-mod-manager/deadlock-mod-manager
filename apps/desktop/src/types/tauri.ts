export type ErrorKind = {
  kind:
    | 'io'
    | 'utf8'
    | 'steamNotFound'
    | 'gameNotFound'
    | 'gamePathNotSet'
    | 'gameConfigParse'
    | 'modAlreadyInstalled'
    | 'modFileNotFound'
    | 'registry'
    | 'keyValues'
    | 'rar'
    | 'zip'
    | 'modInvalid'
    | 'unknown'
    | 'gameRunning'
    | 'gameNotRunning'
    | 'gameLaunchFailed'
    | 'failedToOpenFolder'
    | 'modExtractionFailed';
  message: string;
};
