#!/usr/bin/env python3
"""
Resolve merge conflicts for Rigoblock fork of Uniswap interface.

Strategy:
- Keep Rigoblock-specific customizations (smart pool, vault, rigoblock URLs, governance, staking)
- Accept upstream structural changes (new import paths, refactored APIs)
- Merge both when they add independent things
"""

import os
import re
import json
import sys

def parse_conflicts(content):
    """Parse a file's content into segments: non-conflict text and conflict blocks."""
    segments = []
    lines = content.split('\n')
    i = 0
    current_text = []
    
    while i < len(lines):
        line = lines[i]
        if line.startswith('<<<<<<< HEAD') or line.startswith('<<<<<<< HEAD:'):
            if current_text:
                segments.append(('text', '\n'.join(current_text)))
                current_text = []
            # Parse conflict
            head_lines = []
            main_lines = []
            i += 1
            in_head = True
            while i < len(lines):
                if lines[i].startswith('======='):
                    in_head = False
                    i += 1
                    continue
                if lines[i].startswith('>>>>>>> main') or lines[i].startswith('>>>>>>> main:'):
                    break
                if in_head:
                    head_lines.append(lines[i])
                else:
                    main_lines.append(lines[i])
                i += 1
            segments.append(('conflict', head_lines, main_lines))
        else:
            current_text.append(line)
        i += 1
    
    if current_text:
        segments.append(('text', '\n'.join(current_text)))
    
    return segments


def resolve_file(filepath, content):
    """Resolve conflicts in a file based on its path and content patterns."""
    segments = parse_conflicts(content)
    result_parts = []
    
    for seg in segments:
        if seg[0] == 'text':
            result_parts.append(seg[1])
        else:
            head = seg[1]
            main = seg[2]
            resolved = resolve_conflict(filepath, head, main)
            result_parts.append('\n'.join(resolved))
    
    return '\n'.join(result_parts)


def resolve_conflict(filepath, head_lines, main_lines):
    """Resolve a single conflict block."""
    head_text = '\n'.join(head_lines)
    main_text = '\n'.join(main_lines)
    
    # === en-US.json: merge both sides (keep all strings) ===
    if 'en-US.json' in filepath:
        return resolve_i18n_conflict(head_lines, main_lines)
    
    # === URL configs: keep Rigoblock URLs ===
    if 'constants/urls.ts' in filepath:
        return resolve_urls_conflict(head_lines, main_lines)
    
    # === Import-only conflicts ===
    if all(l.strip().startswith('import ') or l.strip().startswith('//import ') or l.strip() == '' for l in head_lines + main_lines if l.strip()):
        return resolve_import_conflict(filepath, head_lines, main_lines)
    
    # === File-specific resolutions ===
    return resolve_specific(filepath, head_lines, main_lines)


def resolve_i18n_conflict(head_lines, main_lines):
    """For i18n JSON: keep all unique entries from both sides."""
    # Collect all unique lines, preserving Rigoblock-specific ones
    all_lines = []
    seen = set()
    
    for line in head_lines + main_lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Extract the key from JSON line
        key_match = re.match(r'\s*"([^"]+)":', line)
        if key_match:
            key = key_match.group(1)
            if key not in seen:
                seen.add(key)
                all_lines.append(line)
        elif stripped not in seen:
            seen.add(stripped)
            all_lines.append(line)
    
    # Sort by key for JSON consistency
    def sort_key(line):
        m = re.match(r'\s*"([^"]+)":', line)
        return m.group(1).lower() if m else line
    
    all_lines.sort(key=sort_key)
    return all_lines


def resolve_urls_conflict(head_lines, main_lines):
    """Keep Rigoblock URLs where they exist, accept new upstream fields."""
    # For URL configs, prefer HEAD (Rigoblock) but accept new fields from main
    head_fields = {}
    main_fields = {}
    
    for lines, fields in [(head_lines, head_fields), (main_lines, main_fields)]:
        for line in lines:
            # Match field assignments like "apiOrigin: '...'" or "apiBaseUrl: ..."
            m = re.match(r'\s*(\w+):\s*(.*)', line)
            if m:
                fields[m.group(1)] = line
    
    # Start with HEAD, add any new fields from main
    result = list(head_lines)
    for key, line in main_fields.items():
        if key not in head_fields:
            result.append(line)
    
    return result


def resolve_import_conflict(filepath, head_lines, main_lines):
    """Resolve import-only conflicts."""
    # Collect all unique imports
    head_imports = set()
    main_imports = set()
    rb_specific_keywords = ['SmartPool', 'smartPool', 'rigoblock', 'Rigoblock', 'poolsList', 
                            'PoolPosition', 'PoolExtended', 'stakingSlice', 'poolExtended',
                            'CreatePool', 'poolInfo']
    
    for l in head_lines:
        if l.strip():
            head_imports.add(l.strip())
    for l in main_lines:
        if l.strip():
            main_imports.add(l.strip())
    
    result = []
    used_modules = set()
    
    # Keep Rigoblock-specific imports from HEAD
    for imp in head_imports:
        if any(kw in imp for kw in rb_specific_keywords):
            result.append(imp)
            # Track module
            m = re.search(r"from '([^']+)'", imp)
            if m:
                used_modules.add(m.group(1))
    
    # Add all main imports (with ~/prefix paths)
    for imp in main_imports:
        result.append(imp)
        m = re.search(r"from '([^']+)'", imp)
        if m:
            used_modules.add(m.group(1))
    
    # Add remaining HEAD imports that aren't duplicated by main
    for imp in head_imports:
        if imp not in result:
            # Check if main already has this import from a different path
            m_head = re.search(r"from '([^']+)'", imp)
            if m_head:
                head_module = m_head.group(1)
                # Check if main has same module with ~/ prefix
                main_equivalent = f"~/{head_module}" if not head_module.startswith('~/') else head_module
                if main_equivalent not in used_modules and head_module not in used_modules:
                    result.append(imp)
            else:
                result.append(imp)
    
    return result if result else ['']


def resolve_specific(filepath, head_lines, main_lines):
    """File-specific conflict resolution."""
    head_text = '\n'.join(head_lines)
    main_text = '\n'.join(main_lines)
    basename = os.path.basename(filepath)
    
    # ===== packages/wallet =====
    if 'useSharedIntroCards.ts' in filepath:
        # Keep main (upstream)
        return main_lines if main_lines else ['']
    
    if 'ForceUpgrade.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # ===== CurrencyInputPanel =====
    if 'CurrencyInputPanel.tsx' in filepath and 'types.tsx' not in filepath and 'Header' not in filepath and 'SwapCurrencyInputPanel' not in filepath:
        # Merge: keep isSmartPool + accept new upstream props
        result = []
        for l in main_lines:
            result.append(l)
        # Add isSmartPool after the last main line
        result.append('        isSmartPool,')
        return result
    
    if 'CurrencyInputPanelHeader.tsx' in filepath:
        if 'isSmartPool' in head_text and 'hidePresets' in main_text:
            # Keep both props
            return main_lines + head_lines
        return main_lines
    
    if 'types.tsx' in filepath and 'CurrencyInputPanel' in filepath:
        # Keep both: Rigoblock's isSmartPool + upstream's new props
        result = list(main_lines)
        # Add Rigoblock-specific props
        for l in head_lines:
            if 'isSmartPool' in l or 'maxValuation' in l or 'onSetMaxValuation' in l:
                result.append(l)
        return result
    
    # ===== TokenSelector =====
    if 'TokenSelector.tsx' in filepath and 'hooks' not in filepath and 'lists' not in filepath:
        # Accept upstream's refactored useTokenSelectorList approach
        return main_lines
    
    if 'useTokenSectionsForSearchResults.ts' in filepath:
        return main_lines
    
    if 'TokenSelectorSwapList.tsx' in filepath:
        return main_lines
    
    # ===== Routing =====
    if 'uniswapRoutingProvider.ts' in filepath:
        return main_lines if main_lines else ['']
    
    # ===== Chain configs =====
    if 'polygon.ts' in filepath:
        # Keep Rigoblock's Alchemy RPC for polygon
        return head_lines
    
    if 'chains/utils.ts' in filepath:
        # Keep Rigoblock's commented-out chains (they don't support all chains)
        return head_lines
    
    # ===== Transaction errors =====
    if 'transactions/errors.ts' in filepath:
        # Keep Rigoblock's discord URL but accept upstream message changes
        result = []
        for l in main_lines:
            # Replace uniswap help URL with rigoblock discord
            l = l.replace('uniswapUrls.helpArticleUrls.transactionFailure', 'uniswapUrls.rigoblockDiscordUrl')
            result.append(l)
        # Keep rigoblock-specific lines from HEAD not in main
        for l in head_lines:
            if l.strip() and l not in result and ('batched' in l.lower()):
                result.append(l)
        return result
    
    # ===== SwapReviewFooter =====
    if 'SwapReviewFooter.tsx' in filepath and 'Submit' not in filepath:
        # Accept upstream (adds isSwapOrPlanSagaRunning check)
        return main_lines
    
    if 'SubmitSwapButton.tsx' in filepath:
        # Keep both: Rigoblock's handleSubmit wrapper + upstream's warningVariant
        result = list(main_lines)
        return result
    
    # ===== SwapDetails =====
    if 'SwapDetails.tsx' in filepath and 'packages/uniswap' in filepath:
        # Accept upstream (restores PriceImpactRow)
        return main_lines
    
    # ===== useTokenApprovalInfo =====
    if 'useTokenApprovalInfo.ts' in filepath:
        if 'account' in head_text and 'address' in main_text and 'smartPoolAddress' in head_text:
            # Keep both: accept upstream's simpler 'address' param + add smartPoolAddress
            result = list(main_lines)
            result.append('  smartPoolAddress?: string')
            return result
        return main_lines
    
    # ===== TradeRoutingPreferenceScreen =====
    if 'TradeRoutingPreferenceScreen.tsx' in filepath:
        # Keep Rigoblock's disabled UniswapX
        return head_lines
    
    # ===== SwapFormStoreContextProvider =====
    if 'SwapFormStoreContextProvider.tsx' in filepath:
        # Accept upstream rename to dangerouslyGetLatestDerivedSwapInfo
        # But add smartPoolAddress parameter
        return main_lines
    
    # ===== useDerivedSwapInfo =====
    if 'useDerivedSwapInfo.ts' in filepath:
        # Accept upstream's plan trade approach
        return main_lines
    
    # ===== swap types =====
    if 'swapCallback.ts' in filepath:
        if 'smartPoolAddress' in head_text:
            # Keep smartPoolAddress
            return head_lines
        return main_lines
    
    if 'swapHandlers.ts' in filepath:
        if 'smartPoolAddress' in head_text:
            result = list(main_lines)
            result.append('  smartPoolAddress?: string')
            return result
        return main_lines
    
    if 'wrapCallback.ts' in filepath:
        if 'smartPoolAddress' in head_text:
            result = list(main_lines)
            result.append('  smartPoolAddress?: string')
            return result
        return main_lines
    
    # ===== SwapFormDecimalPad =====
    if 'SwapFormDecimalPad' in filepath:
        # Accept upstream refactored version but keep isSmartPool
        return main_lines
    
    # ===== SwapFormCurrencyInputPanel =====
    if 'SwapFormCurrencyInputPanel.tsx' in filepath:
        # Keep Rigoblock's smartPoolAddress usage
        return head_lines
    
    # ===== SwapTokenSelector =====
    if 'SwapTokenSelector.tsx' in filepath:
        # Accept upstream's useActiveAddresses approach
        return main_lines
    
    # ===== transactionDetails.ts =====
    if 'transactionDetails.ts' in filepath:
        if 'SetSpread' in head_text or 'Rigoblock Vaults' in head_text:
            # Keep Rigoblock vault types + accept upstream Plan type
            result = list(head_lines)
            # Add upstream's Plan type
            for l in main_lines:
                if l.strip() and l.strip() not in [x.strip() for x in head_lines]:
                    result.append(l)
            return result
        if 'DeployVaultTransactionInfo' in head_text:
            # Keep all Rigoblock transaction info types + upstream ones
            result = list(head_lines)
            for l in main_lines:
                if l.strip() and l.strip() not in [x.strip() for x in head_lines]:
                    result.append(l)
            return result
        return main_lines
    
    # ===== telemetry =====
    if 'element.ts' in filepath:
        # Keep both
        result = list(head_lines)
        for l in main_lines:
            if l.strip() and l.strip() not in [x.strip() for x in head_lines]:
                result.append(l)
        return result
    
    # ===== useMaxAmountSpend =====
    if 'useMaxAmountSpend.ts' in filepath:
        if 'isSmartPool' in head_text and ('actualGasFee' in main_text or main_text.strip() == ''):
            if 'actualGasFee' in main_text:
                # Keep both params
                result = list(main_lines)
                result.append('  isSmartPool = false,') if 'isSmartPool = false' in head_text else None
                result.append('  isSmartPool?: boolean') if 'isSmartPool?: boolean' in head_text else None
                return result
            else:
                # HEAD has the smart pool early return logic, main is empty (removed)
                # Keep Rigoblock's smart pool logic
                return head_lines
        return main_lines
    
    # ===== apps/web files =====
    
    # createLegacyBannersNotificationDataSource
    if 'createLegacyBannersNotification' in filepath:
        return main_lines if main_lines else ['']
    
    # AddressInputPanel
    if 'AddressInputPanel.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # SwapDetails (web)
    if 'swap/SwapDetails.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # Popover
    if 'Popover.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # PrivacyPolicy
    if 'PrivacyPolicy.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # MiniPortfolio
    if 'MiniPortfolio.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # OffchainActivityModal
    if 'OffchainActivityModal.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # Activity constants
    if 'Activity/constants.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # DefaultMenu
    if 'DefaultMenu.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # MultiBlockchainAddressDisplay
    if 'MultiBlockchainAddressDisplay.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # ClaimFeeModal
    if 'ClaimFeeModal.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # LiquidityPositionInfoBadges
    if 'LiquidityPositionInfoBadges.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # useDepositInfo
    if 'useDepositInfo.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # Deposit.tsx
    if 'Deposit.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # ErrorBoundary
    if 'ErrorBoundary.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # MoreActionTile
    if 'MoreActionTile.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # CompanyMenu
    if 'CompanyMenu' in filepath:
        return main_lines if main_lines else ['']
    
    # NavBar
    if 'NavBar/index.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # TabsContent
    if 'TabsContent.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # SwapCurrencyInputPanel (web)
    if 'SwapCurrencyInputPanel.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # CurrencySearchModal
    if 'CurrencySearchModal.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # styled.tsx in SearchModal
    if 'SearchModal/styled.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # CurrencyList
    if 'CurrencyList/index.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # CurrencySearch
    if 'CurrencySearch.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # earn/styled
    if 'earn/styled.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # Card/cards
    if 'Card/cards.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # webReducer
    if 'webReducer.ts' in filepath:
        if 'portfolioStaking' in head_text:
            # Keep both: Rigoblock's portfolioStaking + upstream's saga
            result = list(main_lines)
            for l in head_lines:
                if 'portfolioStaking' in l or 'stakingSlice' in l or 'poolsList' in l:
                    result.append(l)
            return result
        return main_lines
    
    # reducerTypeTest
    if 'reducerTypeTest.ts' in filepath:
        if 'portfolioStaking' in head_text or 'PortfolioStakingState' in head_text:
            result = list(main_lines)
            for l in head_lines:
                if 'portfolioStaking' in l or 'PortfolioStakingState' in l or 'PoolsListsState' in l or 'poolsList' in l:
                    result.append(l)
            return result
        return main_lines
    
    # swap/hooks
    if 'state/swap/hooks.tsx' in filepath:
        if 'poolExtendedContract' in head_text or 'usePoolExtendedContract' in head_text:
            result = list(main_lines)
            for l in head_lines:
                if 'poolExtended' in l.lower() or 'useReadContract' in l or 'assume0xAddress' in l or 'useIsTokenOwnable' in l:
                    result.append(l)
            return result
        return main_lines
    
    # routing/slice
    if 'routing/slice.ts' in filepath:
        # Keep both: Rigoblock's smart pool import + upstream's analytics imports
        result = list(main_lines)
        for l in head_lines:
            if 'SmartPool' in l or 'smartPool' in l:
                result.append(l)
        return result
    
    # Footer
    if 'Footer.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # RemoveLiquidityReview
    if 'RemoveLiquidityReview.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # useRemoveLiquidityTxAndGasInfo
    if 'useRemoveLiquidityTxAndGasInfo.ts' in filepath:
        if 'useActiveSmartPool' in head_text:
            result = list(main_lines)
            result.append("import { useActiveSmartPool } from 'state/application/hooks'")
            result.append("import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'")
            return result
        if 'simulateTransaction' in head_text and 'getDecreaseLPPositionQueryParams' in main_text:
            # Accept upstream's refactored approach
            return main_lines
        return main_lines
    
    # PositionPage
    if 'PositionPage.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # Positions/index
    if 'Positions/index.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # RouteDefinitions
    if 'RouteDefinitions.tsx' in filepath:
        return resolve_route_definitions(head_lines, main_lines)
    
    # Portfolio files
    if 'Portfolio' in filepath:
        return resolve_portfolio(head_lines, main_lines, filepath)
    
    # CreatePositionTxContext
    if 'CreatePositionTxContext.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # Swap/Limit files
    if 'ConfirmSwapModal/Error.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    if 'useConfirmModalState.ts' in filepath:
        return main_lines if main_lines else ['']
    
    if 'LimitForm.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # Swap/index
    if 'Swap/index.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # IncreaseLiquidity files
    if 'IncreaseLiquidity' in filepath:
        return main_lines if main_lines else ['']
    
    # TokenBalancesProvider
    if 'TokenBalancesProvider.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # index.tsx (web app entry)
    if filepath.endswith('apps/web/src/index.tsx'):
        return main_lines if main_lines else ['']
    
    # useWrapCallback
    if 'useWrapCallback.tsx' in filepath:
        return main_lines if main_lines else ['']
    
    # csp.json
    if 'csp.json' in filepath:
        return main_lines if main_lines else ['']
    
    # Default: prefer main (upstream) to get latest code
    return main_lines if main_lines else head_lines


def resolve_route_definitions(head_lines, main_lines):
    """Resolve RouteDefinitions conflicts - keep Rigoblock-specific routes."""
    head_text = '\n'.join(head_lines)
    main_text = '\n'.join(main_lines)
    
    # Import conflicts: merge both
    if 'import' in head_text and (not main_text.strip() or 'import' in main_text):
        result = list(main_lines) if main_lines else []
        for l in head_lines:
            if any(kw in l for kw in ['Earn', 'Stake', 'CreatePool', 'shouldDisable', 'useAtom']):
                result.append(l)
        return result if result else ['']
    
    # Lazy imports: accept upstream with ~/paths, keep Rigoblock-specific ones
    if 'lazy(' in head_text:
        result = list(main_lines)
        for l in head_lines:
            if any(kw in l for kw in ['PoolPositionPage', 'Vote']):
                result.append(l)
        return result
    
    # Feature flags and route configs
    if 'shouldDisableExploreRoutes' in head_text:
        # Accept upstream plus keep Rigoblock's shouldDisableExploreRoutes
        result = list(main_lines)
        for l in head_lines:
            if 'shouldDisableExploreRoutes' in l or 'shouldDisableNFTRoutes' in l:
                result.append(l)
        return result
    
    # Portfolio route config
    if 'PortfolioTitle' in head_text or 'isPortfolioPageEnabled' in head_text:
        # Accept upstream's richer nested paths
        return main_lines
    
    return main_lines if main_lines else head_lines


def resolve_portfolio(head_lines, main_lines, filepath):
    """Resolve Portfolio-related conflicts - keep Rigoblock staking tab."""
    head_text = '\n'.join(head_lines)
    
    if 'staking' in head_text.lower():
        # Keep Rigoblock staking references + accept upstream
        result = list(main_lines)
        for l in head_lines:
            if 'staking' in l.lower() or 'Staking' in l:
                result.append(l)
        return result
    
    return main_lines if main_lines else ['']


def main():
    root = '/home/gabriele/interface'
    conflict_files = []
    
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip node_modules, .git, etc.
        dirnames[:] = [d for d in dirnames if d not in ['node_modules', '.git', '.next', 'dist', 'build']]
        for fn in filenames:
            if fn.endswith(('.ts', '.tsx', '.json', '.js', '.jsx')):
                fpath = os.path.join(dirpath, fn)
                try:
                    with open(fpath, 'r') as f:
                        content = f.read()
                    if '<<<<<<< HEAD' in content:
                        conflict_files.append(fpath)
                except:
                    pass
    
    print(f"Found {len(conflict_files)} files with conflicts")
    
    resolved_count = 0
    failed = []
    
    for fpath in sorted(conflict_files):
        try:
            with open(fpath, 'r') as f:
                content = f.read()
            
            resolved = resolve_file(fpath, content)
            
            # Verify no remaining conflicts
            if '<<<<<<< HEAD' in resolved or '=======' in resolved or '>>>>>>> main' in resolved:
                # Check if ======= is legitimate (not a conflict marker)
                lines = resolved.split('\n')
                has_conflict = False
                for i, line in enumerate(lines):
                    if line.startswith('<<<<<<< HEAD'):
                        has_conflict = True
                        break
                if has_conflict:
                    failed.append(fpath)
                    print(f"  FAILED (still has conflicts): {fpath}")
                    continue
            
            with open(fpath, 'w') as f:
                f.write(resolved)
            resolved_count += 1
            rel = os.path.relpath(fpath, root)
            print(f"  Resolved: {rel}")
        except Exception as e:
            failed.append(fpath)
            print(f"  ERROR: {fpath}: {e}")
    
    print(f"\nResolved: {resolved_count}/{len(conflict_files)}")
    if failed:
        print(f"Failed: {len(failed)}")
        for f in failed:
            print(f"  - {os.path.relpath(f, root)}")


if __name__ == '__main__':
    main()
