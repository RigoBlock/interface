// Test the RigoBlock permit fix
console.log('Testing RigoBlock permit logic...');

// Simulate the logic
function testPermitLogic(permitData, signature, smartPoolAddress) {
  const isRigoBlockPool = !!smartPoolAddress;
  const signatureMissing = permitData && !signature && !isRigoBlockPool;
  
  console.log(`
  Input:
    permitData: ${!!permitData}
    signature: ${!!signature}  
    smartPoolAddress: ${!!smartPoolAddress}
  
  Result:
    isRigoBlockPool: ${isRigoBlockPool}
    signatureMissing: ${signatureMissing}
    shouldProceedToAPI: ${!signatureMissing}
  `);
  
  return !signatureMissing;
}

console.log('\n=== Test Case 1: Regular pool with permit ===');
testPermitLogic(true, false, null); // Should be signatureMissing=true, shouldProceedToAPI=false

console.log('\n=== Test Case 2: Regular pool with signature ===');
testPermitLogic(true, true, null); // Should be signatureMissing=false, shouldProceedToAPI=true

console.log('\n=== Test Case 3: RigoBlock pool with permit but no signature ===');
testPermitLogic(true, false, '0x1234'); // Should be signatureMissing=false, shouldProceedToAPI=true

console.log('\n=== Test Case 4: RigoBlock pool with no permit ===');
testPermitLogic(false, false, '0x1234'); // Should be signatureMissing=false, shouldProceedToAPI=true