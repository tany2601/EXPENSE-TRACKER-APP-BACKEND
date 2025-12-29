
import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  // In a real app, this would be a database connection (e.g., TypeORM or Mongoose)
  private readonly users = [
    {
      id: '1',
      email: 'demo@lumina.com',
      passcode: '1234',
      name: 'Demo User',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
    }
  ];

  async findOne(email: string): Promise<any | undefined> {
    return this.users.find(user => user.email === email);
  }
}
