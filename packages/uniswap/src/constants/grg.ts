import { Token } from '@uniswap/sdk-core'
import { UniverseChainId } from '@universe/chains'

export const GRG: { [chainId: number]: Token } = {
  [UniverseChainId.Mainnet]: new Token(
    UniverseChainId.Mainnet,
    '0x4FbB350052Bca5417566f188eB2EBCE5b19BC964',
    18,
    'GRG',
    'RigoBlock',
  ),
  [UniverseChainId.Sepolia]: new Token(
    UniverseChainId.Sepolia,
    '0x076C619e7ebaBe40746106B66bFBed731F2c1339',
    18,
    'GRG',
    'RigoBlock',
  ),
  [UniverseChainId.Optimism]: new Token(
    UniverseChainId.Optimism,
    '0xEcF46257ed31c329F204Eb43E254C609dee143B3',
    18,
    'GRG',
    'RigoBlock',
  ),
  [UniverseChainId.Bnb]: new Token(
    UniverseChainId.Bnb,
    '0x3d473C3eF4Cd4C909b020f48477a2EE2617A8e3C',
    18,
    'GRG',
    'RigoBlock',
  ),
  [UniverseChainId.Polygon]: new Token(
    UniverseChainId.Polygon,
    '0xBC0BEA8E634ec838a2a45F8A43E7E16Cd2a8BA99',
    18,
    'GRG',
    'RigoBlock',
  ),
  [UniverseChainId.Base]: new Token(
    UniverseChainId.Base,
    '0x09188484e1Ab980DAeF53a9755241D759C5B7d60',
    18,
    'GRG',
    'RigoBlock',
  ),
  [UniverseChainId.ArbitrumOne]: new Token(
    UniverseChainId.ArbitrumOne,
    '0x7F4638A58C0615037deCc86f1daE60E55fE92874',
    18,
    'GRG',
    'RigoBlock',
  ),
  [UniverseChainId.Unichain]: new Token(
    UniverseChainId.Unichain,
    '0x03C2868c6D7fD27575426f395EE081498B1120dd',
    18,
    'GRG',
    'RigoBlock',
  ),
}
