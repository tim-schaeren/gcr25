import React, { useEffect, useState } from 'react';
import {
	collection,
	getDocs,
	doc,
	getDoc,
	updateDoc,
} from 'firebase/firestore';

const DefaultItem = ({ team, selectedItem, db, onClose, targetCoords }) => {
	return (
		<div className="relative">
			<h3 className="text-xl font-semibold mb-4">
				Your gamemasters messed up and did not set this item up correctly.
				<br />
				Bad gamemasters.
			</h3>
		</div>
	);
};

export default DefaultItem;
