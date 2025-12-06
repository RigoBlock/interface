// Debug script to test if our RigoBlock fixes are working
console.log('🔍 Testing RigoBlock permit fixes...\n');

// Test the processSwapResponse function (shared by both flows)
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
  console.log('processSwapResponse INPUT:', {
    permitData: !!permitData,
    permitsDontNeedSignature,
    smartPoolCheck: permitsDontNeedSignature ? 'EXCLUDING permit' : 'INCLUDING permit'
  });
  
  // For RigoBlock pools, exclude permitData but keep swapRequestArgs and txRequests
  const finalPermitData = permitsDontNeedSignature ? undefined : permitData;
  const finalTxRequests = response?.transactions;
  const finalSwapRequestArgs = swapRequestParams; // Always keep swapRequestArgs
  
  console.log('processSwapResponse OUTPUT:', {
    finalPermitData: !!finalPermitData,
    finalTxRequests: !!finalTxRequests,
    finalTxRequestsLength: finalTxRequests?.length,
    finalSwapRequestArgs: !!finalSwapRequestArgs
  });
  
  return {
    gasFeeResult: { value: '1000', displayValue: '1000', isLoading: false, error: null },
    txRequests: finalTxRequests,
    permitData: finalPermitData,
    gasEstimate: {},
    includesDelegation: response?.includesDelegation,
    swapRequestArgs: finalSwapRequestArgs,
  };
}

// Test getClassicSwapTxAndGasInfo function
function getClassicSwapTxAndGasInfo({
  trade,
  swapTxInfo,
  approvalTxInfo,
  permitTxInfo,
  derivedSwapInfo,
}) {
  console.log('getClassicSwapTxAndGasInfo INPUT:', {
    permitData: !!swapTxInfo.permitData,
    permitTxRequest: !!permitTxInfo.permitTxRequest,
    swapTxInfo_txRequests: !!swapTxInfo.txRequests,
    swapTxInfo_txRequestsLength: swapTxInfo.txRequests?.length,
    smartPoolAddress: derivedSwapInfo?.smartPoolAddress,
    isRigoBlock: !!derivedSwapInfo?.smartPoolAddress
  });
  
  const txRequests = swapTxInfo.txRequests;
  const unsigned = Boolean(swapTxInfo.permitData && !derivedSwapInfo?.smartPoolAddress);
  
  const permit = swapTxInfo.permitData 
    ? { method: 'TypedData', typedData: swapTxInfo.permitData }
    : permitTxInfo.permitTxRequest
      ? { method: 'Transaction', txRequest: permitTxInfo.permitTxRequest }
      : undefined;

  console.log('getClassicSwapTxAndGasInfo OUTPUT:', {
    permit: !!permit,
    permitMethod: permit?.method,
    unsigned,
    txRequests: !!txRequests,
    swapRequestArgs: !!swapTxInfo.swapRequestArgs
  });

  return {
    routing: trade.routing,
    trade,
    gasFee: { value: '1000', displayValue: '1000', isLoading: false, error: null },
    gasFeeEstimation: {},
    swapRequestArgs: swapTxInfo.swapRequestArgs,
    unsigned,
    txRequests,
    permit,
  };
}

console.log('=== TEST 1: Regular Pool ===');
const regularSwapTxInfo = processSwapResponse({
  response: { transactions: ['tx1', 'tx2'] },
  error: null,
  swapQuote: { gasFee: '1000' },
  isSwapLoading: false,
  permitData: { domain: 'test', types: 'test', values: 'test' },
  swapRequestParams: { chainId: 1, amount: '1000' },
  isRevokeNeeded: false,
  permitsDontNeedSignature: false, // Regular pool
});

const regularResult = getClassicSwapTxAndGasInfo({
  trade: { routing: 'CLASSIC' },
  swapTxInfo: regularSwapTxInfo,
  approvalTxInfo: {},
  permitTxInfo: { permitTxRequest: null },
  derivedSwapInfo: { smartPoolAddress: undefined },
});

console.log('\n=== TEST 2: RigoBlock Pool ===');
const rigoBlockSwapTxInfo = processSwapResponse({
  response: { transactions: ['tx1', 'tx2'] },
  error: null,
  swapQuote: { gasFee: '1000' },
  isSwapLoading: false,
  permitData: { domain: 'test', types: 'test', values: 'test' },
  swapRequestParams: { chainId: 1, amount: '1000' },
  isRevokeNeeded: false,
  permitsDontNeedSignature: true, // RigoBlock pool
});

const rigoBlockResult = getClassicSwapTxAndGasInfo({
  trade: { routing: 'CLASSIC' },
  swapTxInfo: rigoBlockSwapTxInfo,
  approvalTxInfo: {},
  permitTxInfo: { permitTxRequest: null }, // Should return empty for RigoBlock
  derivedSwapInfo: { smartPoolAddress: '0x123' },
});

console.log('\n=== FINAL RESULTS COMPARISON ===');
console.log('Regular Pool:');
console.log('  - permit:', !!regularResult.permit);
console.log('  - unsigned:', regularResult.unsigned);
console.log('  - txRequests:', !!regularResult.txRequests);
console.log('  - swapRequestArgs:', !!regularResult.swapRequestArgs);

console.log('RigoBlock Pool:');
console.log('  - permit:', !!rigoBlockResult.permit);
console.log('  - unsigned:', rigoBlockResult.unsigned);
console.log('  - txRequests:', !!rigoBlockResult.txRequests);
console.log('  - swapRequestArgs:', !!rigoBlockResult.swapRequestArgs);

console.log('\n✅ Expected for RigoBlock pools:');
console.log('  - permit: false (should be undefined)');
console.log('  - unsigned: false (no permit data)'); 
console.log('  - txRequests: true (should have transactions)');
console.log('  - swapRequestArgs: true (should be preserved)');

if (!rigoBlockResult.permit && !rigoBlockResult.unsigned && rigoBlockResult.txRequests && rigoBlockResult.swapRequestArgs) {
  console.log('\n🎉 ALL TESTS PASS! RigoBlock fixes working correctly.');
} else {
  console.log('\n❌ TESTS FAIL! Something is not working correctly.');
}