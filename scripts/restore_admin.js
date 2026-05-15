const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function restoreAdmin() {
    try {
        console.log('🚀 Emergency Admin Recovery started...');
        
        // Find you by your email (from your screenshot)
        const email = 'admin@vyapaar.com'; 
        
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email },
                    { id: 'fa3190b5-522a-4d9b-8ef6-2f6972cc90a9' }
                ]
            }
        });

        if (!user) {
            console.error('❌ Could not find your account!');
            return;
        }

        console.log(`👤 Found user: ${user.fullName} (${user.id})`);

        // Force Restore: Set status to active and ensure admin role exists
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                status: 'active',
                blockReason: null,
                roles: {
                    set: Array.from(new Set([...user.roles, 'admin']))
                }
            }
        });

        console.log('✅ Account RESTORED!');
        console.log('👑 Admin Privileges: VERIFIED');
        console.log('✨ You can now refresh your browser.');

    } catch (error) {
        console.error('❌ Recovery failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

restoreAdmin();
