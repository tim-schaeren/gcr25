import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	collection,
	addDoc,
	serverTimestamp,
	query,
	where,
	getDocs,
} from 'firebase/firestore';

function EventSignup({ db }) {
	// Field state variables
	const [passphrase, setPassphrase] = useState('');
	const [name1, setName1] = useState('');
	const [email1, setEmail1] = useState('');
	const [numberOfMembers, setNumberOfMembers] = useState('2'); // Default team size is 2
	const [name2, setName2] = useState('');
	const [email2, setEmail2] = useState('');
	const [name3, setName3] = useState('');
	const [email3, setEmail3] = useState('');
	const [color1, setColor1] = useState('');
	const [color2, setColor2] = useState('');
	const [color3, setColor3] = useState('');
	const [animal1, setAnimal1] = useState('');
	const [animal2, setAnimal2] = useState('');
	const [animal3, setAnimal3] = useState('');

	const [error, setError] = useState('');
	const [currentStep, setCurrentStep] = useState(0);
	const navigate = useNavigate();
	const expectedPassphrase = import.meta.env.VITE_EVENT_PASSPHRASE;

	// Define steps with optional conditions.
	const stepList = [
		{ key: 'passphrase' },
		{ key: 'name1' },
		{ key: 'email1' },
		{ key: 'numberOfMembers' },
		{ key: 'name2' },
		{ key: 'email2' },
		{ key: 'name3', condition: () => numberOfMembers === '3' },
		{ key: 'email3', condition: () => numberOfMembers === '3' },
		{ key: 'colors' },
		{ key: 'animals' },
	];

	// Helper functions to skip over steps that have condition false.
	const getNextStepIndex = (currentIndex) => {
		let nextIndex = currentIndex + 1;
		while (
			nextIndex < stepList.length &&
			stepList[nextIndex].condition &&
			!stepList[nextIndex].condition()
		) {
			nextIndex++;
		}
		return nextIndex;
	};

	const getPrevStepIndex = (currentIndex) => {
		let prevIndex = currentIndex - 1;
		while (
			prevIndex >= 0 &&
			stepList[prevIndex].condition &&
			!stepList[prevIndex].condition()
		) {
			prevIndex--;
		}
		return prevIndex;
	};

	// Basic email validation function.
	const isValidEmail = (email) => {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	};

	// Prevent Enter key from submitting the form unless on the final step.
	const handleKeyDown = (e) => {
		if (e.key === 'Enter' && currentStep !== stepList.length - 1) {
			e.preventDefault();
		}
	};

	// Asynchronous handler for going to the next step.
	const handleNext = async () => {
		setError('');
		const currentKey = stepList[currentStep].key;

		// Immediate check for passphrase.
		if (currentKey === 'passphrase' && passphrase !== expectedPassphrase) {
			setError('Invalid passphrase - please try again.');
			return;
		}

		// Validate name fields.
		if (currentKey === 'name1' && name1.trim() === '') {
			setError('Please enter your name.');
			return;
		}
		if (currentKey === 'name2' && name2.trim() === '') {
			setError('Please enter teammate 1 name.');
			return;
		}
		if (currentKey === 'name3' && name3.trim() === '') {
			setError('Please enter teammate 2 name.');
			return;
		}

		// Validate email fields.
		if (currentKey === 'email1') {
			if (!email1 || !isValidEmail(email1)) {
				setError('Please enter a valid email address for your email.');
				return;
			}
			// Check duplicates for email1 across all email fields.
			const q1 = query(
				collection(db, 'eventSignups'),
				where('email1', '==', email1)
			);
			const q2 = query(
				collection(db, 'eventSignups'),
				where('email2', '==', email1)
			);
			const q3 = query(
				collection(db, 'eventSignups'),
				where('email3', '==', email1)
			);
			const [snap1, snap2, snap3] = await Promise.all([
				getDocs(q1),
				getDocs(q2),
				getDocs(q3),
			]);
			if (!snap1.empty || !snap2.empty || !snap3.empty) {
				setError(
					`The email address ${email1} is already registered. Please use a different email.`
				);
				return;
			}
		}

		if (currentKey === 'email2') {
			if (!email2 || !isValidEmail(email2)) {
				setError('Please enter a valid email address for teammate 1.');
				return;
			}
			const q1 = query(
				collection(db, 'eventSignups'),
				where('email1', '==', email2)
			);
			const q2 = query(
				collection(db, 'eventSignups'),
				where('email2', '==', email2)
			);
			const q3 = query(
				collection(db, 'eventSignups'),
				where('email3', '==', email2)
			);
			const [snap1, snap2, snap3] = await Promise.all([
				getDocs(q1),
				getDocs(q2),
				getDocs(q3),
			]);
			if (!snap1.empty || !snap2.empty || !snap3.empty) {
				setError(
					`The email address ${email2} is already registered. Please use a different email.`
				);
				return;
			}
		}

		if (currentKey === 'email3') {
			if (!email3 || !isValidEmail(email3)) {
				setError('Please enter a valid email address for teammate 2.');
				return;
			}
			const q1 = query(
				collection(db, 'eventSignups'),
				where('email1', '==', email3)
			);
			const q2 = query(
				collection(db, 'eventSignups'),
				where('email2', '==', email3)
			);
			const q3 = query(
				collection(db, 'eventSignups'),
				where('email3', '==', email3)
			);
			const [snap1, snap2, snap3] = await Promise.all([
				getDocs(q1),
				getDocs(q2),
				getDocs(q3),
			]);
			if (!snap1.empty || !snap2.empty || !snap3.empty) {
				setError(
					`The email address ${email3} is already registered. Please use a different email.`
				);
				return;
			}
		}

		const nextIndex = getNextStepIndex(currentStep);
		setCurrentStep(nextIndex);
	};

	const handleBack = () => {
		setError('');
		const prevIndex = getPrevStepIndex(currentStep);
		setCurrentStep(prevIndex);
	};

	// Submission handler.
	const handleSubmit = async (e) => {
		e.preventDefault();
		if (passphrase !== expectedPassphrase) {
			setError('Invalid passphrase - please try again.');
			return;
		}
		try {
			await addDoc(collection(db, 'eventSignups'), {
				passphrase,
				name1,
				email1,
				numberOfMembers,
				name2,
				email2,
				name3,
				email3,
				color1,
				color2,
				color3,
				animal1,
				animal2,
				animal3,
				submittedAt: serverTimestamp(),
			});
			navigate('/thank-you');
		} catch (err) {
			setError('Error submitting your registration. Please try again.');
			console.error(err);
		}
	};

	// Styling.
	const containerStyle = {
		maxWidth: '400px',
		margin: '50px auto',
		padding: '20px',
		borderRadius: '8px',
		boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
		backgroundColor: '#ffffff',
		fontFamily: 'Arial, sans-serif',
	};

	const labelStyle = {
		display: 'block',
		marginBottom: '8px',
		fontWeight: 'bold',
		fontSize: '1rem',
	};

	const inputStyle = {
		width: '100%',
		padding: '10px',
		marginBottom: '20px',
		borderRadius: '4px',
		border: '1px solid #ccc',
		fontSize: '1rem',
	};

	const buttonStyle = {
		padding: '10px 20px',
		border: 'none',
		borderRadius: '4px',
		backgroundColor: '#007BFF',
		color: '#fff',
		cursor: 'pointer',
		fontSize: '1rem',
		marginRight: '10px',
	};

	// Determine current step key.
	const currentStepKey = stepList[currentStep]?.key;

	return (
		<div style={containerStyle}>
			<h2 style={{ textAlign: 'center', marginBottom: '30px' }}>
				GCR25 - Signup
			</h2>
			{error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
			<form onSubmit={handleSubmit}>
				{/* Step 0: Passphrase */}
				{currentStepKey === 'passphrase' && (
					<div>
						<label style={labelStyle}>Passphrase:</label>
						<input
							type="password"
							value={passphrase}
							onChange={(e) => setPassphrase(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							required
						/>
					</div>
				)}

				{/* Step 1: Leader’s Name */}
				{currentStepKey === 'name1' && (
					<div>
						<label style={labelStyle}>Your Name:</label>
						<input
							type="text"
							value={name1}
							onChange={(e) => setName1(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							required
						/>
					</div>
				)}

				{/* Step 2: Leader’s Email */}
				{currentStepKey === 'email1' && (
					<div>
						<label style={labelStyle}>Your E-Mail Address:</label>
						<input
							type="email"
							value={email1}
							onChange={(e) => setEmail1(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							required
						/>
					</div>
				)}

				{/* Step 3: Team Size (using radio buttons) */}
				{currentStepKey === 'numberOfMembers' && (
					<div>
						<p style={labelStyle}>
							How many players, including you, are in your team?
						</p>
						<div style={{ marginBottom: '20px' }}>
							<label style={{ marginRight: '10px' }}>
								<input
									type="radio"
									name="teamSize"
									value="2"
									checked={numberOfMembers === '2'}
									onChange={(e) => setNumberOfMembers(e.target.value)}
									required
								/>{' '}
								2
							</label>
							<label>
								<input
									type="radio"
									name="teamSize"
									value="3"
									checked={numberOfMembers === '3'}
									onChange={(e) => setNumberOfMembers(e.target.value)}
									required
								/>{' '}
								3
							</label>
						</div>
					</div>
				)}

				{/* Step 4: Teammate 1 Name */}
				{currentStepKey === 'name2' && (
					<div>
						<label style={labelStyle}>The name of your team-mate:</label>
						<input
							type="text"
							value={name2}
							onChange={(e) => setName2(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							required
						/>
					</div>
				)}

				{/* Step 5: Teammate 1 Email */}
				{currentStepKey === 'email2' && (
					<div>
						<label style={labelStyle}>
							The E-Mail Address of your team-mate:
						</label>
						<input
							type="email"
							value={email2}
							onChange={(e) => setEmail2(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							required
						/>
					</div>
				)}

				{/* Step 6: Teammate 2 Name (conditional) */}
				{currentStepKey === 'name3' && (
					<div>
						<label style={labelStyle}>The name of your second team-mate:</label>
						<input
							type="text"
							value={name3}
							onChange={(e) => setName3(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							required
						/>
					</div>
				)}

				{/* Step 7: Teammate 2 Email (conditional) */}
				{currentStepKey === 'email3' && (
					<div>
						<label style={labelStyle}>
							The E-Mail Address of your second team-mate:
						</label>
						<input
							type="email"
							value={email3}
							onChange={(e) => setEmail3(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							required
						/>
					</div>
				)}

				{/* Step 8: Group Colors */}
				{currentStepKey === 'colors' && (
					<div>
						<h3 style={{ textAlign: 'center', marginBottom: '20px' }}>
							Your team's favourite colors
						</h3>
						<label style={labelStyle}>Color 1:</label>
						<input
							type="text"
							value={color1}
							onChange={(e) => setColor1(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							placeholder="e.g., Bright-Blue"
							required
						/>
						<label style={labelStyle}>Color 2:</label>
						<input
							type="text"
							value={color2}
							onChange={(e) => setColor2(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							placeholder="e.g., Dark-Green"
							required
						/>
						<label style={labelStyle}>Color 3:</label>
						<input
							type="text"
							value={color3}
							onChange={(e) => setColor3(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							placeholder="e.g., Pink"
							required
						/>
					</div>
				)}

				{/* Step 9: Group Animals */}
				{currentStepKey === 'animals' && (
					<div>
						<h3 style={{ textAlign: 'center', marginBottom: '20px' }}>
							Your team's favourite animals
						</h3>
						<label style={labelStyle}>Animal 1:</label>
						<input
							type="text"
							value={animal1}
							onChange={(e) => setAnimal1(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							placeholder="e.g., Dolphin"
							required
						/>
						<label style={labelStyle}>Animal 2:</label>
						<input
							type="text"
							value={animal2}
							onChange={(e) => setAnimal2(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							placeholder="e.g., Axolotl"
							required
						/>
						<label style={labelStyle}>Animal 3:</label>
						<input
							type="text"
							value={animal3}
							onChange={(e) => setAnimal3(e.target.value)}
							onKeyDown={handleKeyDown}
							style={inputStyle}
							placeholder="e.g., Tiger"
							required
						/>
					</div>
				)}

				<div style={{ textAlign: 'center' }}>
					{currentStep > 0 && (
						<button type="button" onClick={handleBack} style={buttonStyle}>
							Back
						</button>
					)}
					{currentStep === stepList.length - 1 ? (
						<button type="submit" style={buttonStyle}>
							Submit Registration
						</button>
					) : (
						<button type="button" onClick={handleNext} style={buttonStyle}>
							Next
						</button>
					)}
				</div>
			</form>
		</div>
	);
}

export default EventSignup;
