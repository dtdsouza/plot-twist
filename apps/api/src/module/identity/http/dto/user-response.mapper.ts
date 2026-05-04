import { UserEntity } from "../../persistence/entity/user.entity";
import { IUserResponse } from "./auth-response.interface";

export const toUserResponse = (user: UserEntity): IUserResponse => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  avatar: user.avatar,
  bio: user.bio,
  createdAt: user.createdAt,
});
