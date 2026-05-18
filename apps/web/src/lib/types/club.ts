export interface IClubResponse {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly ownerId: string;
  readonly coverImageUrl: string | null;
  readonly role: 'owner' | 'member';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ICreateClubRequest {
  readonly name: string;
  readonly description?: string;
}

export interface IUpdateClubRequest {
  readonly name?: string;
  readonly description?: string;
}

export interface IClubCoverUploadIntentRequest {
  readonly contentType: string;
  readonly contentLength: number;
}

export interface IClubCoverUploadIntentResponse {
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

export interface IFinalizeClubCoverRequest {
  readonly key: string;
}
