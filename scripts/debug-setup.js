const { setup2FA } = require('../src/modules/admin/auth/auth2fa.controller');

async function test() {
    console.log('--- STARTING 2FA DEBUG PROBE (STACK TRACE) ---');
    const req = { 
        query: { email: '1pspvtlimited@gmail.com' },
        user: null
    };
    const res = { 
        status: function(s) { 
            this.statusCode = s;
            return this;
        },
        json: function(j) {
            console.log('RESPONSE STATUS:', this.statusCode);
            console.log('RESPONSE BODY:', JSON.stringify(j, null, 2));
        }
    };

    try {
        await setup2FA(req, res);
    } catch (err) {
        console.error('CRITICAL ERROR CAUGHT:');
        console.error(err);
    }
}

test();
