#!/usr/bin/env python3
"""
Content Marketplace - Agent Generator
Generates content via Ritual LLM precompile and lists it on the marketplace.

Usage:
    python3 generate_content.py --type haiku --prompt "Write a haiku about entropy" --price 0.001
"""

import json, argparse, subprocess, sys
from web3 import Web3
from eth_account import Account

# Chain config
RPC = "https://rpc.ritualfoundation.org"
CHAIN_ID = 1979
LLM_PRECOMPILE = "0x0000000000000000000000000000000000000802"
RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129Da2a3948"
MARKETPLACE_ADDR = ""  # Set after deploy

w3 = Web3(Web3.HTTPProvider(RPC))

def send_eip1559_tx(pk, to, data=b"", value=0, gas=3000000):
    """Send EIP-1559 tx (type 2 only on Ritual)."""
    account = Account.from_key(pk)
    addr = Web3.to_checksum_address(account.address)
    nonce = w3.eth.get_transaction_count(addr)
    gas_price = w3.eth.gas_price

    tx = {
        'nonce': nonce,
        'to': Web3.to_checksum_address(to) if isinstance(to, str) else to,
        'value': value,
        'gas': gas,
        'maxFeePerGas': gas_price,
        'maxPriorityFeePerGas': gas_price,
        'chainId': CHAIN_ID,
        'type': 2,
    }
    if data:
        tx['data'] = data
    if isinstance(to, str):
        tx['to'] = Web3.to_checksum_address(to)

    signed = Account.sign_transaction(tx, pk)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    return tx_hash, receipt

def encode_llm_call(executor_addr, messages_json, model="zai-org/GLM-4.7-FP8"):
    """Encode LLM precompile call (30-field ABI)."""
    # Minimal encoding for a simple inference
    from eth_abi import encode
    from eth_utils import keccak

    # Build the 30-field tuple
    fields = [
        Web3.to_checksum_address(executor_addr),  # executor
        [],  # encryptedSecrets
        300,  # ttl
        [],  # secretSignatures
        b'',  # userPublicKey
        messages_json,  # messagesJson
        model,  # model
        0,  # frequencyPenalty
        '',  # logitBiasJson
        False,  # logprobs
        4096,  # maxCompletionTokens
        '',  # metadataJson
        '',  # modalitiesJson
        1,  # n
        True,  # parallelToolCalls
        0,  # presencePenalty
        'medium',  # reasoningEffort
        b'',  # responseFormatData
        -1,  # seed
        'auto',  # serviceTier
        '',  # stopJson
        False,  # stream
        700,  # temperature (0.7)
        b'',  # toolChoiceData
        b'',  # toolsData
        -1,  # topLogprobs
        1000,  # topP (1.0)
        '',  # user
        False,  # piiEnabled
        ['', '', ''],  # convoHistory (empty)
    ]

    # ABI encode
    encoded = encode(
        ['address', 'bytes[]', 'uint256', 'bytes[]', 'bytes',
         'string', 'string', 'int256', 'string', 'bool', 'int256', 'string', 'string',
         'uint256', 'bool', 'int256', 'string', 'bytes', 'int256', 'string', 'string',
         'bool', 'int256', 'bytes', 'bytes', 'int256', 'int256', 'string', 'bool',
         '(string,string,string)'],
        fields
    )
    return encoded

def generate_content(pk, executor_addr, prompt, content_type="haiku"):
    """Generate content via LLM precompile."""
    system_prompts = {
        "haiku": "You are a crypto-philosophical haiku generator. Write a single haiku (5-7-5 syllables) about the given topic. Return ONLY the haiku, nothing else.",
        "analysis": "You are a blockchain analyst. Provide a concise analysis (max 200 words) of the given topic.",
        "summary": "You are a summarizer. Summarize the given text in 3 key points.",
        "report": "You are a technical report writer. Write a structured report on the given topic.",
        "custom": "You are a creative AI agent. Respond to the prompt.",
    }

    messages = json.dumps([
        {"role": "system", "content": system_prompts.get(content_type, system_prompts["custom"])},
        {"role": "user", "content": prompt},
    ])

    print(f"Generating {content_type} via LLM precompile...")
    print(f"Prompt: {prompt[:80]}...")

    encoded = encode_llm_call(executor_addr, messages)
    tx_hash, receipt = send_eip1559_tx(pk, LLM_PRECOMPILE, data=encoded, gas=5000000)

    print(f"TX: {tx_hash.hex()}")
    print(f"Status: {'SUCCESS' if receipt.status == 1 else 'FAILED'}")
    print(f"Gas used: {receipt.gasUsed}")
    print(f"Logs: {len(receipt.logs)}")

    # Extract LLM result from PrecompileCalled event
    for log in receipt.logs:
        if len(log['data']) > 100:
            print(f"  Log from {log['address']}: {len(log['data'])} bytes")

    return tx_hash.hex(), receipt

def main():
    parser = argparse.ArgumentParser(description="Ritual Content Marketplace - Generate content")
    parser.add_argument("--pk", required=True, help="Agent private key")
    parser.add_argument("--executor", required=True, help="TEE executor address")
    parser.add_argument("--type", default="haiku", choices=["haiku", "analysis", "summary", "report", "custom"])
    parser.add_argument("--prompt", required=True, help="Content prompt")
    parser.add_argument("--price", default="0.001", help="Price in RITUAL")
    args = parser.parse_args()

    tx_hash, receipt = generate_content(args.pk, args.executor, args.prompt, args.type)
    print(f"\nDone. TX: {tx_hash}")

if __name__ == "__main__":
    main()