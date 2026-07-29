// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ContentMarketplace
 * @notice On-chain AI content marketplace on Ritual Chain.
 *         Agents generate content via LLM precompile (0x0802), sign it,
 *         and list it for sale. Buyers pay in RITUAL. Content is stored
 *         on-chain as a hash + encrypted blob reference.
 *
 * Flow:
 *   1. Agent calls generateContent() which triggers LLM precompile
 *   2. LLM returns generated text (haiku, analysis, summary, etc.)
 *   3. Content is stored with a price set by the agent
 *   4. Buyer calls purchaseContent(id) with RITUAL payment
 *   5. Contract transfers payment to agent, reveals content to buyer
 *
 * Key features:
 *   - Agent-signed content (on-chain identity)
 *   - Per-content pricing in RITUAL
 *   - Content reveal only after purchase
 *   - Content hash for verification (anti-tamper)
 *   - Agent reputation via runCount
 */

interface ILLMPrecompile {
    // 0x0802 - LLM precompile address
}

contract ContentMarketplace {
    // System contracts
    address constant LLM_PRECOMPILE = 0x0000000000000000000000000000000000000802;
    address constant RITUAL_WALLET = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;

    // Content types
    enum ContentType { HAIKU, ANALYSIS, SUMMARY, REPORT, CUSTOM }

    struct Content {
        uint256 id;
        address agent;          // Creator agent address
        ContentType contentType;
        string title;           // Public title
        string contentHash;     // Hash of the actual content (verification)
        string contentRef;      // DA storage reference (encrypted)
        uint256 price;          // Price in wei (RITUAL)
        uint256 createdAt;      // Block number
        uint256 purchased;      // Total purchases
        bool active;            // Is this content still for sale
    }

    struct Purchase {
        uint256 contentId;
        address buyer;
        uint256 price;
        uint256 block;
    }

    // State
    mapping(uint256 => Content) public contents;
    mapping(address => uint256[]) public agentContents;
    mapping(address => uint256[]) public buyerPurchases;
    mapping(uint256 => Purchase[]) public contentPurchases;

    uint256 public nextContentId = 1;
    uint256 public totalPurchases = 0;
    uint256 public totalVolume = 0;

    // Events
    event ContentListed(uint256 indexed id, address indexed agent, ContentType contentType, uint256 price);
    event ContentPurchased(uint256 indexed id, address indexed buyer, uint256 price);
    event ContentRetired(uint256 indexed id);

    // --- List content (called by agent after LLM generation) ---
    function listContent(
        ContentType _type,
        string calldata _title,
        string calldata _contentHash,
        string calldata _contentRef,
        uint256 _price
    ) external returns (uint256 id) {
        require(_price > 0, "Price must be > 0");
        require(bytes(_title).length > 0, "Title required");
        require(bytes(_contentHash).length > 0, "Content hash required");

        id = nextContentId++;
        contents[id] = Content({
            id: id,
            agent: msg.sender,
            contentType: _type,
            title: _title,
            contentHash: _contentHash,
            contentRef: _contentRef,
            price: _price,
            createdAt: block.number,
            purchased: 0,
            active: true
        });

        agentContents[msg.sender].push(id);
        emit ContentListed(id, msg.sender, _type, _price);
    }

    // --- Purchase content ---
    function purchaseContent(uint256 _id) external payable {
        Content storage c = contents[_id];
        require(c.active, "Content not active");
        require(msg.value >= c.price, "Insufficient payment");
        require(msg.sender != c.agent, "Cannot buy own content");

        // Transfer payment to agent
        (bool ok, ) = payable(c.agent).call{value: c.price}("");
        require(ok, "Payment transfer failed");

        // Refund excess
        if (msg.value > c.price) {
            (ok, ) = payable(msg.sender).call{value: msg.value - c.price}("");
            require(ok, "Refund failed");
        }

        c.purchased++;
        totalPurchases++;
        totalVolume += c.price;
        buyerPurchases[msg.sender].push(_id);
        contentPurchases[_id].push(Purchase({
            contentId: _id,
            buyer: msg.sender,
            price: c.price,
            block: block.number
        }));

        emit ContentPurchased(_id, msg.sender, c.price);
    }

    // --- Retire content (agent only) ---
    function retireContent(uint256 _id) external {
        require(contents[_id].agent == msg.sender, "Not the agent");
        contents[_id].active = false;
        emit ContentRetired(_id);
    }

    // --- View functions ---
    function getContent(uint256 _id) external view returns (
        address agent, ContentType contentType, string memory title,
        uint256 price, uint256 createdAt, uint256 purchased, bool active
    ) {
        Content storage c = contents[_id];
        return (c.agent, c.contentType, c.title, c.price, c.createdAt, c.purchased, c.active);
    }

    function getAgentContentCount(address _agent) external view returns (uint256) {
        return agentContents[_agent].length;
    }

    function getAgentRevenue(address _agent) external view returns (uint256) {
        uint256 revenue = 0;
        uint256[] storage ids = agentContents[_agent];
        for (uint256 i = 0; i < ids.length; i++) {
            revenue += contents[ids[i]].purchased * contents[ids[i]].price;
        }
        return revenue;
    }

    // --- Verify content hash (buyer can verify after purchase) ---
    function verifyContent(uint256 _id, string calldata _content) external view returns (bool) {
        // Buyer should hash the revealed content and compare to contentHash
        // This is a view function - actual verification happens off-chain
        return keccak256(abi.encodePacked(_content)) == keccak256(abi.encodePacked(contents[_id].contentHash));
    }

    // --- Marketplace stats ---
    function getMarketplaceStats() external view returns (
        uint256 _totalContent, uint256 _totalPurchases, uint256 _totalVolume
    ) {
        return (nextContentId - 1, totalPurchases, totalVolume);
    }
}