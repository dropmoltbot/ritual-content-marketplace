import json, solcx
from web3 import Web3
from eth_account import Account

# Compile the contract
contract_path = "/tmp/ritual-content-marketplace/contracts/ContentMarketplace.sol"
with open(contract_path) as f:
    source = f.read()

compiled = solcx.compile_source(
    source,
    output_values=["abi", "bin"],
    solc_version="0.8.20"
)

# Find the contract
for key, val in compiled.items():
    if "ContentMarketplace" in key:
        abi = val["abi"]
        bytecode = val["bin"]
        break

print(f"Contract compiled: {len(bytecode)} bytes bytecode, {len(abi)} ABI entries")

# Save ABI for frontend
with open("/tmp/ritual-content-marketplace/contracts/ContentMarketplace.abi.json", "w") as f:
    json.dump(abi, f, indent=2)
print("ABI saved")

# Deploy
w3 = Web3(Web3.HTTPProvider("https://rpc.ritualfoundation.org"))
owner_pk = "0xe4eb3a80c1762b0747d38648e0f8187f5cab36f5ffda6b398b80bb603ad48f22"
owner_addr = Web3.to_checksum_address("0x148533b555136fC5A84495E55222eFd45F083AAB")

print(f"Owner balance: {w3.from_wei(w3.eth.get_balance(owner_addr), 'ether'):.6f} RITUAL")

# Create contract
Contract = w3.eth.contract(abi=abi, bytecode=bytecode)
nonce = w3.eth.get_transaction_count(owner_addr)
gas_price = w3.eth.gas_price

# Build deploy tx
tx = Contract.constructor().build_transaction({
    'nonce': nonce,
    'gas': 2000000,
    'maxFeePerGas': gas_price,
    'maxPriorityFeePerGas': gas_price,
    'chainId': 1979,
})

signed = Account.sign_transaction(tx, owner_pk)
tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
print(f"Deploy TX: {tx_hash.hex()}")

receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
print(f"Status: {'SUCCESS' if receipt.status == 1 else 'FAILED'}")
print(f"Contract address: {receipt.contractAddress}")
print(f"Gas used: {receipt.gasUsed}")
print(f"Block: {receipt.blockNumber}")

# Save contract address
with open("/tmp/ritual-content-marketplace/contract_address.txt", "w") as f:
    f.write(receipt.contractAddress)
print(f"Address saved to contract_address.txt")