export interface IAvatarUploadIntentRequest {
  readonly contentType: string;
  readonly contentLength: number;
}

export interface IAvatarUploadIntentResponse {
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly key: string;
  readonly expiresAt: string;
  readonly limits: {
    readonly maxContentLength: number;
    readonly maxDimension: number;
    readonly allowedMime: ReadonlyArray<string>;
  };
}

export interface IAvatarFinalizeRequest {
  readonly uploadKey: string;
}
