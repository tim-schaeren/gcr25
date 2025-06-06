import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import AdminSidebar from './AdminSidebar';

function RegistrationManagement({ db }) {
	const [groups, setGroups] = useState([]);

	useEffect(() => {
		const groupsRef = collection(db, 'eventSignups');
		const groupsQuery = query(groupsRef, orderBy('submittedAt', 'asc'));

		const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
			const groupsList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setGroups(groupsList);
		});

		return () => unsubscribe();
	}, [db]);

	return (
		<div className="min-h-screen h-screen min-w-screen w-screen bg-gray-100 py-20 px-4">
			<div className="sm:flex w-full max-w-screen mx-auto">
				{/* Sidebar */}
				<AdminSidebar db={db} />
				<div className="flex-1">
					<div className="bg-white shadow-lg rounded-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold text-gray-700 mb-4">
							📂 Registration Management
						</h2>
						<table className="w-full text-center border border-gray-300 rounded-lg">
							<thead className="bg-gray-300 text-gray-700">
								<tr>
									<th className="border border-gray-300 p-4 text-black">
										Names
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Emails
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Colors
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Animals
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Submitted at
									</th>
								</tr>
							</thead>
							<tbody>
								{groups.map((group) => (
									<tr
										key={group.id}
										className="odd:bg-white even:bg-gray-100 hover:bg-gray-200"
									>
										{/* Using whiteSpace: 'pre-line' so newlines in the string will be rendered as line breaks */}
										<td
											className="border border-gray-300 p-4 text-black font-semibold"
											style={{ whiteSpace: 'pre-line' }}
										>
											{[group.name1, group.name2, group.name3]
												.filter(Boolean)
												.join('\n')}
										</td>
										<td
											className="border border-gray-300 p-4 text-black font-semibold"
											style={{ whiteSpace: 'pre-line' }}
										>
											{[group.email1, group.email2, group.email3]
												.filter(Boolean)
												.join('\n')}
										</td>
										<td
											className="border border-gray-300 p-4 text-black font-semibold"
											style={{ whiteSpace: 'pre-line' }}
										>
											{[group.color1, group.color2, group.color3]
												.filter(Boolean)
												.join('\n')}
										</td>
										<td
											className="border border-gray-300 p-4 text-black font-semibold"
											style={{ whiteSpace: 'pre-line' }}
										>
											{[group.animal1, group.animal2, group.animal3]
												.filter(Boolean)
												.join('\n')}
										</td>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											{group.submittedAt && group.submittedAt.toDate
												? group.submittedAt.toDate().toLocaleString()
												: group.submittedAt}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	);
}

export default RegistrationManagement;
