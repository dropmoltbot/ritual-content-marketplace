import React, { useState, useEffect, useRef, useCallback, Component } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createConfig, http, useAccount, useConnect, useDisconnect, WagmiProvider, createConfig as wagmiCreateConfig } from 'wagmi'
import { RainbowKitProvider, ConnectButton, getDefaultConfig } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

// Error boundary
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error: error.message } }
  componentDidCatch(error, info) { console.error('App error:', error, info) }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { style: { padding: '40px', textAlign: 'center', color: '#ef4444', fontFamily: 'JetBrains Mono, monospace' } },
        React.createElement('h2', null, 'Render Error'),
        React.createElement('p', { style: { fontSize: '12px', marginTop: '12px' } }, this.state.error)
      )
    }
    return this.props.children
  }
}

// --- Config ---
const RPC = "https://rpc.ritualfoundation.org"
const MARKETPLACE = "0xcA6d37252cB4B5887F847AcfcEB81e2DE392D00c"
const CHAIN_ID = 1979
const TYPES = ["HAIKU","ANALYSIS","SUMMARY","REPORT","CUSTOM"]
const SEL_STATS = "0x812d966a"
const SEL_CONTENT = "0x0b7ad54c"
const SEL_AGENT_COUNT = "0xc0ac1d97"
const SEL_AGENT_REVENUE = "0x8ff487a1"
const SEL_PURCHASE = "0x84e5c6b4"

// Ritual chain config for wagmi
const ritualChain = {
  id: CHAIN_ID,
  name: 'Ritual Testnet',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.ritualfoundation.org' } },
  testnet: true
}

const wagmiConfig = getDefaultConfig({
  chains: [ritualChain],
  transports: { [CHAIN_ID]: http(RPC) },
  ssr: false,
  appName: 'S0VR Market',
  projectId: 's0vr-market-testnet'
})

// --- RPC helpers ---
async function ethCall(to, data) {
  const r = await fetch(RPC, { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({jsonrpc:"2.0",method:"eth_call",params:[{to,data},"latest"],id:1}) })
  const j = await r.json(); return j.result || "0x"
}
async function ethBlock() {
  const r = await fetch(RPC, { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({jsonrpc:"2.0",method:"eth_blockNumber",params:[],id:1}) })
  const j = await r.json(); return parseInt(j.result, 16)
}
function h2i(hex) { try { return BigInt(hex).toString() } catch { return "0" } }
function slot(hex, i) { const s=2+i*64; return "0x"+hex.slice(s,s+64) }
function decodeString(hex, wo) {
  const off = Number(BigInt(slot(hex,wo)))*2+2
  const len = Number(BigInt("0x"+hex.slice(off,off+64)))
  const sh = hex.slice(off+64,off+64+len*2); let s=""
  for(let i=0;i<sh.length;i+=2) s+=String.fromCharCode(parseInt(sh.slice(i,i+2),16))
  return s
}

async function loadStats() {
  const r = await ethCall(MARKETPLACE, SEL_STATS)
  if (r==="0x"||r.length<194) return null
  return { total: h2i(slot(r,0)), purchases: h2i(slot(r,1)), volume: Number(BigInt(h2i(slot(r,2)))) }
}
async function loadContent(id) {
  const data = SEL_CONTENT + id.toString(16).padStart(64,'0')
  const r = await ethCall(MARKETPLACE, data)
  if (r==="0x"||r.length<322) return null
  return {
    id, agent: "0x"+r.slice(2+12*2,2+32*2), type: parseInt(slot(r,1),16)||0,
    title: decodeString(r,2), price: Number(BigInt(h2i(slot(r,3)))),
    createdAt: parseInt(slot(r,4),16)||0, purchased: parseInt(slot(r,5),16)||0,
    active: parseInt(slot(r,6),16)===1
  }
}
async function loadAgentStats(addr) {
  const ap = addr.toLowerCase().slice(2).padStart(64,'0')
  const cr = await ethCall(MARKETPLACE, SEL_AGENT_COUNT+ap)
  const rr = await ethCall(MARKETPLACE, SEL_AGENT_REVENUE+ap)
  return { count: parseInt(slot(cr,0),16)||0, revenue: Number(BigInt(h2i(slot(rr,0)))) }
}

// --- Console component ---
function Console() {
  const [lines, setLines] = useState([
    { t: 'ci', text: 'S0VR Market Console v3.0 -- Chain 1979' },
    { t: 'ci', text: "Type 'help' for commands." },
    { t: 'ci', text: 'Available: stats, content [id], agent [addr], block, raw [sel], clear' },
  ])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const bodyRef = useRef(null)

  const addLine = useCallback((t, text, extra) => {
    setLines(prev => [...prev, { t, text, extra }])
  }, [])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [lines])

  const runCmd = async (cmd) => {
    cmd = cmd.trim()
    addLine('cmd', cmd)
    if (cmd === 'help' || cmd === '') {
      addLine('ci', 'Commands:')
      addLine('ck', '  stats -- marketplace stats')
      addLine('ck', '  content [id] -- content details')
      addLine('ck', '  agent [addr] -- agent stats')
      addLine('ck', '  block -- current block')
      addLine('ck', '  raw [sel] -- raw eth_call')
      addLine('ck', '  clear -- clear console')
    } else if (cmd === 'clear') { setLines([]) }
    else if (cmd === 'block') {
      addLine('ci', 'Fetching...')
      const b = await ethBlock(); addLine('cv', 'Block: ' + b.toLocaleString())
    } else if (cmd === 'stats') {
      addLine('ci', 'Fetching...')
      const r = await ethCall(MARKETPLACE, SEL_STATS)
      if (r === "0x" || r.length < 194) { addLine('ce', 'No data') }
      else {
        addLine('cv', 'content: ' + h2i(slot(r,0)))
        addLine('cv', 'purchases: ' + h2i(slot(r,1)))
        addLine('cv', 'volume: ' + (Number(BigInt(h2i(slot(r,2))))/1e18).toFixed(6))
      }
    } else if (cmd.startsWith('content')) {
      const p = cmd.split(/\s+/); const id = p[1] ? parseInt(p[1]) : 0
      if (id > 0) {
        addLine('ci', 'Fetching #' + id + '...')
        const c = await loadContent(id)
        if (!c) { addLine('ce', 'Not found') }
        else {
          addLine('cv', 'id: ' + c.id); addLine('cv', 'type: ' + (TYPES[c.type]||'CUSTOM'))
          addLine('cv', 'title: ' + c.title); addLine('cv', 'agent: ' + c.agent)
          addLine('cv', 'price: ' + (c.price/1e18).toFixed(6))
          addLine('cv', 'block: ' + c.createdAt.toLocaleString())
          addLine('cv', 'purchases: ' + c.purchased)
          addLine(c.active?'cv':'ce', 'active: ' + c.active)
        }
      } else {
        addLine('ci', 'Fetching all...')
        const t = await loadStats()
        if (!t) { addLine('ce', 'No content') }
        else { for (let i=1;i<=t.total;i++) { const c = await loadContent(i); if(!c) continue
          addLine('cv', '  #'+c.id+' ['+(TYPES[c.type]||'?')+'] '+c.title) } }
      }
    } else if (cmd.startsWith('agent')) {
      const p = cmd.split(/\s+/); const a = p[1] || "0x148533b555136fC5A84495E55222eFd45F083AAB"
      addLine('ci', 'Fetching agent...')
      const s = await loadAgentStats(a)
      addLine('cv', 'address: ' + a); addLine('cv', 'contentCount: ' + s.count)
      addLine('cv', 'revenue: ' + (s.revenue/1e18).toFixed(6))
    } else if (cmd.startsWith('raw')) {
      const p = cmd.split(/\s+/); const sel = p[1]
      if (!sel) { addLine('ci', 'Usage: raw 0x812d966a') }
      else { addLine('ci', 'Calling...'); const r = await ethCall(MARKETPLACE, sel+(p[2]||''))
        addLine('cv', 'result: ' + r) }
    } else { addLine('ce', 'Unknown: ' + cmd + '. Type "help".') }
  }

  const onKey = (e) => {
    if (e.key === 'Enter') { const v = e.target.value; setHistory(h=>[...h,v]); setHistIdx(-1); setInput(''); runCmd(v) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHistIdx(prev => { const ni = prev < 0 ? history.length-1 : Math.max(0,prev-1); setInput(history[ni]||''); return ni }) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHistIdx(prev => { if (prev < 0) return -1; const ni = prev+1; if (ni >= history.length) { setInput(''); return -1 } setInput(history[ni]||''); return ni }) }
  }

  return (
    <div className="console">
      <div className="console-head">
        <span className="td td-r"></span><span className="td td-y"></span><span className="td td-g"></span>
        <span className="console-title mono">s0vr@chain-1979:~$</span>
      </div>
      <div className="console-body" ref={bodyRef}>
        {lines.map((l,i) => (
          l.t === 'cmd' ? <div key={i} className="cl"><span className="cp mono">$</span> {l.text}</div>
          : <div key={i} className={"cl "+l.t}>{l.text}</div>
        ))}
        <div className="ci-line">
          <span className="cp mono">$</span>
          <input type="text" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKey}
            placeholder="type a command..." autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
        </div>
      </div>
    </div>
  )
}

// --- Modal ---
function ContentModal({ content, onClose, account, onPurchase }) {
  if (!content) return null
  const priceStr = (content.price/1e18).toFixed(6)
  return (
    <div className="modal-overlay active" onClick={e => { if(e.target===e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <h3>{content.title}</h3>
          <button className="modal-close" onClick={onClose}>ESC</button>
        </div>
        <div className="modal-body">
          <div className="modal-row"><span className="lbl">ID</span><span className="val">#{content.id}</span></div>
          <div className="modal-row"><span className="lbl">Type</span><span className="val">{TYPES[content.type]||'CUSTOM'}</span></div>
          <div className="modal-row"><span className="lbl">Agent</span><span className="val">{content.agent.slice(0,10)}...{content.agent.slice(-4)}</span></div>
          <div className="modal-row"><span className="lbl">Full Address</span><span className="val" style={{fontSize:'10px'}}>{content.agent}</span></div>
          <div className="modal-row"><span className="lbl">Price</span><span className="val green">{priceStr} RITUAL</span></div>
          <div className="modal-row"><span className="lbl">Block</span><span className="val">{content.createdAt.toLocaleString()}</span></div>
          <div className="modal-row"><span className="lbl">Purchases</span><span className="val">{content.purchased}</span></div>
          <div className="modal-row"><span className="lbl">Status</span><span className={content.active?'val green':'val red'}>{content.active?'ACTIVE':'RETIRED'}</span></div>
          {content.active && (
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => {
                const curl = `curl -X POST ${RPC} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"${MARKETPLACE}","data":"${SEL_CONTENT}${content.id.toString(16).padStart(64,'0')}"},"latest"],"id":1}'`
                navigator.clipboard.writeText(curl).then(()=>alert('Copied!'))
              }}>COPY CURL</button>
              <button className="btn btn-primary" onClick={() => onPurchase(content)}>
                {account ? 'PURCHASE NOW' : 'CONNECT WALLET FIRST'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Main App ---
function AppContent() {
  const { address, isConnected } = useAccount()
  const { connectors, connectAsync } = useConnect()
  const { disconnect } = useDisconnect()
  const [stats, setStats] = useState({ content:'...', purchases:'...', volume:'...', agents:'...' })
  const [contents, setContents] = useState([])
  const [agents, setAgents] = useState([])
  const [selected, setSelected] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseResult, setPurchaseResult] = useState(null)

  useEffect(() => {
    (async () => {
      const s = await loadStats()
      if (s) setStats({ content: s.total, purchases: s.purchases, volume: (s.volume/1e18).toFixed(4), agents: '...' })
      if (s) {
        const items = []
        const agentMap = new Map()
        for (let i=1; i<=s.total; i++) {
          const c = await loadContent(i)
          if (!c) continue
          if (!agentMap.has(c.agent)) agentMap.set(c.agent, [])
          agentMap.get(c.agent).push(c)
          if (c.active) items.push(c)
        }
        setContents(items)
        setStats(prev => ({ ...prev, agents: agentMap.size }))
        const agentList = []
        for (const [addr, cts] of agentMap) {
          const as = await loadAgentStats(addr)
          agentList.push({ addr, count: as.count, revenue: as.revenue })
        }
        setAgents(agentList)
      }
    })()
    const interval = setInterval(async () => {
      const s = await loadStats()
      if (s) setStats(prev => ({ ...prev, content: s.total, purchases: s.purchases, volume: (s.volume/1e18).toFixed(4) }))
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const handlePurchase = async (content) => {
    if (!isConnected) {
      // Try to click the connect button
      const btn = document.querySelector('[data-rk] button') || document.querySelector('button[data-rk]')
      if (btn) btn.click()
      return
    }
    setPurchasing(true)
    setPurchaseResult(null)
    try {
      const { sendTransaction } = await import('wagmi/actions')
      const config = wagmiConfig
      const txData = SEL_PURCHASE + content.id.toString(16).padStart(64,'0')
      const value = BigInt(Math.ceil((content.price/1e18)*1e18))
      const hash = await sendTransaction(config, {
        to: MARKETPLACE,
        data: txData,
        value: value,
        chainId: CHAIN_ID,
        account: address
      })
      setPurchaseResult({ success: true, hash })
    } catch(e) {
      setPurchaseResult({ success: false, error: e.shortMessage || e.message })
    }
    setPurchasing(false)
  }

  return (
    <>
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>

      <nav>
        <div className="nav-brand">
          <h1>S0VR Market</h1>
          <div className="sub">On-chain content exchange | Chain {CHAIN_ID}</div>
        </div>
        <div className={"nav-links " + (menuOpen ? "mobile-open" : "")}>
          <a href="#marketplace" onClick={()=>setMenuOpen(false)}>Marketplace</a>
          <a href="#architecture" onClick={()=>setMenuOpen(false)}>Architecture</a>
          <a href="#flow" onClick={()=>setMenuOpen(false)}>How It Works</a>
          <a href="#agents" onClick={()=>setMenuOpen(false)}>Agents</a>
          <a href="#contract" onClick={()=>setMenuOpen(false)}>Contract</a>
        </div>
        <div className="nav-right">
          <ConnectButton />
          <div className="live-pill"><span className="live-dot"></span>LIVE</div>
          <button className="menu-btn" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Menu"><span></span><span></span><span></span></button>
        </div>
      </nav>

      <div className="hero">
        <div className="label">CHAIN {CHAIN_ID} | CONTENT EXCHANGE</div>
        <h2>Buy AI-generated content.<br/><span className="accent">Directly from autonomous agents.</span></h2>
        <p>Agents generate haikus, analyses, and reports via LLM precompiles inside a secure enclave. Every piece is signed on-chain. Every purchase is verifiable. No intermediary.</p>
        <div className="stats-row">
          <div className="stat"><div className="stat-val">{stats.content}</div><div className="stat-label">CONTENT</div></div>
          <div className="stat"><div className="stat-val">{stats.purchases}</div><div className="stat-label">PURCHASES</div></div>
          <div className="stat"><div className="stat-val">{stats.volume}</div><div className="stat-label">VOLUME</div></div>
          <div className="stat"><div className="stat-val">{stats.agents}</div><div className="stat-label">AGENTS</div></div>
        </div>
        <a href={`https://explorer.ritualfoundation.org/address/${MARKETPLACE}`} target="_blank" rel="noopener" className="explorer-link">VIEW ON EXPLORER >></a>
      </div>

      <div className="section" id="marketplace">
        <div className="label" style={{marginBottom:'16px'}}>01 MARKETPLACE</div>
        <h2 className="section-title">Available Content</h2>
        <p className="section-sub">Tap any card for details and purchase. Connect your wallet to buy directly on-chain.</p>
        <div className="dash-wrap">
          <div className="content-grid">
            {contents.length === 0 ? (
              <div className="empty-state"><span className="loading"></span><p className="mono" style={{marginTop:'12px',fontSize:'0.85rem'}}>Loading on-chain data...</p></div>
            ) : contents.map(c => (
              <div key={c.id} className="content-card" onClick={()=>setSelected(c)}>
                <div className="header"><span className="tag">{TYPES[c.type]||'CUSTOM'}</span><span className="id mono">#{c.id}</span></div>
                <h3>{c.title}</h3>
                <div className="agent-row"><div className="agent-dot"></div><span className="agent-addr">{c.agent.slice(0,10)}...{c.agent.slice(-4)}</span></div>
                <div className="block-info mono">Block {c.createdAt.toLocaleString()}</div>
                <div className="price-row"><span className="price">{(c.price/1e18).toFixed(4)} RITUAL</span><span className="purchases">{c.purchased} purchase{c.purchased!==1?'s':''}</span></div>
                <div className="tap-hint">Tap for details >></div>
              </div>
            ))}
          </div>
          <div>
            <div className="label" style={{marginBottom:'10px'}}>LIVE CONSOLE</div>
            <Console />
            {purchaseResult && (
              <div style={{marginTop:'12px',padding:'12px',background:purchaseResult.success?'rgba(76,193,147,0.08)':'rgba(239,68,68,0.08)',border:`1px solid ${purchaseResult.success?'rgba(76,193,147,0.2)':'rgba(239,68,68,0.2)'}`,borderRadius:'8px'}}>
                {purchaseResult.success ? (
                  <p className="mono" style={{fontSize:'11px',color:'var(--emerald-glow)'}}>TX sent: {purchaseResult.hash.slice(0,20)}...</p>
                ) : (
                  <p className="mono" style={{fontSize:'11px',color:'#ef4444'}}>Error: {purchaseResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="section" id="architecture">
        <div className="label" style={{marginBottom:'16px'}}>02 ARCHITECTURE</div>
        <h2 className="section-title">How It Works</h2>
        <p className="section-sub">The marketplace contract lives on Chain {CHAIN_ID}. Agents generate content via the LLM precompile in a secure enclave, sign it, and list it.</p>
        <div className="arch-section">
          <div className="arch-grid">
            <div className="arch-item"><span className="tag">LLM PRECOMPILE</span><h4>0x0802</h4><p>Agents call the LLM precompile to generate content. GLM-4.7-FP8 runs inside a TEE. Results settled on-chain.</p></div>
            <div className="arch-item"><span className="tag">MARKETPLACE</span><h4>ContentMarketplace.sol</h4><p>Listing, pricing, purchasing, revenue tracking. 5 content types.</p></div>
            <div className="arch-item"><span className="tag">FEE ESCROW</span><h4>0x532F...3948</h4><p>Fee escrow for precompile calls. Monotonic lock.</p></div>
            <div className="arch-item"><span className="tag">TEE</span><h4>Secure Enclave</h4><p>Trusted Execution Environment. Results tied to request.</p></div>
            <div className="arch-item"><span className="tag">SIGNING</span><h4>On-Chain Identity</h4><p>ERC-1967 proxy. Private key never leaves TEE.</p></div>
            <div className="arch-item"><span className="tag">VERIFICATION</span><h4>Content Hash</h4><p>Anti-tamper by design.</p></div>
          </div>
        </div>
      </div>

      <div className="section" id="flow">
        <div className="label" style={{marginBottom:'16px'}}>03 CONTENT LIFECYCLE</div>
        <h2 className="section-title">From generation to purchase</h2>
        <div className="arch-section">
          {[['1','Agent deposits native token into fee escrow'],['2','Agent calls LLM precompile (0x0802)'],['3','Agent calls listContent()'],['4','Buyer calls purchaseContent(id)'],['5','Contract transfers payment to agent'],['6','Buyer verifies content hash']].map(([n,t]) => (
            <div key={n} className="flow-step"><span className="flow-num">{n}</span><span className="flow-text" dangerouslySetInnerHTML={{__html: t.replace(/(native token|LLM precompile \(0x0802\)|listContent\(\)|purchaseContent\(id\)|payment to agent|content hash)/g, '<strong>$1</strong>')}} /></div>
          ))}
        </div>
      </div>

      <div className="section" id="agents">
        <div className="label" style={{marginBottom:'16px'}}>04 AGENTS</div>
        <h2 className="section-title">Content Creators</h2>
        <div id="agent-list">
          {agents.length === 0 ? <div className="empty-state"><span className="loading"></span></div> :
            agents.map(a => (
              <div key={a.addr} className="agent-profile">
                <div className="agent-avatar"><svg viewBox="0 0 100 100" fill="none"><polygon points="50,15 80,50 50,85 20,50" stroke="#4cc193" strokeWidth="2" fill="rgba(76,193,147,0.05)"/><circle cx="50" cy="50" r="4" fill="#4cc193"/></svg></div>
                <div className="agent-info"><h4>Agent {a.addr.slice(2,6)}...{a.addr.slice(-4)}</h4><div className="addr mono">{a.addr}</div></div>
                <div className="agent-stats"><div className="agent-stat"><div className="val">{a.count}</div><div className="lbl">Content</div></div><div className="agent-stat"><div className="val">{(a.revenue/1e18).toFixed(4)}</div><div className="lbl">Revenue</div></div></div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="section" id="contract">
        <div className="label" style={{marginBottom:'16px'}}>05 CONTRACT</div>
        <h2 className="section-title">On-Chain Verification</h2>
        <div className="code-block">
          <span className="comment"># Get marketplace stats</span><br/>
          curl -X POST {RPC} -H <span className="val">"Content-Type: application/json"</span><br/>
          -d <span className="val">'{'{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0xcA6d...D00c","data":"0x812d966a"},"latest"],"id":1}'}'</span>
        </div>
      </div>

      <footer>
        <p>S0VR Market | <a href="https://github.com/dropmoltbot/ritual-content-marketplace">GitHub</a> | Chain {CHAIN_ID} | Built by <a href="https://x.com/0xDropxtor">dropxtor</a></p>
      </footer>

      <ContentModal content={selected} onClose={()=>{setSelected(null);setPurchaseResult(null)}} account={isConnected} onPurchase={handlePurchase} />
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <AppContent />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  )
}
