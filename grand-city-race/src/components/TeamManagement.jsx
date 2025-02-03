import React, { useEffect, useState } from 'react'
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  deleteDoc
} from 'firebase/firestore'
import { Link } from 'react-router-dom'

function TeamManagement ({ db }) {
  const [teams, setTeams] = useState([])
  const [newTeamName, setNewTeamName] = useState('')
  const [isCreateModalOpen, setCreateModalOpen] = useState(false)
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState(null)

  useEffect(() => {
    const teamsRef = collection(db, 'teams')
    // Subscribe to real-time updates for the teams collection.
    const unsubscribe = onSnapshot(teamsRef, snapshot => {
      const teamList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setTeams(teamList)
    })

    // Clean up the listener when the component unmounts.
    return () => unsubscribe()
  }, [db])

  const createTeam = async () => {
    if (!newTeamName.trim()) return
    const teamsRef = collection(db, 'teams')
    await addDoc(teamsRef, { name: newTeamName })
    setNewTeamName('')
    setCreateModalOpen(false)
    // No need to fetch teams manually—the onSnapshot listener will update the table.
  }

  const deleteTeam = async () => {
    if (!selectedTeam) return
    const teamDoc = doc(db, 'teams', selectedTeam)
    await deleteDoc(teamDoc)
    setDeleteModalOpen(false)
    setSelectedTeam(null)
    // The onSnapshot listener will automatically update the teams array.
  }

  return (
    <div className='min-h-screen h-screen min-w-screen w-screen bg-gray-100 py-20 px-4'>
      {/* Prevent Mobile Access */}
      <div className='sm:hidden flex justify-center items-center min-h-screen text-center'>
        <p className='text-2xl font-bold text-gray-600'>
          🚫 Admin Dashboard is only accessible on a larger screen.
        </p>
      </div>

      {/* Actual Dashboard (Only shown on bigger screens) */}
      <div className='hidden sm:flex w-full max-w-screen mx-auto'>
        {/* Sidebar */}
        <aside className='w-64 h-screen bg-white shadow-lg rounded-lg p-6 mr-8'>
          <h3 className='text-xl font-bold mb-4'>Admin Menu</h3>
          <nav className='flex flex-col space-y-4'>
            <Link
              to='/admin'
              className='p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white'
            >
              Admin Dashboard
            </Link>
            <Link
              to='/admin/manage-users'
              className='p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white'
            >
              Manage Users
            </Link>
            <Link
              to='/admin/manage-teams'
              className='p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white'
            >
              Manage Teams
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <div className='flex-1'>
          {/* Team Management */}
          <div className='bg-white shadow-lg rounded-lg p-6 mb-8'>
            <h2 className='text-2xl font-semibold text-gray-700 mb-4'>
              📂 Team Management
            </h2>
            <table className='w-full text-center border border-gray-300 rounded-lg overflow-hidden'>
              <thead className='bg-gray-300 text-gray-700'>
                <tr>
                  <th className='border border-gray-300 p-4 text-black'>
                    Name
                  </th>
                  <th className='border border-gray-300 p-4 text-black'>ID</th>
                  <th className='border border-gray-300 p-4 text-black'></th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr
                    key={team.id}
                    className='odd:bg-white even:bg-gray-100 hover:bg-gray-200'
                  >
                    <td className='border border-gray-300 p-4 text-black font-semibold'>
                      {team.name}
                    </td>
                    <td className='border border-gray-300 p-4 text-black font-semibold'>
                      {team.id}
                    </td>
                    <td className='border border-gray-300 p-4 text-black font-semibold'>
                      <button
                        onClick={() => {
                          setSelectedTeam(team.id)
                          setDeleteModalOpen(true)
                        }}
                        className='text-red-600 hover:text-red-800'
                      >
                        ❌ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className='bg-blue-300 text-black px-4 py-2 rounded-lg hover:bg-blue-700 transition'
          >
            ➕ Create Team
          </button>
        </div>
      </div>

      {/* Create Team Modal */}
      {isCreateModalOpen && (
        <div className='fixed inset-0 flex items-center justify-center bg-black bg-opacity-50'>
          <div className='bg-white p-6 rounded-lg shadow-lg'>
            <h3 className='text-lg font-semibold mb-4'>Create New Team</h3>
            <input
              type='text'
              placeholder='Team Name'
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              className='w-full p-2 border rounded-md mb-4'
            />
            <div className='flex justify-end space-x-3'>
              <button
                onClick={() => setCreateModalOpen(false)}
                className='px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400'
              >
                Cancel
              </button>
              <button
                onClick={createTeam}
                className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Team Modal */}
      {isDeleteModalOpen && (
        <div className='fixed inset-0 flex items-center justify-center bg-black bg-opacity-50'>
          <div className='bg-white p-6 rounded-lg shadow-lg'>
            <h3 className='text-lg font-semibold mb-4'>Delete Team</h3>
            <p>Are you sure you want to delete this team?</p>
            <div className='flex justify-end space-x-3 mt-4'>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className='px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400'
              >
                Cancel
              </button>
              <button
                onClick={deleteTeam}
                className='px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700'
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamManagement
