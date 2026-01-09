
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { ContactsModule } from './contacts/contacts.module';
import { CategoriesModule } from './categories/categories.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 15, // 15 requests per minute per IP
      },
    ]),
    HealthModule,
    AuthModule,
    UsersModule,
    TransactionsModule,
    ContactsModule,
    CategoriesModule,
    SyncModule
  ],
})
export class AppModule {}