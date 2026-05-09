import prisma from './src/prismaClient.js';
import bcrypt from 'bcryptjs';

async function main() {
  const hashedPassword = await bcrypt.hash('Password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test HOD',
      password: hashedPassword,
      role: 'ADMIN'
    }
  });

  const mentor = await prisma.user.upsert({
    where: { email: 'mentor@example.com' },
    update: {},
    create: {
      email: 'mentor@example.com',
      name: 'Test Mentor',
      password: hashedPassword,
      role: 'MENTOR'
    }
  });

  console.log('Seed successful:', { admin: admin.email, mentor: mentor.email });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
