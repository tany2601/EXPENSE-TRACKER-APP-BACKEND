import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { UsersModule } from "./users/users.module";
import { HealthModule } from "./health/health.module";
import { ContactsModule } from "./contacts/contacts.module";
import { CategoriesModule } from "./categories/categories.module";
import { SyncModule } from "./sync/sync.module";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 15,
      },
    ]),
    ScheduleModule.forRoot(),
    HealthModule,
    AuthModule,
    UsersModule,
    TransactionsModule,
    ContactsModule,
    CategoriesModule,
    SyncModule,
    NotificationsModule,
  ],
})
export class AppModule {}
