import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, doc, deleteDoc } from "firebase/firestore";

function GroupManagement({ db }) {
  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  useEffect(() => {
    const fetchGroups = async () => {
      const groupsRef = collection(db, "groups");
      const groupsSnap = await getDocs(groupsRef);
      const groupList = groupsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setGroups(groupList);
    };

    fetchGroups();
  }, [db]);

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const groupsRef = collection(db, "groups");
    await addDoc(groupsRef, { name: newGroupName });
    setNewGroupName("");
    setCreateModalOpen(false);
  };

  const deleteGroup = async () => {
    if (!selectedGroup) return;
    const groupRef = doc(db, "groups", selectedGroup);
    await deleteDoc(groupRef);
    setDeleteModalOpen(false);
    setSelectedGroup(null);
  };

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-gray-800 mb-6">📂 Group Management</h2>
      
      <button
        onClick={() => setCreateModalOpen(true)}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
      >
        ➕ Create Group
      </button>

      <div className="mt-6 bg-white shadow-md rounded-lg p-4">
        <h3 className="text-xl font-semibold text-gray-700 mb-3">Existing Groups</h3>
        <ul>
          {groups.map(group => (
            <li key={group.id} className="flex justify-between p-3 border-b">
              <span className="text-gray-800">{group.name}</span>
              <button
                onClick={() => {
                  setSelectedGroup(group.id);
                  setDeleteModalOpen(true);
                }}
                className="text-red-600 hover:text-red-800"
              >
                ❌ Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Create Group Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Create New Group</h3>
            <input
              type="text"
              placeholder="Group Name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full p-2 border rounded-md mb-4"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={createGroup}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Delete Group</h3>
            <p>Are you sure you want to delete this group?</p>
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={deleteGroup}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GroupManagement;
