import { registerAs } from '@nestjs/config'

export const CLUBS_CONFIG_KEY = 'clubs' as const

export interface IClubsConfig {
  readonly inviteUrl: string
  readonly inviteExpiryDays: number
}

export const clubsConfig = registerAs(CLUBS_CONFIG_KEY, (): IClubsConfig => {
  return Object.freeze({
    inviteUrl: process.env.CLUB_INVITE_URL as string,
    inviteExpiryDays: Number(process.env.CLUB_INVITE_EXPIRY_DAYS),
  })
})
