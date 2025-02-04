import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore'

function Login ({ auth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const db = getFirestore()

  const handleLogin = async e => {
    e.preventDefault()
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      )
      const user = userCredential.user

      // Check if user exists in Firestore, if not, create them
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)

      if (!userSnap.exists()) {
        await setDoc(userRef, { email: user.email })
      }

      navigate('/dashboard')
    } catch (err) {
      setError('Invalid email or password. Please try again.')
    }
  }

  return (
    <div className='flex justify-center items-center min-h-screen w-screen bg-gray-900 px-6 sm:px-0'>
      <div className='bg-gray-800 shadow-xl rounded-xl p-8 w-full max-w-md'>
        {/* Title */}
        <h2 className='text-3xl font-semibold text-center text-white mb-6'>
          🏁 <span className='text-white'>Login to Grand City Race</span>
        </h2>

        {/* Login Form */}
        <form onSubmit={handleLogin} className='space-y-5'>
          {/* Email Input */}
          <div>
            <label className='block text-gray-300 font-medium mb-2'>
              Email
            </label>
            <input
              type='email'
              placeholder='Enter your email'
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className='w-full px-4 py-3 bg-gray-700 text-white border border-gray-600 rounded-lg shadow-sm focus:ring focus:ring-gray-500'
            />
          </div>

          {/* Password Input */}
          <div>
            <label className='block text-gray-300 font-medium mb-2'>
              Password
            </label>
            <input
              type='password'
              placeholder='Enter your password'
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className='w-full px-4 py-3 bg-gray-700 text-white border border-gray-600 rounded-lg shadow-sm focus:ring focus:ring-gray-500'
            />
          </div>

          {/* Login Button */}
          <button
            type='submit'
            className='w-full bg-gray-700 text-white font-bold py-3 rounded-lg shadow-md hover:bg-gray-600 transition duration-300'
          >
            Login
          </button>
        </form>

        {/* Error Message */}
        {error && <p className='text-red-500 text-center mt-4'>{error}</p>}
      </div>
    </div>
  )
}

export default Login
