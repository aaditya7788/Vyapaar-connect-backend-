const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const dLat = 19.1825;
  const dLng = 73.0700;
  
  const shops = await prisma.shop.findMany();
  let updatedCount = 0;
  
  for (let i = 0; i < shops.length; i++) {
    const lat = dLat + (Math.random() - 0.5) * 0.05;
    const lng = dLng + (Math.random() - 0.5) * 0.05;
    
    await prisma.shop.update({
      where: { id: shops[i].id },
      data: { latitude: lat, longitude: lng }
    });
    updatedCount++;
  }
  
  console.log(`Successfully updated ${updatedCount} shops to be near ${dLat}, ${dLng}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
