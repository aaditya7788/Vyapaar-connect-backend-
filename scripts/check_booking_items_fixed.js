const axios = require('axios');

async function testApi() {
    const userId = 'fa3190b5-522a-4d9b-8af6-2f8972cc90a9';
    const baseUrl = 'http://localhost:5000/api';
    
    try {
        // We need an admin token. I'll try to find one or assume the server allows local dev access for this test if configured.
        // Actually, I'll just check the DB one last time with the correct field name 'items' to be 100% sure.
        console.log('Testing DB with correct field name...');
    } catch (e) {
        console.error(e);
    }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookingItemsFixed() {
  try {
    const booking = await prisma.booking.findFirst({
      where: { displayId: 'BK-ACRXXGCF' },
      include: {
        items: {
          include: {
            service: true
          }
        }
      }
    });
    console.log('Booking found (Fixed):', JSON.stringify(booking, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkBookingItemsFixed();
