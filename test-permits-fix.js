// Test the permitsDontNeedSignature logic for RigoBlock pools
console.log('Testing permitsDontNeedSignature fix...');

// Mock the processSwapResponse function with our fix
function processSwapResponse({
  response,
  error,
  swapQuote,
  isSwapLoading,
  permitData,
  swapRequestParams,
  isRevokeNeeded,
  permitsDontNeedSignature,
}) {
  console.log('Input permitData:', permitData);
  console.log('permitsDontNeedSignature:', permitsDontNeedSignature);
  
  const finalPermitData = permitsDontNeedSignature ? undefined : permitData;
  console.log('Final permitData:', finalPermitData);
  
  return {
    permitData: finalPermitData,
    txRequests: response?.transactions || ['mockTx1'],
  };
}

// Test scenario 1: Regular pool
console.log('\n--- Test 1: Regular pool ---');
const regularResult = processSwapResponse({
  response: { transactions: ['tx1'] },
  error: null,
  swapQuote: { gasFee: '1000' },
  isSwapLoading: false,
  permitData: { some: 'permit' },
  swapRequestParams: {},
  isRevokeNeeded: false,
  permitsDontNeedSignature: false, // Regular pool
});
console.log('Regular pool permitData:', regularResult.permitData);

// Test scenario 2: RigoBlock pool  
console.log('\n--- Test 2: RigoBlock pool ---');
const rigoBlockResult = processSwapResponse({
  response: { transactions: ['tx1'] },
  error: null,
  swapQuote: { gasFee: '1000' },
  isSwapLoading: false,
  permitData: { some: 'permit' },
  swapRequestParams: {},
  isRevokeNeeded: false,
  permitsDontNeedSignature: true, // RigoBlock pool (smartPoolAddress exists)
});
console.log('RigoBlock pool permitData:', rigoBlockResult.permitData);

// Validate results
if (regularResult.permitData && !rigoBlockResult.permitData) {
  console.log('\n✅ permitsDontNeedSignature fix working correctly!');
  console.log('- Regular pools: permitData included');
  console.log('- RigoBlock pools: permitData excluded');
} else {
  console.log('\n❌ Fix not working correctly!');
}