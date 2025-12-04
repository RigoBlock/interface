import { AbiCoder } from '@ethersproject/abi'
import { getAddress } from '@ethersproject/address'

// Universal Router Command Constants
const UNIVERSAL_ROUTER_COMMANDS = {
  SWEEP: 0x04,
  PAY_PORTION: 0x06,
  V4_SWAP: 0x10,
}

// V4 Universal Router Action Constants
const V4_ACTIONS = {
  TAKE: 0x0e, // 14 in decimal
  TAKE_PORTION: 0x10, // 16 in decimal
}

// ActionConstants from V4 periphery
const ACTION_CONSTANTS = {
  MSG_SENDER: '0x0000000000000000000000000000000000000001',
  ADDRESS_THIS: '0x0000000000000000000000000000000000000002',
}

function shouldReplaceRecipient(recipient: string, smartPoolAddress: string): boolean {
  const normalizedRecipient = getAddress(recipient).toLowerCase()
  const normalizedSmartPool = getAddress(smartPoolAddress).toLowerCase()
  console.log(`Checking if recipient ${normalizedRecipient} should be replaced with smart pool ${normalizedSmartPool}`)
  
  // Don't replace if already the smart pool
  if (normalizedRecipient === normalizedSmartPool) {
    return false
  }
  
  // Don't replace ActionConstants (MSG_SENDER, ADDRESS_THIS)
  if (normalizedRecipient === ACTION_CONSTANTS.MSG_SENDER.toLowerCase() ||
      normalizedRecipient === ACTION_CONSTANTS.ADDRESS_THIS.toLowerCase()) {
    return false
  }
  
  // Replace all other recipients (including Trading API fee recipients)
  return true
}

export function modifyV4ExecuteCalldata(calldata: string, smartPoolAddress: string): string {
  try {
    // Decode the execute(bytes commands, bytes[] inputs, uint256 deadline) calldata first
    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(['bytes', 'bytes[]', 'uint256'], calldata)
    
    const [commands, inputs, deadline] = decoded
    console.log(`Decoded V4 execute calldata: ${commands.length} command bytes, ${inputs.length} inputs, deadline=${deadline}`)
    
    // Process commands to identify which inputs need modification
    const commandsBytes = commands.startsWith('0x') ? 
      new Uint8Array(Buffer.from(commands.slice(2), 'hex')) : 
      new Uint8Array(Buffer.from(commands, 'hex'))
    
    console.log(`Found ${commandsBytes.length} commands:`, Array.from(commandsBytes).map(c => `0x${c.toString(16).padStart(2, '0')}`).join(', '))
    
    const modifiedInputs = [...inputs]
    let wasModified = false
    
    // Process each command and its corresponding input
    for (let i = 0; i < commandsBytes.length && i < inputs.length; i++) {
      const command = commandsBytes[i]
      const input = inputs[i]
      
      console.log(`Processing command ${i}: 0x${command.toString(16).padStart(2, '0')}`)
      
      if (command === UNIVERSAL_ROUTER_COMMANDS.SWEEP) {
        // SWEEP command: abi.encode(token, recipient, amountMinimum)
        try {
          const [token, recipient, amountMinimum] = abiCoder.decode(['address', 'address', 'uint256'], input)
          console.log(`Decoded SWEEP command ${i}: token=${token}, recipient=${recipient}, amount=${amountMinimum}`)
          
          if (shouldReplaceRecipient(recipient, smartPoolAddress)) {
            const newInput = abiCoder.encode(['address', 'address', 'uint256'], [token, smartPoolAddress, amountMinimum])
            modifiedInputs[i] = newInput
            wasModified = true
            console.log(`Modified SWEEP command ${i}: ${recipient} -> ${smartPoolAddress}`)
          }
        } catch (error) {
          console.warn(`Failed to decode SWEEP command ${i}:`, error)
        }
      } else if (command === UNIVERSAL_ROUTER_COMMANDS.PAY_PORTION) {
        // PAY_PORTION command: abi.encode(token, recipient, bips)
        try {
          const [token, recipient, bips] = abiCoder.decode(['address', 'address', 'uint256'], input)
          console.log(`Decoded PAY_PORTION command ${i}: token=${token}, recipient=${recipient}, bips=${bips}`)
          
          if (shouldReplaceRecipient(recipient, smartPoolAddress)) {
            const newInput = abiCoder.encode(['address', 'address', 'uint256'], [token, smartPoolAddress, bips])
            modifiedInputs[i] = newInput
            wasModified = true
            console.log(`Modified PAY_PORTION command ${i}: ${recipient} -> ${smartPoolAddress}`)
          }
        } catch (error) {
          console.warn(`Failed to decode PAY_PORTION command ${i}:`, error)
        }
      } else if (command === UNIVERSAL_ROUTER_COMMANDS.V4_SWAP) {
        // V4_SWAP command: process V4 actions within this input
        try {
          // Each input should be encoded as (bytes actions, bytes[] params)
          const [actions, params] = abiCoder.decode(['bytes', 'bytes[]'], input)
          
          // The actions bytes should be the actual action sequence, not encoded
          // Convert the decoded bytes to a Uint8Array for processing
          const actionsBytes = actions.startsWith('0x') ? 
            new Uint8Array(Buffer.from(actions.slice(2), 'hex')) : 
            new Uint8Array(Buffer.from(actions, 'hex'))
          
          console.log(`V4_SWAP command ${i}: Found ${actionsBytes.length} V4 action bytes, ${params.length} params`)
          
          const modifiedParams = [...params]
          let v4InputWasModified = false
          
          // Process each V4 action
          for (let j = 0; j < actionsBytes.length; j++) {
            const actionType = actionsBytes[j]
            console.log(`Processing V4 action ${j} of type ${actionType} in command ${i}`)
            
            if (actionType === V4_ACTIONS.TAKE || actionType === V4_ACTIONS.TAKE_PORTION) {
              // Decode the corresponding parameter
              const paramCalldata = params[j]
              
              if (actionType === V4_ACTIONS.TAKE) {
                // TAKE action: abi.encode(currency, recipient, amount)
                try {
                  const [currency, recipient, amount] = abiCoder.decode(['address', 'address', 'uint256'], paramCalldata)
                  console.log(`Decoded V4 TAKE action ${j} in command ${i}: recipient=${recipient}`)
                  
                  // Check if recipient should be replaced
                  if (shouldReplaceRecipient(recipient, smartPoolAddress)) {
                    const newParams = abiCoder.encode(['address', 'address', 'uint256'], [currency, smartPoolAddress, amount])
                    modifiedParams[j] = newParams
                    v4InputWasModified = true
                    console.log(`Modified V4 TAKE action ${j} in command ${i}: ${recipient} -> ${smartPoolAddress}`)
                  }
                } catch (error) {
                  console.warn(`Failed to decode V4 TAKE action ${j} in command ${i}:`, error)
                }
              } else if (actionType === V4_ACTIONS.TAKE_PORTION) {
                // TAKE_PORTION action: abi.encode(currency, recipient, bips)
                try {
                  const [currency, recipient, bips] = abiCoder.decode(['address', 'address', 'uint256'], paramCalldata)
                  console.log(`Decoded V4 TAKE_PORTION action ${j} in command ${i}: recipient=${recipient}`)
                  
                  // Check if recipient should be replaced
                  if (shouldReplaceRecipient(recipient, smartPoolAddress)) {
                    const newParams = abiCoder.encode(['address', 'address', 'uint256'], [currency, smartPoolAddress, bips])
                    modifiedParams[j] = newParams
                    v4InputWasModified = true
                    console.log(`Modified V4 TAKE_PORTION action ${j} in command ${i}: ${recipient} -> ${smartPoolAddress}`)
                  }
                } catch (error) {
                  console.warn(`Failed to decode V4 TAKE_PORTION action ${j} in command ${i}:`, error)
                }
              }
            }
          }
          
          if (v4InputWasModified) {
            // Re-encode this V4_SWAP input with modified params
            const modifiedInput = abiCoder.encode(['bytes', 'bytes[]'], [actions, modifiedParams])
            modifiedInputs[i] = modifiedInput
            wasModified = true
          }
        } catch (error) {
          console.warn(`Failed to decode V4_SWAP command ${i}:`, error)
        }
      }
    }
    
    if (!wasModified) {
      return calldata
    }
    
    // Re-encode the entire calldata with modified inputs
    return abiCoder.encode(['bytes', 'bytes[]', 'uint256'], [commands, modifiedInputs, deadline])
  } catch (error) {
    console.error('Error modifying V4 calldata:', error)
    throw error
  }
}