import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { email: 'demo@gmail.com' },
    data: { name: 'Icon Fitness' }
  });
  console.log(`Updated ${result.count} user(s) to name 'Icon Fitness'`);
  await prisma.$disconnect();
}

main().catch(console.error);
