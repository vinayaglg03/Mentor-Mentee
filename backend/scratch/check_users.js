import prisma from '../src/prismaClient.js';

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: 'MENTOR' }
  });
  console.log('MENTOR:', JSON.stringify(user));
  
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' }
  });
  console.log('ADMIN:', JSON.stringify(admin));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
