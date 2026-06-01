import type { ISendEmailOptions } from '@module/shared/mail'

export interface IClubInviteTemplateInput {
  readonly to: string
  readonly clubName: string
  readonly inviteUrl: string
}

export function buildClubInviteEmail(
  input: IClubInviteTemplateInput,
): ISendEmailOptions {
  return {
    to: input.to,
    subject: `You have been invited to join ${input.clubName} on Plot-Twist`,
    html: `<p>You have been invited to join the book club <strong>${input.clubName}</strong> on Plot-Twist.</p><p><a href="${input.inviteUrl}">Click here to join ${input.clubName}</a></p><p>This link will expire after a set number of days. If you were not expecting this invitation, you can safely ignore this email.</p>`,
    text: `You have been invited to join the book club "${input.clubName}" on Plot-Twist.\n\nJoin here: ${input.inviteUrl}\n\nThis link will expire after a set number of days. If you were not expecting this invitation, you can safely ignore this email.`,
  }
}
