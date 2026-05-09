import prisma from './src/prismaClient.js';
const id = '3900dd0b-eada-4048-b55e-6316f22364c1';
try {
  const user = await prisma.user.findUnique({ where: { id } });
  console.log(user ? `User exists: ${user.email}` : 'User NOT found');
} catch (e) {
  console.error(e);
} finally {
  await prisma.$disconnect();
}
