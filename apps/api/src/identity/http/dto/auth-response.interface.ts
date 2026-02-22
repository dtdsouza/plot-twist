export interface IUserResponse {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly avatar: string | null
  readonly bio: string | null
  readonly createdAt: Date
}

export interface IAuthResponse {
  readonly accessToken: string
  readonly user: IUserResponse
}
