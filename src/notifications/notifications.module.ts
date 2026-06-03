import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { FcmService } from "./services/fcm.service";
import { DeviceTokenService } from "./services/device-token.service";
import { NotificationTemplateService } from "./services/notification-template.service";
import { PersonalizationEngine } from "./services/personalization.engine";
import { NotificationDeliveryService } from "./services/notification-delivery.service";
import { NotificationSchedulerService } from "./services/notification-scheduler.service";
import { NotificationsController } from "./notifications.controller";
import { AdminNotificationsController } from "./admin-notifications.controller";
import { AdminGuard } from "./guards/admin.guard";

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    FcmService,
    DeviceTokenService,
    NotificationTemplateService,
    PersonalizationEngine,
    NotificationDeliveryService,
    NotificationSchedulerService,
    AdminGuard,
  ],
  exports: [NotificationDeliveryService, DeviceTokenService],
})
export class NotificationsModule {}
