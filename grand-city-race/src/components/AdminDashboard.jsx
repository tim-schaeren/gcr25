import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useNavigate, Route, Routes, Link } from "react-router-dom";
import GroupManagement from "./GroupManagement";
//import UserManagement from "./UserManagement";

function AdminDashboard({ db }) {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserLocations = async () => {
      const usersRef = collection(db, "users");
      const usersSnap = await getDocs(usersRef);
      const userList = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })).filter(user => user.location);

      setUsers(userList);
    };

    const fetchTeams = async () => {
      const teamsRef = collection(db, "teams");
      const teamsSnap = await getDocs(teamsRef);
      const teamList = teamsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        solvedQuests: doc.data().progress?.previousQuests?.length || 0
      }));

      teamList.sort((a, b) => b.solvedQuests - a.solvedQuests);
      setTeams(teamList);
    };

    fetchUserLocations();
    fetchTeams();
  }, [db]);

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-gray-900 text-white flex flex-col p-6 shadow-lg">
        <h2 className="text-2xl font-bold mb-6">🏆 Admin Dashboard</h2>
        <nav className="flex flex-col gap-4">
          <Link to="/admin" className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700">📊 Dashboard</Link>
          <Link to="/admin/groups" className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700">👥 Manage Groups</Link>
          <Link to="/admin/users" className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700">👤 Manage Users</Link>
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8">
        <Routes>
          {/* Default Dashboard View */}
          <Route path="/" element={
            <div>
              <h2 className="text-2xl font-semibold mb-6">📊 Leaderboard</h2>
              <table className="w-full text-center border border-gray-300 shadow-lg bg-white rounded-lg">
                <thead className="bg-gray-300">
                  <tr>
                    <th className="border border-gray-500 p-3">Team</th>
                    <th className="border border-gray-500 p-3">Current Quest</th>
                    <th className="border border-gray-500 p-3">Solved Quests</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map(team => (
                    <tr key={team.id} className="hover:bg-gray-100">
                      <td className="border border-gray-500 p-3">{team.name}</td>
                      <td className="border border-gray-500 p-3">{team.progress?.currentQuest || "Not started"}</td>
                      <td className="border border-gray-500 p-3">{team.solvedQuests}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2 className="text-2xl font-semibold mt-8 mb-4">📍 User Locations</h2>
              <div id="map" className="h-[500px] w-full border border-gray-300 shadow-xl bg-white rounded-lg"></div>
            </div>
          } />

          {/* Group Management Page */}
          <Route path="/groups" element={<GroupManagement db={db} />} />

          {/* User Management Page */}
          {/*<Route path="/users" element={<UserManagement db={db} />} />*/}
        </Routes>
      </div>
    </div>
  );
}

export default AdminDashboard;
