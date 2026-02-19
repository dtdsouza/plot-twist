import { Controller, Post } from "@nestjs/common";
import { IdentityService } from "../../core/identity.service";

@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post("/signup")
  signup() {
    return this.identityService.signup();
  }
}
