require('dotenv').config();
const prisma = require('../src/db');

async function checkDatabase() {
    console.log('--- Database Connectivity Check ---');
    console.log('Environment:', process.env.APP_ENV || 'not set');
    console.log('Database URL:', process.env.DIRECT_URL ? 'PRESENT' : 'MISSING');

    try {
        console.log('Attempting to connect to the database...');

        // 1. Simple heartbeat query
        const heartbeat = await prisma.$queryRaw`SELECT 1 as connected`;
        console.log('✅ Connection successful (Heartbeat: OK)');

        // 2. Count users to see if schema is accessible
        const userCount = await prisma.user.count();
        console.log(`✅ Schema accessible (Total Users: ${userCount})`);

        // 3. Test latency
        const start = Date.now();
        await prisma.$queryRaw`SELECT NOW()`;
        const latency = Date.now() - start;
        console.log(`✅ Latency: ${latency}ms`);

        console.log('\n--- Status: ALL SYSTEMS GO ---');
    } catch (error) {
        console.error('\n❌ DATABASE ERROR DETECTED');
        console.error('----------------------------');
        console.error('Error Name:', error.name);
        console.error('Error Code:', error.code || 'N/A');
        console.error('Message:', error.message);
        console.error('----------------------------');

        if (error.message.includes('Can\'t reach database server')) {
            console.log('💡 HINT: Check your internet connection or if the database server (Supabase) is up.');
        } else if (error.message.includes('Authentication failed')) {
            console.log('💡 HINT: Your DATABASE_URL credentials might be incorrect.');
        } else if (error.message.includes('not found')) {
            console.log('💡 HINT: The specified table or database was not found.');
        }

        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

checkDatabase();
