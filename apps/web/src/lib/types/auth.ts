export interface IUserResponse {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly bio: string | null;
  readonly createdAt: string;
}

export interface IAuthResponse {
  readonly accessToken: string;
  readonly user: IUserResponse;
}

export interface ILoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface IRegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export interface IUpdateProfileRequest {
  readonly displayName?: string;
  readonly bio?: string | null;
  readonly avatar?: string | null;
}

export interface IChangePasswordRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface IEmailChangeInitiateRequest {
  readonly currentPassword: string;
  readonly newEmail: string;
}

export interface IVerifyEmailChangeRequest {
  readonly token: string;
}

export interface IAuthError {
  readonly message: string;
  readonly statusCode: number;
}
