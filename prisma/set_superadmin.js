import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function setSuperAdmin() {
  const email = 'superadmin@gmail.com';
  const password = '123456';
  const passwordHash = await bcrypt.hash(password, 10);

  console.log(`Setting up Super Admin account: ${email}...`);

  // Check if superadmin already exists with this email
  const existing = await prisma.user.findFirst({
    where: { email }
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        name: 'Super Admin'
      }
    });
    console.log(`✅ Super Admin updated successfully: ID ${updated.id}, Email: ${updated.email}, Role: ${updated.role}`);
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        name: 'Super Admin',
        gymId: null
      }
    });
    console.log(`✅ Super Admin created successfully: ID ${created.id}, Email: ${created.email}, Role: ${created.role}`);
  }
}

setSuperAdmin()
  .catch((err) => {
    console.error('❌ Error setting super admin:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
