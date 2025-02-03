import React, { useEffect, useState, useRef } from 'react'
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore'
import { Link } from 'react-router-dom'

// The helper function is no longer needed here if you always store the hex value.
// You can remove it or keep it for fallback if needed.
function colorNameToHex (color) {
  const colors = {
    beige: '#f5f5dc',
    black: '#000000',
    blue: '#0000ff',
    brown: '#a52a2a',
    chocolate: '#d2691e',
    coral: '#ff7f50',
    crimson: '#dc143c',
    cyan: '#00ffff',
    darkviolet: '#9400d3',
    gold: '#ffd700',
    gray: '#808080',
    green: '#008000',
    grey: '#808080',
    khaki: '#f0e68c',
    lime: '#00ff00',
    magenta: '#ff00ff',
    maroon: '#800000',
    navy: '#000080',
    olive: '#808000',
    orange: '#ffa500',
    pink: '#ffc0cb',
    purple: '#800080',
    red: '#ff0000',
    royalblue: '#4169e1',
    turquoise: '#40e0d0',
    violet: '#ee82ee',
    white: '#ffffff',
    yellow: '#ffff00'
  }
  if (typeof color === 'string') {
    const hex = colors[color.toLowerCase()]
    return hex || color // fallback to the original value if not found
  }
  return color.hex || 'red'
}

function AdminDashboard ({ db }) {
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [map, setMap] = useState(null)
  const [isTabActive, setIsTabActive] = useState(true)

  // Refs to store AdvancedMarkerElement markers and polyline trails by user ID.
  const markersByUser = useRef({})
  const trailsByUser = useRef({})

  // Listen for visibility change to pause/resume fetching user locations.
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabActive(!document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Fetch user locations (from main user documents) every 60 seconds.
  useEffect(() => {
    const fetchUserLocations = async () => {
      if (!isTabActive) return
      const usersRef = collection(db, 'users')
      const usersSnap = await getDocs(usersRef)
      const userList = usersSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.location)
      setUsers(userList)
    }

    fetchUserLocations()
    const interval = setInterval(fetchUserLocations, 60000)
    return () => clearInterval(interval)
  }, [db, isTabActive])

  // Use Firestore's onSnapshot for real‑time teams updates.
  useEffect(() => {
    const teamsRef = collection(db, 'teams')
    const unsubscribe = onSnapshot(teamsRef, snapshot => {
      const teamList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        solvedQuests: doc.data().progress?.previousQuests?.length || 0
      }))
      teamList.sort((a, b) => b.solvedQuests - a.solvedQuests)
      setTeams(teamList)
    })
    return () => unsubscribe()
  }, [db])

  // Initialize the map.
  useEffect(() => {
    window.initMap = () => {
      if (!document.getElementById('map')) return
      const newMap = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 46.9481, lng: 7.4474 },
        zoom: 14,
        mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID
      })
      setMap(newMap)
    }

    if (!window.google || !window.google.maps) {
      const scriptId = 'google-maps-script'
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script')
        script.id = scriptId
        script.src = `https://maps.googleapis.com/maps/api/js?key=${
          import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        }&callback=initMap&libraries=places,marker&loading=async`
        script.async = true
        script.defer = true
        document.body.appendChild(script)
      }
    } else {
      window.initMap()
    }
  }, [])

  // ---------- Markers for Current Locations ----------
  // Dependency includes teams so we can lookup team color.
  useEffect(() => {
    if (!map) return

    users.forEach(user => {
      const pos = new google.maps.LatLng(user.location.lat, user.location.lng)

      // Determine the marker color based on the user's team.
      let markerColor = 'red' // default fallback
      if (user.teamId && teams.length > 0) {
        const userTeam = teams.find(team => team.id === user.teamId)
        if (userTeam && userTeam.color && userTeam.color.hex) {
          markerColor = userTeam.color.hex
        }
      }

      // Calculate time difference in seconds based on lastUpdated timestamp.
      const lastUpdated = user.lastUpdated
        ? new Date(user.lastUpdated.seconds * 1000)
        : null
      const timeDiffSec = lastUpdated
        ? Math.round((Date.now() - lastUpdated.getTime()) / 1000)
        : null
      const infoText =
        timeDiffSec !== null
          ? `Last updated: ${timeDiffSec} sec ago`
          : 'Unknown time'

      // ----- AdvancedMarkerElement for Current Location -----
      if (markersByUser.current[user.id]) {
        // Update the marker's position and icon.
        markersByUser.current[user.id].position = pos
        markersByUser.current[user.id].content.style.backgroundColor =
          markerColor
        markersByUser.current[user.id].lastUpdated = lastUpdated
      } else {
        // Create a custom HTML element to use as marker content.
        const markerDiv = document.createElement('div')
        markerDiv.style.width = '16px'
        markerDiv.style.height = '16px'
        markerDiv.style.borderRadius = '50%'
        markerDiv.style.backgroundColor = markerColor
        markerDiv.style.border = '1px solid black'

        // Create the AdvancedMarkerElement.
        const advMarker = new google.maps.marker.AdvancedMarkerElement({
          position: pos,
          map: map,
          title: user.name || user.email,
          content: markerDiv
        })

        // Create an info window for this marker.
        const infoWindow = new google.maps.InfoWindow({
          content: `<div class='text-black font-bold'>${
            user.name || user.email
          }</div><div class='text-gray-700'>${infoText}</div>`
        })

        advMarker.addListener('click', () => {
          infoWindow.open({ anchor: advMarker, map })
        })

        // Store extra data on the marker for later updates.
        advMarker.infoWindow = infoWindow
        advMarker.lastUpdated = lastUpdated
        advMarker.title = user.name || user.email

        markersByUser.current[user.id] = advMarker
      }
    })

    // Update open info windows every second so the "last updated" text is current.
    const interval = setInterval(() => {
      Object.values(markersByUser.current).forEach(marker => {
        if (marker.infoWindow && marker.infoWindow.getMap()) {
          const now = Date.now()
          const lastUpdated = marker.lastUpdated
          if (lastUpdated) {
            const timeDiffSec = Math.round((now - lastUpdated.getTime()) / 1000)
            const newInfoText = `Last updated: ${timeDiffSec} sec ago`
            marker.infoWindow.setContent(
              `<div class='text-black font-bold'>${marker.title}</div>` +
                `<div class='text-gray-700'>${newInfoText}</div>`
            )
          }
        }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [map, users, teams])

  // ---------- Polyline Trails from Complete Firestore History ----------
  // For each user, fetch the full locationHistory subcollection and draw the complete trail.
  // Dependency includes teams so we can use the same color as the marker.
  useEffect(() => {
    if (!map || !db) return

    users.forEach(user => {
      const historyRef = collection(db, 'users', user.id, 'locationHistory')
      // Query the complete history ordered by timestamp ascending.
      const q = query(historyRef, orderBy('timestamp', 'asc'))
      getDocs(q)
        .then(snapshot => {
          const path = snapshot.docs.map(doc => {
            const data = doc.data()
            return new google.maps.LatLng(data.lat, data.lng)
          })
          if (path.length > 0) {
            // Determine the trail color from the user's team.
            let trailColor = 'red' // fallback
            if (user.teamId && teams.length > 0) {
              const userTeam = teams.find(team => team.id === user.teamId)
              if (userTeam && userTeam.color && userTeam.color.hex) {
                trailColor = userTeam.color.hex
              }
            }
            if (trailsByUser.current[user.id]) {
              trailsByUser.current[user.id].setPath(path)
              trailsByUser.current[user.id].setOptions({
                strokeColor: trailColor
              })
            } else {
              const polyline = new google.maps.Polyline({
                path: path,
                geodesic: true,
                strokeColor: trailColor, // Use the hex value directly.
                strokeOpacity: 1.0,
                strokeWeight: 2
              })
              polyline.setMap(map)
              trailsByUser.current[user.id] = polyline
            }
          }
        })
        .catch(error =>
          console.error(
            'Error fetching location history for user',
            user.id,
            error
          )
        )
    })
  }, [map, users, db, teams])

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
        <aside className='w-64 bg-white shadow-lg rounded-lg p-6 mr-8'>
          <h3 className='text-xl font-bold mb-4'>Admin Menu</h3>
          <nav className='flex flex-col space-y-4'>
            <Link
              to='/admin'
              className='p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white'
            >
              Admin Dashboard
            </Link>
            <Link
              to='/admin/users'
              className='p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white'
            >
              Manage Users
            </Link>
            <Link
              to='/admin/teams'
              className='p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white'
            >
              Manage Teams
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <div className='flex-1'>
          {/* Leaderboard */}
          <div className='bg-white shadow-lg rounded-lg p-6 mb-8'>
            <h2 className='text-2xl font-semibold text-gray-700 mb-4'>
              📊 Leaderboard
            </h2>
            <table className='w-full text-center border border-gray-300 rounded-lg overflow-hidden'>
              <thead className='bg-gray-300 text-gray-700'>
                <tr>
                  <th className='border border-gray-300 p-4 text-black'>
                    Team
                  </th>
                  <th className='border border-gray-300 p-4 text-black'>
                    Name
                  </th>
                  <th className='border border-gray-300 p-4 text-black'>
                    Current Quest
                  </th>
                  <th className='border border-gray-300 p-4 text-black'>
                    Solved Quests
                  </th>
                  <th className='border border-gray-300 p-4 text-black'>
                    Bank
                  </th>
                  <th className='border border-gray-300 p-4 text-black'>
                    Inventory
                  </th>
                  <th className='border border-gray-300 p-4 text-black'>
                    In Effect
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr
                    key={team.id}
                    className='odd:bg-white even:bg-gray-100 hover:bg-gray-200'
                  >
                    {/* Color swatch cell */}
                    <td className='border border-gray-300 p-4'>
                      <div
                        className='w-4 h-4 inline-block rounded'
                        style={{ backgroundColor: team.color.hex }}
                        title={team.color.name}
                      ></div>
                    </td>
                    <td className='border border-gray-300 p-4 text-black font-semibold'>
                      {team.name}
                    </td>
                    <td className='border border-gray-300 p-4 text-black'>
                      {team.progress?.currentQuest || 'Not started'}
                    </td>
                    <td className='border border-gray-300 p-4 text-black'>
                      {team.solvedQuests}
                    </td>
                    <td className='border border-gray-300 p-4 text-black'>
                      {team.currency || 'Broke'}
                    </td>
                    <td className='border border-gray-300 p-4 text-black'>
                      item so and so
                    </td>
                    <td className='border border-gray-300 p-4 text-black'>
                      item so and so
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanding Full‑Width Map */}
          <div className='mt-8'>
            <div
              id='map'
              className='h-[800px] w-full border border-gray-300 shadow-xl rounded-lg'
            ></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
