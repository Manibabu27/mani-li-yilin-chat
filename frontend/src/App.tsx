import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Send, Smile, Reply, Pencil, Trash2, LogOut, Moon, Sun, Check, CheckCheck, Heart, MessageCircle, Wifi, WifiOff, X, ArrowDown, Sparkles } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
type User = { id: string; name: string }
type Msg = { id:number; sender_id:string; body:string; reply_to_id:number|null; created_at:string|null; edited_at:string|null; deleted_for_everyone:boolean; read_by_other:boolean }
type Presence = Record<string,{online:boolean;last_seen:string|null}>
const THEMES = ['midnight','lavender','emerald','rose'] as const
type Theme = typeof THEMES[number]
const fmtTime = (v:string|null) => v ? new Date(v).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''
const fmtLast = (v:string|null) => {
  if (!v) return 'Last seen recently'
  const d = new Date(v), mins = Math.max(0, Math.floor((Date.now()-d.getTime())/60000))
  if (mins < 1) return 'Last seen just now'
  if (mins < 60) return `Last seen ${mins} min ago`
  const h = Math.floor(mins/60)
  if (h < 24) return `Last seen ${h} hr${h>1?'s':''} ago`
  return `Last seen ${d.toLocaleDateString()} at ${fmtTime(v)}`
}
async function request(path:string, token:string, init:RequestInit={}) {
  const res = await fetch(`${API}${path}`, { ...init, headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(init.headers||{})} })
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.detail || 'Request failed') }
  return res.json()
}
export default function App() {
  const [token,setToken] = useState(localStorage.getItem('chat_token')||'')
  const [me,setMe] = useState<User|null>(null)
  const [name,setName] = useState('mani')
  const [pass,setPass] = useState('')
  const [error,setError] = useState('')
  const [messages,setMessages] = useState<Msg[]>([])
  const [presence,setPresence] = useState<Presence>({})
  const [draft,setDraft] = useState('')
  const [reply,setReply] = useState<Msg|null>(null)
  const [editing,setEditing] = useState<Msg|null>(null)
  const [typing,setTyping] = useState(false)
  const [peerTyping,setPeerTyping] = useState(false)
  const [theme,setTheme] = useState<Theme>((localStorage.getItem('chat_theme') as Theme)||'midnight')
  const [menu,setMenu] = useState<number|null>(null)
  const [confirmDelete,setConfirmDelete] = useState<Msg|null>(null)
  const [connected,setConnected] = useState(false)
  const [loading,setLoading] = useState(false)
  const [showEmoji,setShowEmoji] = useState(false)
  const [mobileInfo,setMobileInfo] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket|null>(null)
  const typingTimer = useRef<number|undefined>(undefined)
  const peer = me?.id === 'mani' ? 'li-yilin' : 'mani'
  const peerName = me?.id === 'mani' ? 'Li Yilin' : 'Mani'
  const peerPresence = presence[peer]
  const msgMap = useMemo(()=>new Map(messages.map(m=>[m.id,m])),[messages])

  const load = useCallback(async (t:string) => {
    setLoading(true)
    try {
      const [u,ms,p] = await Promise.all([request('/api/me',t),request('/api/messages?limit=80',t),request('/api/presence',t)])
      setMe(u); setMessages(ms); setPresence(p)
    } catch(e:any) { setError(e.message); localStorage.removeItem('chat_token'); setToken('') }
    finally { setLoading(false) }
  },[])
  useEffect(()=>{ if(token) load(token) },[token,load])
  useEffect(()=>{
    if(!token || !me) return
    let socket:WebSocket, retry=0, alive=true, reconnectTimer:number
    const connect=()=>{
      const url=API.replace(/^http/,'ws')+`/ws?token=${encodeURIComponent(token)}`
      socket=new WebSocket(url); wsRef.current=socket
      socket.onopen=()=>{retry=0;setConnected(true)}
      socket.onclose=()=>{setConnected(false); if(alive) reconnectTimer=window.setTimeout(connect,Math.min(1000*2**retry++,15000))}
      socket.onerror=()=>socket.close()
      socket.onmessage=(ev)=>{
        const d=JSON.parse(ev.data)
        if(d.type==='message') setMessages(prev=>prev.some(m=>m.id===d.message.id)?prev:[...prev,d.message])
        if(d.type==='message_updated'||d.type==='message_deleted') setMessages(prev=>prev.map(m=>m.id===d.message.id?d.message:m))
        if(d.type==='presence') setPresence(d.presence)
        if(d.type==='typing' && d.user_id!==me.id) setPeerTyping(d.active)
        if(d.type==='read') setMessages(prev=>prev.map(m=>m.id===d.message_id?{...m,read_by_other:true}:m))
      }
    }
    connect()
    return ()=>{alive=false;clearTimeout(reconnectTimer);socket?.close();setConnected(false)}
  },[token,me?.id])
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'auto'})},[messages.length])
  useEffect(()=>{localStorage.setItem('chat_theme',theme)},[theme])
  const login=async(e:React.FormEvent)=>{
    e.preventDefault();setError('')
    try {
      const res=await fetch(`${API}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,passcode:pass})})
      const data=await res.json()
      if(!res.ok) throw new Error(data.detail||'Login failed')
      localStorage.setItem('chat_token',data.token);setToken(data.token);setPass('')
    }catch(e:any){setError(e.message)}
  }
  const logout=()=>{localStorage.removeItem('chat_token');setToken('');setMe(null);setMessages([]);wsRef.current?.close()}
  const send=async()=>{
    const body=draft.trim(); if(!body||!token)return
    if(editing){
      const id=editing.id; setDraft('');setEditing(null)
      try {const updated=await request(`/api/messages/${id}`,token,{method:'PATCH',body:JSON.stringify({body})});setMessages(p=>p.map(m=>m.id===id?updated:m))}
      catch(e:any){setError(e.message);setDraft(body)}
      return
    }
    setDraft('')
    try {const sent=await request('/api/messages',token,{method:'POST',body:JSON.stringify({body,reply_to_id:reply?.id??null})});setReply(null);setMessages(p=>p.some(m=>m.id===sent.id)?p:[...p,sent])}
    catch(e:any){setError(e.message);setDraft(body)}
  }
  const startTyping=(value:string)=>{
    setDraft(value)
    if(!wsRef.current||wsRef.current.readyState!==WebSocket.OPEN)return
    if(!typing){setTyping(true);wsRef.current.send(JSON.stringify({type:'typing',active:true}))}
    window.clearTimeout(typingTimer.current)
    typingTimer.current=window.setTimeout(()=>{setTyping(false);wsRef.current?.send(JSON.stringify({type:'typing',active:false}))},1200)
  }
  const doDelete=async()=>{
    if(!confirmDelete||!token)return
    try {const result=await request(`/api/messages/${confirmDelete.id}`,token,{method:'DELETE'});setMessages(p=>p.map(m=>m.id===result.id?result:m))}
    catch(e:any){setError(e.message)}
    setConfirmDelete(null)
  }
  const markRead=(m:Msg)=>{if(m.sender_id!==me?.id&&!m.read_by_other)request(`/api/messages/${m.id}/read`,token,{method:'POST'}).catch(()=>{})}
  const insertEmoji=(emoji:string)=>{setDraft(d=>d+emoji);setShowEmoji(false)}
  if(!token||!me) return <main className={`app theme-${theme} login-page`}>
    <div className="login-glow glow-a"/><div className="login-glow glow-b"/>
    <section className="login-card">
      <div className="brand-mark"><Heart size={22}/></div>
      <div className="eyebrow">A PRIVATE LITTLE SPACE</div>
      <h1>Mani <span>×</span> Li Yilin</h1>
      <p className="muted">Two people. One conversation. Just us two.</p>
      <form onSubmit={login}>
        <label>Your dashboard</label>
        <div className="account-select">
          <button type="button" className={name==='mani'?'selected':''} onClick={()=>setName('mani')}><span className="avatar mani">M</span><span>Mani</span></button>
          <button type="button" className={name==='li-yilin'?'selected':''} onClick={()=>setName('li-yilin')}><span className="avatar lily">L</span><span>Li Yilin</span></button>
        </div>
        <label htmlFor="passcode">Passcode</label>
        <input id="passcode" type="password" inputMode="numeric" autoComplete="current-password" placeholder="Enter your passcode" value={pass} onChange={e=>setPass(e.target.value)} required/>
        {error&&<div className="error">{error}</div>}
        <button className="primary login-submit" type="submit">Enter private chat <span>→</span></button>
      </form>
      <div className="login-foot"><span className="lock-dot"/> Only Mani &amp; Li Yilin have accounts</div>
    </section>
  </main>
  const status=peerPresence?.online?'Online':fmtLast(peerPresence?.last_seen||null)
  return <main className={`app theme-${theme}`}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark small"><Heart size={17}/></div><div><strong>Mani <span>×</span> Li Yilin</strong><small>JUST US TWO</small></div></div>
      <div className="top-actions">
        <span className={`connection ${connected?'up':'down'}`}>{connected?<Wifi size={14}/>:<WifiOff size={14}/>} {connected?'Connected':'Reconnecting'}</span>
        <button className="icon-btn" title="Change theme" onClick={()=>setTheme(THEMES[(THEMES.indexOf(theme)+1)%THEMES.length])}><Sparkles size={17}/></button>
        <button className="icon-btn" title="Log out" onClick={logout}><LogOut size={17}/></button>
      </div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-head"><div className="eyebrow">YOUR PRIVATE SPACE</div><h2>Messages</h2></div>
        <div className="person-card active">
          <div className="avatar peer">{peerName[0]}<i className={peerPresence?.online?'online':''}/></div>
          <div className="person-meta"><strong>{peerName}</strong><span className={peerPresence?.online?'status-online':''}>{status}</span></div>
          <Heart size={16} className="person-heart"/>
        </div>
        <div className="sidebar-note"><MessageCircle size={16}/><span>One conversation, just between you two.</span></div>
        <div className="sidebar-bottom"><span className="tiny-lock"/> Private two-member chat</div>
      </aside>
      <section className="chat-panel">
        <header className="chat-header">
          <div className="avatar peer large">{peerName[0]}<i className={peerPresence?.online?'online':''}/></div>
          <div className="chat-person"><strong>{peerName}</strong><span className={peerPresence?.online?'status-online':''}>{peerPresence?.online?'● Online':status}</span></div>
          <button className="icon-btn mobile-info" onClick={()=>setMobileInfo(!mobileInfo)}><MessageCircle size={17}/></button>
          <div className="chat-header-right"><span className="encrypted"><span/> PRIVATE CHAT</span></div>
        </header>
        {mobileInfo&&<div className="mobile-status">{peerName} · {status}</div>}
        <div className="chat-wall">
          <div className="date-chip">YOUR PRIVATE CONVERSATION</div>
          {loading&&<div className="empty-state">Loading your messages…</div>}
          {!loading&&messages.length===0&&<div className="empty-state"><div className="empty-icon"><Heart/></div><strong>Your conversation starts here</strong><span>Send a little hello to begin.</span></div>}
          {messages.map(m=>{
            const own=m.sender_id===me.id, parent=m.reply_to_id?msgMap.get(m.reply_to_id):null
            return <div key={m.id} className={`message-row ${own?'own':''}`} onMouseLeave={()=>setMenu(null)}>
              <div className={`bubble ${own?'sent':'received'} ${m.deleted_for_everyone?'deleted':''}`}>
                {m.reply_to_id&&<div className="quoted"><small>{parent?(parent.sender_id===me.id?'You':peerName):'Reply'}</small><span>{parent?.deleted_for_everyone?'Message deleted':parent?.body||'Original message'}</span></div>}
                {m.deleted_for_everyone?<em>This message was deleted</em>:<div className="message-text">{m.body}</div>}
                <div className="message-meta"><span>{fmtTime(m.created_at)}</span>{m.edited_at&&!m.deleted_for_everyone&&<span>Edited</span>}{own&&<span>{m.read_by_other?<CheckCheck size={14}/>:<Check size={14}/>}</span>}</div>
                {!m.deleted_for_everyone&&<div className="message-actions">
                  <button title="Reply" onClick={()=>{setReply(m);setEditing(null);document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus()}}><Reply size={14}/></button>
                  <button title="More actions" onClick={()=>setMenu(menu===m.id?null:m.id)}>•••</button>
                  {menu===m.id&&<div className="action-menu">
                    <button onClick={()=>{setReply(m);setMenu(null)}}><Reply size={14}/> Reply</button>
                    {own&&<button onClick={()=>{setEditing(m);setDraft(m.body);setReply(null);setMenu(null)}}><Pencil size={14}/> Edit</button>}
                    {own&&<button className="danger" onClick={()=>{setConfirmDelete(m);setMenu(null)}}><Trash2 size={14}/> Delete for everyone</button>}
                  </div>}
                </div>}
              </div>
            </div>
          })}
          {peerTyping&&<div className="typing"><span/><span/><span/> {peerName} is typing</div>}
          <div ref={bottomRef}/>
        </div>
        <footer className="composer-wrap">
          {(reply||editing)&&<div className="replying"><div><strong>{editing?'Editing message':`Replying to ${reply?.sender_id===me.id?'yourself':peerName}`}</strong><span>{editing?editing.body:reply?.body}</span></div><button onClick={()=>{setReply(null);setEditing(null);setDraft('')}}><X size={16}/></button></div>}
          <div className="composer">
            <div className="emoji-wrap"><button className="icon-btn" onClick={()=>setShowEmoji(!showEmoji)} title="Emoji"><Smile size={20}/></button>
              {showEmoji&&<div className="emoji-pop">{['❤️','🥰','😘','😂','😊','😍','✨','💕','🌙','🫶','🌸','💜'].map(x=><button key={x} onClick={()=>insertEmoji(x)}>{x}</button>)}</div>}
            </div>
            <textarea value={draft} onChange={e=>startTyping(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder={editing?'Edit your message…':'Write a message…'} rows={1}/>
            <button className="send-btn" onClick={send} disabled={!draft.trim()} title={editing?'Save edit':'Send message'}><Send size={17}/></button>
          </div>
          <div className="composer-hint">Enter to send · Shift + Enter for a new line</div>
        </footer>
      </section>
    </div>
    {confirmDelete&&<div className="modal-backdrop"><div className="confirm-card"><div className="confirm-icon"><Trash2/></div><h3>Delete for everyone?</h3><p>This message will be removed from both Mani's and Li Yilin's chat.</p><div className="confirm-actions"><button className="secondary" onClick={()=>setConfirmDelete(null)}>Cancel</button><button className="danger-btn" onClick={doDelete}>Delete message</button></div></div></div>}
  </main>
}
