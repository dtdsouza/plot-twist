import { Module } from "@nestjs/common";
import { IdentityController } from "./http/controller/identity.controller";
import { IdentityService } from "./core/identity.service";

@Module({
  imports: [],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [],
})
export class IdentityModule {}
