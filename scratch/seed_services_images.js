const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const images = [
      "https://res.cloudinary.com/urbanclap/image/upload/t_high_res_template,q_auto:low,f_auto/w_64,dpr_1,fl_progressive:steep,q_auto,c_limit/images/growth/luminosity/1646140576865-02aba1.jpeg",
      "https://res.cloudinary.com/urbanclap/image/upload/t_high_res_template,q_auto:low,f_auto/w_64,dpr_1,fl_progressive:steep,q_auto,c_limit/images/growth/home-screen/1609164213753-388915.jpeg",
      "https://res.cloudinary.com/urbanclap/image/upload/t_high_res_template,q_auto:low,f_auto/w_64,dpr_1,fl_progressive:steep,q_auto,c_limit/images/supply/customer-app-supply/1635331606894-7b633f.jpeg",
      "https://res.cloudinary.com/urbanclap/image/upload/t_high_res_template,q_auto:low,f_auto/w_64,dpr_1,fl_progressive:steep,q_auto,c_limit/images/growth/home-screen/1625159882387-9585c7.jpeg"
  ];

  const services = await prisma.service.findMany();
  let updatedCount = 0;
  
  for (let i = 0; i < services.length; i++) {
    // Pick a random image from the array
    const randImage = images[Math.floor(Math.random() * images.length)];
    
    await prisma.service.update({
      where: { id: services[i].id },
      data: { image: randImage }
    });
    updatedCount++;
  }
  
  console.log(`Successfully seeded images for ${updatedCount} services.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
