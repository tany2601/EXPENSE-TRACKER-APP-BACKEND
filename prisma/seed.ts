import { PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORIES } from "./seed/categories.seed";

const prisma = new PrismaClient();

async function main() {
  for (const cat of DEFAULT_CATEGORIES) {
    const exists = await prisma.category.findFirst({
      where: {
        name: cat.name,
        userId: null, // ✅ allowed here
      },
    });

    if (!exists) {
      await prisma.category.create({
        data: {
          name: cat.name,
          iconName: cat.iconName,
          color: cat.color,
          isDefault: true,
          // ✅ userId omitted → NULL in DB
        },
      });
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
