const { verify } = require('otplib');
const secret = 'EIJU4MEHFXCBS7H5NBKBJSYXMJA6WOMC';

async function test() {
  console.log('--- OTP VERIFICATION TEST ---');
  console.log('Secret:', secret);
  
  const test1 = await verify({ token: '000000', secret });
  console.log('Test 1 (000000):', test1);
  
  const test2 = await verify({ token: '', secret });
  console.log('Test 2 (empty):', test2);

  const test3 = await verify({ token: null, secret });
  console.log('Test 3 (null):', test3);
  
  console.log('-----------------------------');
}

test().catch(console.error);
