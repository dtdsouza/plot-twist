import { Injectable } from "@nestjs/common";

@Injectable()
export class IdentityService {
  signup(): { message: string } {
    return { message: "Hello API" };
  }
}
