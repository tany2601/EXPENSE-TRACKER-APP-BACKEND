
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 15, // 15 requests per minute per IP
    }]),
    AuthModule,
    UsersModule,
    TransactionsModule,
  ],
})
export class AppModule {}
