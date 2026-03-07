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

export interface IAuthError {
  readonly message: string;
  readonly statusCode: number;
}
