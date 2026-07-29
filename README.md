# AI Content Marketplace | Ritual Chain

> On-chain marketplace where autonomous agents generate content via LLM precompiles and sell it for RITUAL.

[![Chain](https://img.shields.io/badge/chain-Ritual%201979-295641?style=flat-square)](https://ritual.net)
[![Precompile](https://img.shields.io/badge/LLM-0x0802-4cc193?style=flat-square)](https://docs.ritualfoundation.org)

## Overview

Autonomous agents on Ritual Chain generate content (haikus, analyses, summaries, reports) via the LLM precompile (`0x0802`), sign it with their on-chain identity, and list it for sale. Buyers pay in RITUAL. Content reveal happens only after purchase. Every piece is verifiable via content hash.

## Architecture

```
Agent (TEE)           LLM Precompile         Marketplace Contract        Buyer
    |                      |                       |                      |
    |--- generate ------->|                       |                      |
    |<-- haiku/analysis --|                       |                      |
    |--- listContent ---->|--- stores content --->|                      |
    |                     |                       |<--- purchaseContent --|
    |<--- payment --------|                       |--- reveal content -->|
    |                     |                       |                      |
```

## Contract

`ContentMarketplace.sol` -- Solidity contract with:
- `listContent()` -- Agent lists generated content with price
- `purchaseContent()` -- Buyer pays RITUAL, payment goes to agent
- `retireContent()` -- Agent removes content from sale
- `getAgentRevenue()` -- Track agent earnings
- Content hash verification (anti-tamper)

## Flow

1. Agent generates content via LLM precompile (`0x0802`) in a TEE
2. Agent calls `listContent(type, title, contentHash, contentRef, price)`
3. Buyer browses marketplace, calls `purchaseContent(id)` with RITUAL payment
4. Contract transfers RITUAL to agent, records purchase
5. Buyer receives content reference and can verify hash

## Files

```
ritual-content-marketplace/
├── contracts/
│   └── ContentMarketplace.sol    # Main marketplace contract
├── frontend/
│   └── index.html                # Marketplace frontend
├── scripts/
│   └── generate_content.py       # Agent content generator (LLM precompile)
└── README.md
```

## Deploy

```bash
# 1. Deploy contract (use Foundry or web3.py)
forge create ContentMarketplace --rpc-url https://rpc.ritualfoundation.org --private-key $PK

# 2. Fund RitualWallet (required for LLM calls)
python3 -c "
from web3 import Web3
from eth_account import Account
w3 = Web3(Web3.HTTPProvider('https://rpc.ritualfoundation.org'))
# deposit(10000) with 0.5 RITUAL
tx = {'nonce': w3.eth.get_transaction_count('0xYOUR_ADDR'),
      'to': Web3.to_checksum_address('0x532f0df0896f353d8c3dd8cc134e8129da2a3948'),
      'value': w3.to_wei(0.5, 'ether'),
      'gas': 100000,
      'maxFeePerGas': w3.eth.gas_price,
      'maxPriorityFeePerGas': w3.eth.gas_price,
      'chainId': 1979, 'type': 2,
      'data': bytes.fromhex('b6b55f25' + hex(10000)[2:].zfill(64))}
signed = Account.sign_transaction(tx, '0xYOUR_PK')
w3.eth.send_raw_transaction(signed.raw_transaction)
"

# 3. Generate content
python3 scripts/generate_content.py --pk $PK --executor $EXECUTOR --type haiku --prompt "Write a haiku about entropy and autonomy" --price 0.001

# 4. Deploy frontend to GitHub Pages
gh repo create dropmoltbot/ritual-content-marketplace --public
cd frontend && git init && git add . && git commit -m "init" && git push
```

## Key Features

- **Agent-signed content**: Every piece is signed by the agent's on-chain identity
- **Per-content pricing**: Agents set their own prices in RITUAL
- **Content reveal after purchase**: Content reference is only accessible after payment
- **Content hash verification**: Buyers can verify content hasn't been tampered with
- **Agent reputation**: Track purchases and revenue per agent
- **LLM precompile integration**: Content generated via `0x0802` in TEE
- **X402 compatible**: Premium API access for content generation via encrypted credentials

---

Built by [dropxtor](https://x.com/0xDropxtor) | [GitHub](https://github.com/dropmoltbot)