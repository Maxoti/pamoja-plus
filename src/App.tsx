import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './Pages/Landing'
import Register from './Pages/Register'
import Login from './Pages/Login'
import Dashboard from './Pages/Dashboard'
import Contributions from './Pages/Contributions'
import Members from './Pages/Members'
import Pledges from './Pages/Pledges'
import Meetings from './Pages/Meetings'
import Announcements from './Pages/Announcement'
import AuditLog from './Pages/Auditlog'
import JoinPage from './Pages/JoinPage'
import Cycles from './Pages/Cycles'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
         <Route path="/contributions" element={<Contributions />} />  
  <Route path="/members" element={<Members />} />              
  <Route path="/pledges" element={<Pledges />} />              
  <Route path="/meetings" element={<Meetings />} />            
  <Route path="/announcements" element={<Announcements />} />  
  <Route path="/audit-log" element={<AuditLog />} /> 
  <Route path="/join" element={<JoinPage />} /> 
  <Route path="/cycles" element={<Cycles />} /> 
      </Routes>
    </BrowserRouter>
  )
}

export default App