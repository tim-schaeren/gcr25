import React, { useEffect, useState, useRef } from 'react'
import { collection, getDocs, onSnapshot } from 'firebase/firestore'
import { Link } from 'react-router-dom'

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

  // Fetch user locations every 60 seconds.
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

  // Create/update AdvancedMarkerElement markers and polyline trails on the map for each user.
  useEffect(() => {
    if (!map) return

    users.forEach(user => {
      const pos = new google.maps.LatLng(user.location.lat, user.location.lng)

      // Calculate time difference in seconds based on lastUpdated timestamp.
      const lastUpdated = user.lastUpdated
        ? new Date(user.lastUpdated.seconds * 1000)
        : null
      const timeDiffSec = lastUpdated
        ? Math.round((Date.now() - lastUpdated.getTime()) / 1000)
        : null

      // if the data is older than 5 minutes, marker is grey; otherwise red.
      const markerColor =
        timeDiffSec !== null && timeDiffSec > 600 ? 'grey' : 'red'
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
        // Update stored lastUpdated value.
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

        // Store additional data on the marker so we can update its info window later.
        advMarker.infoWindow = infoWindow
        advMarker.lastUpdated = lastUpdated
        advMarker.title = user.name || user.email

        markersByUser.current[user.id] = advMarker
      }

      // ----- Polyline Trail for Path History -----
      if (trailsByUser.current[user.id]) {
        // Append the new position to the existing trail, avoiding duplicate points.
        const path = trailsByUser.current[user.id].getPath()
        if (
          path.getLength() === 0 ||
          path.getAt(path.getLength() - 1).toUrlValue() !== pos.toUrlValue()
        ) {
          path.push(pos)
        }
      } else {
        // Create a new polyline for the user's trail.
        const polyline = new google.maps.Polyline({
          path: [pos],
          geodesic: true,
          strokeColor: markerColor,
          strokeOpacity: 1.0,
          strokeWeight: 2
        })
        polyline.setMap(map)
        trailsByUser.current[user.id] = polyline
      }
    })
    // Optionally, you could remove markers/trails for users that are no longer active.
  }, [map, users])

  // New useEffect: Update open info windows every second with the current time difference.
  useEffect(() => {
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
  }, [])

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
              to='/admin/usermanagement'
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
