import { useEffect, useState } from "react";
import { api } from "./api";
import type { User, Dataset, Project } from "./api";
import {
  LayoutDashboard, Database, FolderKanban, LogOut, Upload,
  Search, BarChart3, Users, CloudSun, Plus, Trash2
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip
} from "recharts";

type Page = "dashboard" | "datasets" | "projects";

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const x = localStorage.getItem("climate_user");
    return x ? JSON.parse(x) : null;
  });
  const [page, setPage] = useState<Page>("dashboard");

  if (!user) return <Auth onLogin={(u) => setUser(u)} />;

  const logout = () => {
    localStorage.removeItem("climate_token");
    localStorage.removeItem("climate_user");
    setUser(null);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><CloudSun size={28}/> ClimateHub</div>
        <div className="nav">
          <button className={page==="dashboard"?"active":""} onClick={()=>setPage("dashboard")}><LayoutDashboard/> Dashboard</button>
          <button className={page==="datasets"?"active":""} onClick={()=>setPage("datasets")}><Database/> Datasets</button>
          <button className={page==="projects"?"active":""} onClick={()=>setPage("projects")}><FolderKanban/> Research Projects</button>
        </div>
        <button className="logout" onClick={logout}><LogOut/> Logout</button>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{page === "dashboard" ? "Climate Research Dashboard" : page === "datasets" ? "Climate Datasets" : "Research Projects"}</h1>
            <p>Centralized environmental data and research collaboration</p>
          </div>
          <div className="user-chip"><Users size={18}/>{user.name}</div>
        </header>
        {page === "dashboard" && <Dashboard/>}
        {page === "datasets" && <Datasets/>}
        {page === "projects" && <Projects/>}
      </main>
    </div>
  );
}

function Auth({ onLogin }: {onLogin:(u:User)=>void}) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({name:"",email:"",password:"",role:"RESEARCHER"});
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const r = await api.post(register ? "/auth/register" : "/auth/login", form);
      localStorage.setItem("climate_token", r.data.token);
      localStorage.setItem("climate_user", JSON.stringify(r.data.user));
      onLogin(r.data.user);
    } catch (err:any) {
      setError(err.response?.data?.message || "Something went wrong");
    }
  };

  return <div className="auth-page">
    <div className="auth-card">
      <div className="brand large"><CloudSun size={38}/> ClimateHub</div>
      <h2>{register ? "Create researcher account" : "Welcome back"}</h2>
      <p className="muted">{register ? "Join the climate research platform" : "Sign in to access your research workspace"}</p>
      <form onSubmit={submit}>
        {register && <input placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>}
        <input type="email" placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/>
        <input type="password" placeholder="Password (min 6 characters)" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/>
        {register && <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option>RESEARCHER</option><option>STUDENT</option></select>}
        {error && <div className="error">{error}</div>}
        <button className="primary full">{register ? "Create Account" : "Login"}</button>
      </form>
      <button className="link-btn" onClick={()=>setRegister(!register)}>
        {register ? "Already have an account? Login" : "New researcher? Create an account"}
      </button>
    </div>
  </div>
}

function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  useEffect(()=>{ api.get("/dashboard/stats").then(r=>setStats(r.data)); },[]);

  return <section>
    <div className="hero">
      <div><span className="eyebrow">ENVIRONMENTAL RESEARCH</span><h2>One place for climate data, analysis and collaboration.</h2><p>Upload datasets, discover research projects and turn environmental data into insights.</p></div>
      <CloudSun size={90}/>
    </div>
    <div className="cards">
      <Stat icon={<Database/>} label="Datasets" value={stats?.datasets ?? "—"}/>
      <Stat icon={<FolderKanban/>} label="Research Projects" value={stats?.projects ?? "—"}/>
      <Stat icon={<Users/>} label="Researchers" value={stats?.researchers ?? "—"}/>
      <Stat icon={<BarChart3/>} label="Research Outputs" value={stats?.researchOutputs ?? "—"}/>
    </div>
    <div className="panel">
      <h3>Platform capabilities</h3>
      <div className="capabilities">
        <div><Database/><b>Centralized storage</b><span>Manage climate datasets in one secure platform.</span></div>
        <div><BarChart3/><b>Interactive analytics</b><span>Explore temperature, rainfall and environmental trends.</span></div>
        <div><Users/><b>Research collaboration</b><span>Create projects and share work with research members.</span></div>
      </div>
    </div>
  </section>
}

function Stat({icon,label,value}:{icon:any,label:string,value:any}) {
  return <div className="stat"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>
}

function Datasets() {
  const [datasets,setDatasets] = useState<Dataset[]>([]);
  const [search,setSearch] = useState("");
  const [showUpload,setShowUpload] = useState(false);
  const [selected,setSelected] = useState<Dataset|null>(null);

  const load = () => api.get("/datasets",{params:{search}}).then(r=>setDatasets(r.data.datasets));
  useEffect(()=>{load()},[]);

  const remove = async (id:number) => {
    if (!confirm("Delete this dataset?")) return;
    await api.delete(`/datasets/${id}`); load();
  };

  return <section>
    <div className="toolbar">
      <div className="search"><Search size={18}/><input placeholder="Search datasets..." value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()}/></div>
      <button className="primary" onClick={()=>setShowUpload(true)}><Upload/> Upload Dataset</button>
    </div>
    {showUpload && <UploadForm onDone={()=>{setShowUpload(false);load()}} onCancel={()=>setShowUpload(false)}/>}
    <div className="panel">
      <h3>Available datasets</h3>
      {datasets.length===0 ? <div className="empty">No datasets found. Upload your first climate dataset.</div> :
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Uploaded by</th><th>Date</th><th></th></tr></thead>
      <tbody>{datasets.map(d=><tr key={d.id}><td><button className="table-link" onClick={()=>setSelected(d)}>{d.name}</button><small>{d.description}</small></td><td><span className="tag">{d.file_type.toUpperCase()}</span></td><td>{d.uploaded_by}</td><td>{new Date(d.created_at).toLocaleDateString()}</td><td><button className="icon-btn" onClick={()=>remove(d.id)}><Trash2 size={17}/></button></td></tr>)}</tbody></table></div>}
    </div>
    {selected && <DatasetAnalytics dataset={selected} onClose={()=>setSelected(null)}/>}
  </section>
}

function UploadForm({onDone,onCancel}:{onDone:()=>void,onCancel:()=>void}) {
  const [name,setName]=useState(""); const [description,setDescription]=useState(""); const [file,setFile]=useState<File|null>(null); const [error,setError]=useState("");
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault(); setError("");
    if(!file){setError("Select a CSV, JSON or TXT file.");return}
    const data=new FormData(); data.append("name",name);data.append("description",description);data.append("file",file);
    try { await api.post("/datasets",data,{headers:{"Content-Type":"multipart/form-data"}}); onDone(); } catch(err:any){setError(err.response?.data?.message||"Upload failed")}
  };
  return <div className="panel upload-box"><h3>Upload climate dataset</h3><form onSubmit={submit}>
    <input placeholder="Dataset name" value={name} onChange={e=>setName(e.target.value)} required/>
    <textarea placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)}/>
    <input type="file" accept=".csv,.json,.txt" onChange={e=>setFile(e.target.files?.[0]||null)} required/>
    {error&&<div className="error">{error}</div>}
    <div className="actions"><button type="button" onClick={onCancel}>Cancel</button><button className="primary">Upload</button></div>
  </form></div>
}

function DatasetAnalytics({dataset,onClose}:{dataset:Dataset,onClose:()=>void}) {
  const [data,setData]=useState<any>(null);
  useEffect(()=>{api.get(`/datasets/${dataset.id}/analytics`).then(r=>setData(r.data))},[dataset.id]);
  const first = data?.numericColumns?.[0];
  const chartData = first && data?.rows ? data.rows.map((r:any,i:number)=>({index:i+1,value:Number(r[first])})).filter((x:any)=>Number.isFinite(x.value)).slice(0,30) : [];
  return <div className="modal-bg"><div className="modal large-modal"><button className="close" onClick={onClose}>×</button><span className="eyebrow">DATASET ANALYSIS</span><h2>{dataset.name}</h2><p>{data?.rowCount ?? "Loading"} rows · {data?.headers?.length ?? 0} columns</p>
    {first && chartData.length>1 && <div className="chart"><h3>{first} trend preview</h3><ResponsiveContainer width="100%" height={280}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="index"/><YAxis/><Tooltip/><Line type="monotone" dataKey="value" strokeWidth={2}/></LineChart></ResponsiveContainer></div>}
    {data?.statistics?.length>0 && <div className="stats-grid">{data.statistics.map((s:any)=><div className="mini-stat" key={s.column}><b>{s.column}</b><span>Average {s.average}</span><span>Min {s.minimum} · Max {s.maximum}</span></div>)}</div>}
  </div></div>
}

function Projects() {
  const [projects,setProjects]=useState<Project[]>([]);
  const [open,setOpen]=useState(false);
  const load=()=>api.get("/projects").then(r=>setProjects(r.data.projects));
  useEffect(()=>{load()},[]);
  return <section>
    <div className="toolbar"><div><h2 className="section-title">Research workspace</h2><p className="muted">Organize datasets, members and research outputs.</p></div><button className="primary" onClick={()=>setOpen(true)}><Plus/> New Project</button></div>
    {open&&<ProjectForm onDone={()=>{setOpen(false);load()}} onCancel={()=>setOpen(false)}/>}
    <div className="project-grid">{projects.map(p=><div className="project-card" key={p.id}><div className="project-icon"><FolderKanban/></div><h3>{p.name}</h3><p>{p.description||"No description provided."}</p><div className="project-meta"><span><Users size={16}/> {p.member_count} members</span><span>{new Date(p.created_at).toLocaleDateString()}</span></div></div>)}</div>
    {!projects.length&&!open&&<div className="panel empty">No research projects yet. Create your first project.</div>}
  </section>
}

function ProjectForm({onDone,onCancel}:{onDone:()=>void,onCancel:()=>void}) {
  const [name,setName]=useState("");const [description,setDescription]=useState("");
  const submit=async(e:React.FormEvent)=>{e.preventDefault();await api.post("/projects",{name,description});onDone()};
  return <div className="panel form-panel"><h3>Create research project</h3><form onSubmit={submit}><input placeholder="Project name" value={name} onChange={e=>setName(e.target.value)} required/><textarea placeholder="Project description" value={description} onChange={e=>setDescription(e.target.value)}/><div className="actions"><button type="button" onClick={onCancel}>Cancel</button><button className="primary">Create Project</button></div></form></div>
}

export default App;
